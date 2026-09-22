import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRecruitingContext, type RecruitingContext } from "./recruitingClient";
import { ITALIAN_REGIONS, REGION_CENTERS, normalizeItalianRegion } from "./recruitingData";

type Candidate = {
  id: string;
  fullName: string;
  operationalZone: string;
  sectorEnergy: boolean;
  sectorOther: string;
  phone: string;
  email: string;
};

type ContactNote = {
  id: string;
  candidateId: string;
  noteDate: string;
  noteText: string;
  createdAt: string;
};

type EventType = "CHIAMARE" | "APPUNTAMENTO_ZONA" | "APPUNTAMENTO_SEDE" | "VIDEOCALL" | "ALTRO";

type RecruitingEvent = {
  id: string;
  candidateId: string | null;
  eventDate: string;
  eventTime: string;
  eventType: EventType;
  customType: string;
  notes: string;
  completed: boolean;
};

type Macroarea = {
  id: string;
  name: string;
  regions: string[];
};

type ActiveAgent = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  zone: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
};

const EVENT_LABELS: Record<EventType, string> = {
  CHIAMARE: "CHIAMARE",
  APPUNTAMENTO_ZONA: "APPUNTAMENTO IN ZONA",
  APPUNTAMENTO_SEDE: "APPUNTAMENTO IN SEDE",
  VIDEOCALL: "VIDEOCALL",
  ALTRO: "ALTRO",
};

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "9px 11px",
  fontSize: 14,
  background: "white",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
};

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string) {
  return value ? value.slice(0, 5) : "";
}

function candidateFromRow(row: any): Candidate {
  return {
    id: String(row.id),
    fullName: String(row.full_name || ""),
    operationalZone: String(row.operational_zone || ""),
    sectorEnergy: row.sector_energy !== false,
    sectorOther: String(row.sector_other || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
  };
}

function noteFromRow(row: any): ContactNote {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    noteDate: String(row.note_date || ""),
    noteText: String(row.note_text || ""),
    createdAt: String(row.created_at || ""),
  };
}

function eventFromRow(row: any): RecruitingEvent {
  return {
    id: String(row.id),
    candidateId: row.candidate_id ? String(row.candidate_id) : null,
    eventDate: String(row.event_date || ""),
    eventTime: String(row.event_time || ""),
    eventType: String(row.event_type || "CHIAMARE") as EventType,
    customType: String(row.custom_type || ""),
    notes: String(row.notes || ""),
    completed: Boolean(row.completed),
  };
}

function activeAgentFromRow(row: any): ActiveAgent {
  return {
    id: String(row.id),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    phone: String(row.phone || ""),
    zone: String(row.zone || ""),
    region: String(row.region || ""),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
  };
}

function eventDisplayLabel(event: RecruitingEvent) {
  return event.eventType === "ALTRO" && event.customType.trim()
    ? event.customType.trim().toUpperCase()
    : EVENT_LABELS[event.eventType];
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getMonthCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const mondayIndex = (first.getDay() + 6) % 7;
  const cells: Array<{ dateKey: string; day: number; inMonth: boolean }> = [];

  for (let i = mondayIndex - 1; i >= 0; i -= 1) {
    const d = new Date(year, month - 1, -i);
    cells.push({ dateKey: localDateKey(d), day: d.getDate(), inMonth: false });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const d = new Date(year, month - 1, day);
    cells.push({ dateKey: localDateKey(d), day, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const offset = cells.length - mondayIndex - last.getDate() + 1;
    const d = new Date(year, month, offset);
    cells.push({ dateKey: localDateKey(d), day: d.getDate(), inMonth: false });
  }

  return cells;
}

export default function Recruiting() {
  const [ctx, setCtx] = useState<RecruitingContext | null>(null);
  const [section, setSection] = useState<"contacts" | "calendar" | "map">("contacts");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [events, setEvents] = useState<RecruitingEvent[]>([]);
  const [macroareas, setMacroareas] = useState<Macroarea[]>([]);
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);

  const [search, setSearch] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);

  const [newName, setNewName] = useState("");
  const [newZone, setNewZone] = useState("");
  const [newSectorEnergy, setNewSectorEnergy] = useState(true);
  const [newSectorOther, setNewSectorOther] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [editName, setEditName] = useState("");
  const [editZone, setEditZone] = useState("");
  const [editSectorEnergy, setEditSectorEnergy] = useState(true);
  const [editSectorOther, setEditSectorOther] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [noteDate, setNoteDate] = useState(localDateKey());
  const [noteText, setNoteText] = useState("");

  const [activityType, setActivityType] = useState<EventType>("CHIAMARE");
  const [activityCustom, setActivityCustom] = useState("");
  const [activityDate, setActivityDate] = useState(localDateKey());
  const [activityTime, setActivityTime] = useState("");
  const [activityNotes, setActivityNotes] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(localMonthKey());
  const [calendarCandidateId, setCalendarCandidateId] = useState("");
  const [calendarType, setCalendarType] = useState<EventType>("CHIAMARE");
  const [calendarCustom, setCalendarCustom] = useState("");
  const [calendarDate, setCalendarDate] = useState(localDateKey());
  const [calendarTime, setCalendarTime] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");

  const [mapMode, setMapMode] = useState<"italy" | "region" | "macroarea">("italy");
  const [mapRegion, setMapRegion] = useState<string>("Umbria");
  const [mapMacroareaId, setMapMacroareaId] = useState("");
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const loadAll = async (context?: RecruitingContext) => {
    const active = context || ctx || (await getRecruitingContext());
    if (!ctx) setCtx(active);

    const [
      candidatesResult,
      notesResult,
      eventsResult,
      macroResult,
      macroRegionsResult,
      activeAgentsResult,
    ] = await Promise.all([
      active.client
        .from("recruiting_candidates")
        .select("id,full_name,operational_zone,sector_energy,sector_other,phone,email")
        .order("full_name", { ascending: true }),
      active.client
        .from("recruiting_notes")
        .select("id,candidate_id,note_date,note_text,created_at")
        .order("note_date", { ascending: false })
        .order("created_at", { ascending: false }),
      active.client
        .from("recruiting_events")
        .select("id,candidate_id,event_date,event_time,event_type,custom_type,notes,completed")
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true }),
      active.client
        .from("recruiting_macroareas")
        .select("id,name")
        .order("name", { ascending: true }),
      active.client
        .from("recruiting_macroarea_regions")
        .select("macroarea_id,region"),
      active.client
        .from("recruiting_active_agents")
        .select("id,first_name,last_name,phone,zone,region,latitude,longitude")
        .order("last_name", { ascending: true }),
    ]);

    for (const result of [
      candidatesResult,
      notesResult,
      eventsResult,
      macroResult,
      macroRegionsResult,
      activeAgentsResult,
    ]) {
      if (result.error) throw result.error;
    }

    const nextCandidates = (candidatesResult.data || []).map(candidateFromRow);
    setCandidates(nextCandidates);
    setNotes((notesResult.data || []).map(noteFromRow));
    setEvents((eventsResult.data || []).map(eventFromRow));
    setActiveAgents((activeAgentsResult.data || []).map(activeAgentFromRow));

    const regionMap = new Map<string, string[]>();
    (macroRegionsResult.data || []).forEach((row: any) => {
      const id = String(row.macroarea_id);
      const list = regionMap.get(id) || [];
      list.push(String(row.region));
      regionMap.set(id, list);
    });

    const nextMacroareas = (macroResult.data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
      regions: (regionMap.get(String(row.id)) || []).sort((a, b) => a.localeCompare(b, "it")),
    }));
    setMacroareas(nextMacroareas);

    if (!selectedCandidateId && nextCandidates.length) {
      setSelectedCandidateId(nextCandidates[0].id);
    }
    if (!mapMacroareaId && nextMacroareas.length) {
      setMapMacroareaId(nextMacroareas[0].id);
    }
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const context = await getRecruitingContext();
        setCtx(context);
        await loadAll(context);
      } catch (error: any) {
        console.error(error);
        setMessage("Errore nel caricamento RECRUITING: " + (error?.message || error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) || null;

  useEffect(() => {
    if (!selectedCandidate) return;
    setEditName(selectedCandidate.fullName);
    setEditZone(selectedCandidate.operationalZone);
    setEditSectorEnergy(selectedCandidate.sectorEnergy);
    setEditSectorOther(selectedCandidate.sectorOther);
    setEditPhone(selectedCandidate.phone);
    setEditEmail(selectedCandidate.email);
  }, [selectedCandidateId, selectedCandidate?.fullName]);

  const filteredCandidates = useMemo(() => {
    const needle = search
      .trim()
      .toLocaleLowerCase("it")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (!needle) return candidates;

    return candidates.filter((candidate) =>
      [
        candidate.fullName,
        candidate.operationalZone,
        candidate.phone,
        candidate.email,
        candidate.sectorEnergy ? "si settore energia" : candidate.sectorOther,
      ]
        .join(" ")
        .toLocaleLowerCase("it")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes(needle)
    );
  }, [candidates, search]);

  const selectedNotes = useMemo(
    () =>
      notes
        .filter((note) => note.candidateId === selectedCandidateId)
        .sort((a, b) =>
          `${b.noteDate}|${b.createdAt}`.localeCompare(`${a.noteDate}|${a.createdAt}`)
        ),
    [notes, selectedCandidateId]
  );

  const selectedFutureEvents = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.candidateId === selectedCandidateId &&
            event.eventDate >= localDateKey() &&
            !event.completed
        )
        .sort((a, b) =>
          `${a.eventDate}|${a.eventTime}`.localeCompare(`${b.eventDate}|${b.eventTime}`)
        ),
    [events, selectedCandidateId]
  );

  const createCandidate = async () => {
    if (!ctx) return;
    if (!newName.trim()) {
      setMessage("Inserisci nome e cognome.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await ctx.client
        .from("recruiting_candidates")
        .insert({
          owner_key: ctx.ownerKey,
          full_name: newName.trim(),
          operational_zone: newZone.trim(),
          sector_energy: newSectorEnergy,
          sector_other: newSectorEnergy ? "" : newSectorOther.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim(),
        })
        .select("id")
        .single();

      if (error) throw error;

      setNewName("");
      setNewZone("");
      setNewSectorEnergy(true);
      setNewSectorOther("");
      setNewPhone("");
      setNewEmail("");
      setShowNewContact(false);
      await loadAll(ctx);
      setSelectedCandidateId(String(data.id));
      setMessage("Nuovo contatto inserito.");
    } catch (error: any) {
      setMessage("Errore nell'inserimento del contatto: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const saveCandidate = async () => {
    if (!ctx || !selectedCandidate) return;
    if (!editName.trim()) {
      setMessage("Nome e cognome non possono essere vuoti.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await ctx.client
        .from("recruiting_candidates")
        .update({
          full_name: editName.trim(),
          operational_zone: editZone.trim(),
          sector_energy: editSectorEnergy,
          sector_other: editSectorEnergy ? "" : editSectorOther.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedCandidate.id);

      if (error) throw error;
      await loadAll(ctx);
      setMessage("Scheda contatto aggiornata.");
    } catch (error: any) {
      setMessage("Errore nel salvataggio: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const deleteCandidate = async () => {
    if (!ctx || !selectedCandidate) return;
    if (!window.confirm(`Eliminare definitivamente ${selectedCandidate.fullName}?`)) return;

    setBusy(true);
    try {
      const { error } = await ctx.client
        .from("recruiting_candidates")
        .delete()
        .eq("id", selectedCandidate.id);
      if (error) throw error;

      setSelectedCandidateId(null);
      await loadAll(ctx);
      setMessage("Contatto eliminato.");
    } catch (error: any) {
      setMessage("Errore nell'eliminazione: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!ctx || !selectedCandidate) return;
    if (!noteText.trim()) {
      setMessage("Scrivi la nota prima di salvarla.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await ctx.client.from("recruiting_notes").insert({
        owner_key: ctx.ownerKey,
        candidate_id: selectedCandidate.id,
        note_date: noteDate,
        note_text: noteText.trim(),
      });
      if (error) throw error;

      setNoteText("");
      setNoteDate(localDateKey());
      await loadAll(ctx);
      setMessage("Nota aggiunta.");
    } catch (error: any) {
      setMessage("Errore nel salvataggio della nota: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (note: ContactNote) => {
    if (!ctx || !window.confirm("Eliminare questa nota?")) return;
    const { error } = await ctx.client.from("recruiting_notes").delete().eq("id", note.id);
    if (error) {
      setMessage("Errore nell'eliminazione della nota: " + error.message);
      return;
    }
    await loadAll(ctx);
  };

  const insertEvent = async ({
    candidateId,
    type,
    customType,
    date,
    time,
    notesText,
  }: {
    candidateId: string | null;
    type: EventType;
    customType: string;
    date: string;
    time: string;
    notesText: string;
  }) => {
    if (!ctx) return false;
    if (!date) {
      setMessage("Seleziona la data dell'attività.");
      return false;
    }
    if (type === "ALTRO" && !customType.trim()) {
      setMessage("Scrivi il tipo di attività nella voce ALTRO.");
      return false;
    }

    const { error } = await ctx.client.from("recruiting_events").insert({
      owner_key: ctx.ownerKey,
      candidate_id: candidateId,
      event_date: date,
      event_time: time || null,
      event_type: type,
      custom_type: type === "ALTRO" ? customType.trim() : "",
      notes: notesText.trim(),
    });

    if (error) throw error;
    return true;
  };

  const addActivityFromContact = async () => {
    if (!selectedCandidate) return;
    setBusy(true);
    try {
      const ok = await insertEvent({
        candidateId: selectedCandidate.id,
        type: activityType,
        customType: activityCustom,
        date: activityDate,
        time: activityTime,
        notesText: activityNotes,
      });
      if (!ok) return;

      setActivityType("CHIAMARE");
      setActivityCustom("");
      setActivityDate(localDateKey());
      setActivityTime("");
      setActivityNotes("");
      await loadAll(ctx || undefined);
      setMessage("Attività aggiunta al calendario.");
    } catch (error: any) {
      setMessage("Errore nell'aggiunta al calendario: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const addActivityFromCalendar = async () => {
    setBusy(true);
    try {
      const ok = await insertEvent({
        candidateId: calendarCandidateId || null,
        type: calendarType,
        customType: calendarCustom,
        date: calendarDate,
        time: calendarTime,
        notesText: calendarNotes,
      });
      if (!ok) return;

      setCalendarType("CHIAMARE");
      setCalendarCustom("");
      setCalendarDate(localDateKey());
      setCalendarTime("");
      setCalendarNotes("");
      await loadAll(ctx || undefined);
      setMessage("Attività aggiunta al calendario.");
    } catch (error: any) {
      setMessage("Errore nell'aggiunta al calendario: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const toggleEventCompleted = async (event: RecruitingEvent) => {
    if (!ctx) return;
    const { error } = await ctx.client
      .from("recruiting_events")
      .update({ completed: !event.completed, updated_at: new Date().toISOString() })
      .eq("id", event.id);
    if (error) {
      setMessage("Errore nell'aggiornamento attività: " + error.message);
      return;
    }
    await loadAll(ctx);
  };

  const deleteEvent = async (event: RecruitingEvent) => {
    if (!ctx || !window.confirm("Eliminare questa attività dal calendario?")) return;
    const { error } = await ctx.client.from("recruiting_events").delete().eq("id", event.id);
    if (error) {
      setMessage("Errore nell'eliminazione attività: " + error.message);
      return;
    }
    await loadAll(ctx);
  };

  const candidateName = (candidateId: string | null) =>
    candidates.find((candidate) => candidate.id === candidateId)?.fullName || "Senza contatto";

  const calendarCells = useMemo(() => getMonthCells(calendarMonth), [calendarMonth]);

  const visibleMapRegions = useMemo(() => {
    if (mapMode === "region") return [mapRegion];
    if (mapMode === "macroarea") {
      return macroareas.find((macro) => macro.id === mapMacroareaId)?.regions || [];
    }
    return [] as string[];
  }, [mapMode, mapRegion, mapMacroareaId, macroareas]);

  const visibleMapAgents = useMemo(() => {
    return activeAgents.filter((agent) => {
      if (agent.latitude === null || agent.longitude === null) return false;
      if (mapMode === "italy") return true;
      const region = normalizeItalianRegion(agent.region || agent.zone);
      return visibleMapRegions.includes(region);
    });
  }, [activeAgents, mapMode, visibleMapRegions]);

  useEffect(() => {
    if (section !== "map" || !mapElementRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapElementRef.current, {
        center: [42.6, 12.5],
        zoom: 5,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(mapRef.current);

      markersRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const layer = markersRef.current;
    layer?.clearLayers();

    visibleMapAgents.forEach((agent) => {
      if (agent.latitude === null || agent.longitude === null) return;
      const initials = `${agent.firstName.charAt(0)}${agent.lastName.charAt(0)}`.toUpperCase() || "A";
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:32px;height:32px;border-radius:999px;background:#f97316;color:white;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;">${escapeHtml(initials)}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([agent.latitude, agent.longitude], { icon });
      marker.bindTooltip(escapeHtml(`${agent.firstName} ${agent.lastName}`), {
        direction: "top",
        offset: [0, -14],
      });
      marker.bindPopup(
        `<div style="min-width:190px">
          <div style="font-weight:900;font-size:15px;margin-bottom:7px">${escapeHtml(agent.firstName)} ${escapeHtml(agent.lastName)}</div>
          <div><strong>Nome:</strong> ${escapeHtml(agent.firstName)}</div>
          <div><strong>Cognome:</strong> ${escapeHtml(agent.lastName)}</div>
          <div><strong>Cellulare:</strong> ${escapeHtml(agent.phone || "—")}</div>
          <div><strong>Zona:</strong> ${escapeHtml(agent.zone || "—")}</div>
        </div>`
      );
      marker.addTo(layer!);
    });

    const coords: Array<[number, number]> = visibleMapAgents
      .filter((agent) => agent.latitude !== null && agent.longitude !== null)
      .map((agent) => [agent.latitude as number, agent.longitude as number]);

    if (mapMode === "italy") {
      if (coords.length >= 2) {
        map.fitBounds(coords, { padding: [40, 40], maxZoom: 7 });
      } else {
        map.setView([42.6, 12.5], 5);
      }
    } else if (mapMode === "region") {
      const center = REGION_CENTERS[mapRegion as keyof typeof REGION_CENTERS];
      if (coords.length >= 2) map.fitBounds(coords, { padding: [50, 50], maxZoom: 9 });
      else if (coords.length === 1) map.setView(coords[0], 9);
      else if (center) map.setView(center, 7);
    } else {
      const regionCenters = visibleMapRegions
        .map((region) => REGION_CENTERS[region as keyof typeof REGION_CENTERS])
        .filter(Boolean) as Array<[number, number]>;
      const bounds = coords.length ? coords : regionCenters;
      if (bounds.length >= 2) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 8 });
      else if (bounds.length === 1) map.setView(bounds[0], 7);
      else map.setView([42.6, 12.5], 5);
    }

    window.setTimeout(() => map.invalidateSize(), 50);
  }, [section, mapMode, mapRegion, mapMacroareaId, visibleMapAgents, visibleMapRegions]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const changeCalendarMonth = (delta: number) => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    setCalendarMonth(localMonthKey(d));
  };

  if (loading) return <div style={cardStyle}>Caricamento RECRUITING...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", minWidth: 0 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>RECRUITING</h2>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
              Gestione contatti, note, richiami, appuntamenti e copertura territoriale.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadAll(ctx || undefined)}
            style={{ ...buttonStyle, background: "#e2e8f0" }}
          >
            Aggiorna dati
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["contacts", "CONTATTI"],
          ["calendar", "CALENDARIO"],
          ["map", "MAPPA"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key as "contacts" | "calendar" | "map")}
            style={{
              ...buttonStyle,
              background: section === key ? "#0f172a" : "white",
              color: section === key ? "white" : "#0f172a",
              border: section === key ? "1px solid #0f172a" : "1px solid #cbd5e1",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div
          style={{
            ...cardStyle,
            padding: "10px 12px",
            background: "#eff6ff",
            borderColor: "#bfdbfe",
            color: "#1e3a8a",
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      {section === "contacts" && (
        <>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Database contatti</h3>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  {candidates.length} nominativi presenti
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewContact((value) => !value)}
                style={{ ...buttonStyle, background: "#16a34a", color: "white" }}
              >
                + NUOVO CONTATTO
              </button>
            </div>

            {showNewContact && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  border: "1px solid #bbf7d0",
                  borderRadius: 10,
                  background: "#f0fdf4",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Nome e cognome</label>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Zona operativa</label>
                    <input value={newZone} onChange={(e) => setNewZone(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Settore energia</label>
                    <select
                      value={newSectorEnergy ? "SI" : "NO"}
                      onChange={(e) => setNewSectorEnergy(e.target.value === "SI")}
                      style={inputStyle}
                    >
                      <option value="SI">SI</option>
                      <option value="NO">NO</option>
                    </select>
                  </div>
                  {!newSectorEnergy && (
                    <div>
                      <label style={labelStyle}>Settore attuale</label>
                      <input
                        value={newSectorOther}
                        onChange={(e) => setNewSectorOther(e.target.value)}
                        placeholder="Scrivi il settore"
                        style={inputStyle}
                      />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Numero di telefono</label>
                    <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createCandidate()}
                    style={{ ...buttonStyle, background: "#16a34a", color: "white", opacity: busy ? 0.6 : 1 }}
                  >
                    Salva contatto
                  </button>
                  <button type="button" onClick={() => setShowNewContact(false)} style={{ ...buttonStyle, background: "#e2e8f0" }}>
                    Annulla
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Cerca contatto</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, zona, telefono, email, settore..."
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(290px,38%) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Lista nominativi</h3>
              <div style={{ maxHeight: 720, overflow: "auto", display: "grid", gap: 7 }}>
                {filteredCandidates.map((candidate) => {
                  const active = candidate.id === selectedCandidateId;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      style={{
                        textAlign: "left",
                        border: active ? "2px solid #2563eb" : "1px solid #e2e8f0",
                        background: active ? "#eff6ff" : "white",
                        borderRadius: 10,
                        padding: 11,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{candidate.fullName}</div>
                      <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                        {candidate.operationalZone || "Zona non indicata"} · {candidate.phone || "Telefono non indicato"}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800 }}>
                        Settore energia: {candidate.sectorEnergy ? "SI" : `NO${candidate.sectorOther ? ` · ${candidate.sectorOther}` : ""}`}
                      </div>
                    </button>
                  );
                })}

                {!filteredCandidates.length && (
                  <div style={{ padding: 16, textAlign: "center", color: "#64748b" }}>Nessun contatto trovato.</div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {!selectedCandidate ? (
                <div style={cardStyle}>Seleziona un contatto per aprire la scheda.</div>
              ) : (
                <>
                  <div style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0 }}>Scheda contatto</h3>
                      <button
                        type="button"
                        onClick={() => void deleteCandidate()}
                        style={{ ...buttonStyle, padding: "7px 10px", background: "#fee2e2", color: "#991b1b" }}
                      >
                        Elimina contatto
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 14 }}>
                      <div>
                        <label style={labelStyle}>Nome e cognome</label>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Zona operativa</label>
                        <input value={editZone} onChange={(e) => setEditZone(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Settore energia</label>
                        <select
                          value={editSectorEnergy ? "SI" : "NO"}
                          onChange={(e) => setEditSectorEnergy(e.target.value === "SI")}
                          style={inputStyle}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>
                      {!editSectorEnergy && (
                        <div>
                          <label style={labelStyle}>Settore attuale</label>
                          <input
                            value={editSectorOther}
                            onChange={(e) => setEditSectorOther(e.target.value)}
                            placeholder="Scrivi il settore"
                            style={inputStyle}
                          />
                        </div>
                      )}
                      <div>
                        <label style={labelStyle}>Numero di telefono</label>
                        <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={inputStyle} />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveCandidate()}
                      style={{ ...buttonStyle, marginTop: 12, background: "#2563eb", color: "white", opacity: busy ? 0.6 : 1 }}
                    >
                      Salva modifiche
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,.75fr)", gap: 14, alignItems: "start" }}>
                    <div style={cardStyle}>
                      <h3 style={{ marginTop: 0 }}>Note del contatto</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 9, alignItems: "start" }}>
                        <div>
                          <label style={labelStyle}>Data nota</label>
                          <input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Nuova nota</label>
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={4}
                            placeholder="Scrivi qui l'esito del contatto..."
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void addNote()}
                        style={{ ...buttonStyle, marginTop: 9, background: "#0f172a", color: "white" }}
                      >
                        Aggiungi nota
                      </button>

                      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                        {selectedNotes.map((note) => (
                          <div key={note.id} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: 11 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <strong>{formatDate(note.noteDate)}</strong>
                              <button
                                type="button"
                                onClick={() => void deleteNote(note)}
                                style={{ border: 0, background: "transparent", color: "#b91c1c", fontWeight: 800, cursor: "pointer" }}
                              >
                                Elimina
                              </button>
                            </div>
                            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{note.noteText}</div>
                          </div>
                        ))}
                        {!selectedNotes.length && <div style={{ color: "#64748b" }}>Nessuna nota inserita.</div>}
                      </div>
                    </div>

                    <div style={{ ...cardStyle, borderColor: "#fed7aa", background: "#fff7ed" }}>
                      <h3 style={{ marginTop: 0 }}>Programma attività</h3>
                      <div style={{ color: "#9a3412", fontSize: 13, marginBottom: 11 }}>
                        La chiamata o l'appuntamento verrà inserito nel CALENDARIO.
                      </div>

                      <div>
                        <label style={labelStyle}>Tipo</label>
                        <select value={activityType} onChange={(e) => setActivityType(e.target.value as EventType)} style={inputStyle}>
                          {Object.entries(EVENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>

                      {activityType === "ALTRO" && (
                        <div style={{ marginTop: 9 }}>
                          <label style={labelStyle}>Specifica attività</label>
                          <input value={activityCustom} onChange={(e) => setActivityCustom(e.target.value)} style={inputStyle} />
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, marginTop: 9 }}>
                        <div>
                          <label style={labelStyle}>Data</label>
                          <input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Ora</label>
                          <input type="time" value={activityTime} onChange={(e) => setActivityTime(e.target.value)} style={inputStyle} />
                        </div>
                      </div>

                      <div style={{ marginTop: 9 }}>
                        <label style={labelStyle}>Note attività</label>
                        <textarea value={activityNotes} onChange={(e) => setActivityNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void addActivityFromContact()}
                        style={{ ...buttonStyle, marginTop: 10, background: "#f97316", color: "white" }}
                      >
                        Inserisci nel calendario
                      </button>

                      {selectedFutureEvents.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#9a3412", marginBottom: 6 }}>PROSSIME ATTIVITÀ</div>
                          {selectedFutureEvents.slice(0, 4).map((event) => (
                            <div key={event.id} style={{ padding: "7px 0", borderTop: "1px solid #fed7aa", fontSize: 13 }}>
                              <strong>{formatDate(event.eventDate)}</strong>
                              {event.eventTime && <> · {formatTime(event.eventTime)}</>}
                              <div>{eventDisplayLabel(event)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {section === "calendar" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Nuova attività</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Contatto</label>
                <select value={calendarCandidateId} onChange={(e) => setCalendarCandidateId(e.target.value)} style={inputStyle}>
                  <option value="">Senza contatto</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select value={calendarType} onChange={(e) => setCalendarType(e.target.value as EventType)} style={inputStyle}>
                  {Object.entries(EVENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {calendarType === "ALTRO" && (
                <div>
                  <label style={labelStyle}>Specifica</label>
                  <input value={calendarCustom} onChange={(e) => setCalendarCustom(e.target.value)} style={inputStyle} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Data</label>
                <input type="date" value={calendarDate} onChange={(e) => setCalendarDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Ora</label>
                <input type="time" value={calendarTime} onChange={(e) => setCalendarTime(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Note</label>
                <input value={calendarNotes} onChange={(e) => setCalendarNotes(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => void addActivityFromCalendar()}
                  style={{ ...buttonStyle, background: "#f97316", color: "white", width: "100%" }}
                >
                  Aggiungi
                </button>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => changeCalendarMonth(-1)} style={{ ...buttonStyle, background: "#e2e8f0" }}>← Mese precedente</button>
              <input
                type="month"
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(e.target.value)}
                style={{ ...inputStyle, width: 190, fontWeight: 900 }}
              />
              <button type="button" onClick={() => changeCalendarMonth(1)} style={{ ...buttonStyle, background: "#e2e8f0" }}>Mese successivo →</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(120px,1fr))", gap: 1, background: "#cbd5e1", marginTop: 14, border: "1px solid #cbd5e1", overflowX: "auto" }}>
              {["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"].map((day) => (
                <div key={day} style={{ background: "#f8fafc", padding: 8, textAlign: "center", fontWeight: 900, fontSize: 12 }}>{day}</div>
              ))}

              {calendarCells.map((cell) => {
                const dayEvents = events
                  .filter((event) => event.eventDate === cell.dateKey)
                  .sort((a, b) => (a.eventTime || "").localeCompare(b.eventTime || ""));

                return (
                  <div
                    key={cell.dateKey}
                    style={{
                      minHeight: 125,
                      background: cell.inMonth ? "white" : "#f8fafc",
                      padding: 7,
                      opacity: cell.inMonth ? 1 : 0.65,
                    }}
                  >
                    <div style={{ fontWeight: 900, marginBottom: 5 }}>{cell.day}</div>
                    <div style={{ display: "grid", gap: 5 }}>
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          style={{
                            borderRadius: 7,
                            padding: 6,
                            background: event.completed ? "#e2e8f0" : "#fff7ed",
                            border: event.completed ? "1px solid #cbd5e1" : "1px solid #fed7aa",
                            fontSize: 11,
                            textDecoration: event.completed ? "line-through" : "none",
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>
                            {event.eventTime ? `${formatTime(event.eventTime)} · ` : ""}
                            {eventDisplayLabel(event)}
                          </div>
                          <div>{candidateName(event.candidateId)}</div>
                          {event.notes && <div style={{ marginTop: 2, color: "#475569" }}>{event.notes}</div>}
                          <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                            <button
                              type="button"
                              onClick={() => void toggleEventCompleted(event)}
                              style={{ border: 0, borderRadius: 5, padding: "3px 5px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                            >
                              {event.completed ? "Riapri" : "Fatto"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteEvent(event)}
                              style={{ border: 0, background: "#fee2e2", color: "#991b1b", borderRadius: 5, padding: "3px 5px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {section === "map" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Cartina agenti attivi</h3>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              I punti arancioni provengono da DATI → GESTIONE RECRUITING → ASSEGNAZIONE ZONE.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div>
                <label style={labelStyle}>Visualizzazione</label>
                <select value={mapMode} onChange={(e) => setMapMode(e.target.value as "italy" | "region" | "macroarea")} style={inputStyle}>
                  <option value="italy">ITALIA</option>
                  <option value="region">SINGOLA REGIONE</option>
                  <option value="macroarea">MACROAREA</option>
                </select>
              </div>

              {mapMode === "region" && (
                <div>
                  <label style={labelStyle}>Regione</label>
                  <select value={mapRegion} onChange={(e) => setMapRegion(e.target.value)} style={inputStyle}>
                    {ITALIAN_REGIONS.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </div>
              )}

              {mapMode === "macroarea" && (
                <div>
                  <label style={labelStyle}>Macroarea</label>
                  <select value={mapMacroareaId} onChange={(e) => setMapMacroareaId(e.target.value)} style={inputStyle}>
                    {!macroareas.length && <option value="">Nessuna macroarea creata</option>}
                    {macroareas.map((macro) => (
                      <option key={macro.id} value={macro.id}>{macro.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 10 }}>
            <div
              ref={mapElementRef}
              style={{
                height: 600,
                width: "100%",
                borderRadius: 10,
                overflow: "hidden",
                background: "#e2e8f0",
              }}
            />
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Agenti visualizzati ({visibleMapAgents.length})</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
              {visibleMapAgents.map((agent) => (
                <div key={agent.id} style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 9, padding: 10 }}>
                  <strong>{agent.firstName} {agent.lastName}</strong>
                  <div style={{ marginTop: 4, fontSize: 13 }}>Cellulare: {agent.phone || "—"}</div>
                  <div style={{ fontSize: 13 }}>Zona: {agent.zone || "—"}</div>
                </div>
              ))}
              {!visibleMapAgents.length && (
                <div style={{ color: "#64748b" }}>Nessun agente attivo posizionato nell'area selezionata.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
