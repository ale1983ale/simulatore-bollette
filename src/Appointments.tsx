import React, { useEffect, useMemo, useState } from "react";
import { getRecruitingContext, type RecruitingContext } from "./recruitingClient";
import {
  getGoogleCalendarStatus,
  syncGoogleCalendarEvent,
} from "./googleCalendar";

type EventType =
  | "CHIAMARE"
  | "APPUNTAMENTO_ZONA"
  | "APPUNTAMENTO_SEDE"
  | "VIDEOCALL"
  | "ALTRO";

type Candidate = {
  id: string;
  fullName: string;
  operationalZone: string;
  phone: string;
  email: string;
  status: string;
  provinceCode: string;
  region: string;
  sectorEnergy: boolean;
  sectorOther: string;
  companyName: string;
};

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

type CrmEvent = {
  id: string;
  crmEventId: string;
  title: string;
  notes: string;
  clientName: string;
  assignedTo: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

type UnifiedAppointment =
  | {
      key: string;
      source: "recruiting";
      date: string;
      time: string;
      recruiting: RecruitingEvent;
      crm?: never;
    }
  | {
      key: string;
      source: "crm";
      date: string;
      time: string;
      crm: CrmEvent;
      recruiting?: never;
    };

const EVENT_LABELS: Record<EventType, string> = {
  CHIAMARE: "CHIAMARE",
  APPUNTAMENTO_ZONA: "APP. IN ZONA",
  APPUNTAMENTO_SEDE: "APP. IN SEDE",
  VIDEOCALL: "VIDEOCALL",
  ALTRO: "ALTRO",
};

const EVENT_COLORS: Record<
  EventType,
  { background: string; color: string; border: string }
> = {
  CHIAMARE: {
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "#60a5fa",
  },
  APPUNTAMENTO_ZONA: {
    background: "#ffedd5",
    color: "#c2410c",
    border: "#fb923c",
  },
  APPUNTAMENTO_SEDE: {
    background: "#f3e8ff",
    color: "#7e22ce",
    border: "#c084fc",
  },
  VIDEOCALL: {
    background: "#dcfce7",
    color: "#15803d",
    border: "#4ade80",
  },
  ALTRO: {
    background: "#e2e8f0",
    color: "#334155",
    border: "#94a3b8",
  },
};

const baseButton: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 12px",
  background: "white",
  color: "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 10px",
  background: "white",
  color: "#0f172a",
};

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 16,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
};

function localDateKey() {
  const value = new Date();
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function formatShortDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function plainText(value: string) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function crmMapUrl(event: CrmEvent) {
  const raw = `${event.notes || ""}\n${event.title || ""}`.replace(
    /&amp;/gi,
    "&"
  );

  const href = raw.match(
    /href\s*=\s*["'](https?:\/\/[^"']*(?:maps|goo\.gl|google)[^"']*)["']/i
  );
  if (href?.[1]) return href[1];

  const bare = raw.match(
    /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[^\s"'<>]+\/maps)[^\s"'<>]*/i
  );

  return bare?.[0] || "";
}

function crmPhones(event: CrmEvent) {
  const text = plainText(`${event.notes || ""} ${event.title || ""}`);
  const result: Array<{ display: string; dial: string }> = [];
  const seen = new Set<string>();
  const matches = text.matchAll(
    /(?:^|[^\d])((?:(?:\+|00)39[\s./-]*)?(?:\d[\s./-]*){9,11})(?=$|[^\d])/g
  );

  for (const match of matches) {
    const display = String(match[1] || "").trim();
    let digits = display.replace(/\D/g, "");
    if (digits.startsWith("0039")) digits = digits.slice(2);

    const local =
      digits.startsWith("39") && digits.length >= 11
        ? digits.slice(2)
        : digits;

    if (local.length < 9 || local.length > 11) continue;
    if (!/^[03]/.test(local)) continue;

    const key = digits || local;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      display,
      dial:
        digits.startsWith("39") && digits.length >= 11
          ? `+${digits}`
          : local,
    });
  }

  return result;
}

const PROVINCE_CODES = new Set(
  "AG AL AN AO AP AQ AR AT AV BA BG BI BL BN BO BR BS BT BZ CA CB CE CH CI CL CN CO CR CS CT CZ EN FC FE FG FI FM FR GE GO GR IM IS KR LC LE LI LO LT LU MB MC ME MI MN MO MS MT NA NO NU OG OR OT PA PC PD PE PG PI PN PO PR PT PU PV PZ RA RC RE RG RI RM RN RO SA SI SO SP SR SS SU SV TA TE TN TO TP TR TS TV UD VA VB VC VE VI VR VS VT VV".split(
    " "
  )
);

function crmZone(event: CrmEvent) {
  const raw = String(`${event.notes || ""}\n${event.title || ""}`)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const line = raw[index].toLocaleUpperCase("it");
    const withProvince = line.match(
      /(?:\b\d{5}\s+)?([A-ZÀÈÉÌÒÙ][A-ZÀÈÉÌÒÙ'’.\-]*(?:\s+[A-ZÀÈÉÌÒÙ][A-ZÀÈÉÌÒÙ'’.\-]*){0,3})\s*\(([A-Z]{2})\)/
    );

    if (withProvince && PROVINCE_CODES.has(withProvince[2])) {
      return `${withProvince[1].trim()} · ${withProvince[2]}`;
    }
  }

  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const line = raw[index].trim();
    if (!line || /https?:\/\//i.test(line)) continue;
    if (/\b(?:CELLULARE|FISSO|TEL|EMAIL|REFERENTE|RECESSO)\b/i.test(line)) {
      continue;
    }
    if (/\d{5,}/.test(line) || line.length > 40) continue;

    const clean = line
      .replace(/[^A-Za-zÀ-ÿ'’\-\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (clean && clean.split(" ").length <= 4) {
      return clean.toLocaleUpperCase("it");
    }
  }

  return "";
}

function crmClientName(event: CrmEvent) {
  const value = plainText(event.clientName || event.title || "");
  return (
    value
      .replace(
        /^(APP\.FIS|APPUNTAMENTO FISSATO|CLI\.ASS|VALUTA|OK|KO|ASSENTE|IMPEGNA)\s+/i,
        ""
      )
      .trim() || "CLIENTE CRM"
  );
}

function candidateFromRow(row: any): Candidate {
  return {
    id: String(row.id),
    fullName: String(row.full_name || ""),
    operationalZone: String(row.operational_zone || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    status: String(row.contact_status || ""),
    provinceCode: String(row.province_code || ""),
    region: String(row.region || ""),
    sectorEnergy: Boolean(row.sector_energy),
    sectorOther: String(row.sector_other || ""),
    companyName: String(row.company_name || ""),
  };
}

function recruitingEventFromRow(row: any): RecruitingEvent {
  return {
    id: String(row.id),
    candidateId: row.candidate_id ? String(row.candidate_id) : null,
    eventDate: String(row.event_date || ""),
    eventTime: String(row.event_time || "").slice(0, 5),
    eventType: String(row.event_type || "CHIAMARE") as EventType,
    customType: String(row.custom_type || ""),
    notes: String(row.notes || ""),
    completed: Boolean(row.completed),
  };
}

function crmEventFromRow(row: any): CrmEvent {
  return {
    id: String(row.id),
    crmEventId: String(row.crm_event_id || ""),
    title: String(row.title || ""),
    notes: String(row.notes || ""),
    clientName: String(row.client_name || ""),
    assignedTo: String(row.assigned_to || ""),
    startDate: String(row.start_date || ""),
    startTime: String(row.start_time || "").slice(0, 5),
    endDate: String(row.end_date || ""),
    endTime: String(row.end_time || "").slice(0, 5),
  };
}

export default function Appointments() {
  const [ctx, setCtx] = useState<RecruitingContext | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [events, setEvents] = useState<RecruitingEvent[]>([]);
  const [crmEvents, setCrmEvents] = useState<CrmEvent[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "ALL" | "RECRUITING" | "CRM"
  >("ALL");
  const [showPast, setShowPast] = useState(false);

  const [activityType, setActivityType] =
    useState<EventType>("APPUNTAMENTO_ZONA");
  const [activityCustom, setActivityCustom] = useState("");
  const [activityDate, setActivityDate] = useState(localDateKey());
  const [activityTime, setActivityTime] = useState("");
  const [activityNotes, setActivityNotes] = useState("");

  const loadData = async (context?: RecruitingContext) => {
    const active = context || ctx || (await getRecruitingContext());
    if (!ctx) setCtx(active);

    const [candidateResult, eventResult, crmResult] = await Promise.all([
      active.client
        .from("recruiting_candidates")
        .select(
          "id,full_name,operational_zone,phone,email,contact_status,province_code,region,sector_energy,sector_other,company_name"
        )
        .order("full_name", { ascending: true }),
      active.client
        .from("recruiting_events")
        .select(
          "id,candidate_id,event_date,event_time,event_type,custom_type,notes,completed"
        )
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true }),
      active.client
        .from("recruiting_crm_events")
        .select(
          "id,crm_event_id,title,notes,client_name,assigned_to,start_date,start_time,end_date,end_time,active"
        )
        .eq("active", true)
        .order("start_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

    if (candidateResult.error) throw candidateResult.error;
    if (eventResult.error) throw eventResult.error;
    if (crmResult.error) throw crmResult.error;

    const nextCandidates = (candidateResult.data || []).map(candidateFromRow);
    const nextEvents = (eventResult.data || []).map(recruitingEventFromRow);
    const nextCrm = (crmResult.data || []).map(crmEventFromRow);

    setCandidates(nextCandidates);
    setEvents(nextEvents);
    setCrmEvents(nextCrm);

    const allKeys = [
      ...nextEvents.map((event) => ({
        key: `recruiting:${event.id}`,
        date: event.eventDate,
        time: event.eventTime,
      })),
      ...nextCrm.map((event) => ({
        key: `crm:${event.id}`,
        date: event.startDate,
        time: event.startTime,
      })),
    ].sort((a, b) =>
      `${a.date} ${a.time || "00:00"}`.localeCompare(
        `${b.date} ${b.time || "00:00"}`
      )
    );

    const today = localDateKey();
    const next =
      allKeys.find((item) => item.date >= today)?.key ||
      allKeys[allKeys.length - 1]?.key ||
      "";

    setSelectedKey((current) =>
      current && allKeys.some((item) => item.key === current)
        ? current
        : next
    );
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const context = await getRecruitingContext();
        setCtx(context);
        await loadData(context);
      } catch (error: any) {
        setMessage(
          "Errore nel caricamento appuntamenti: " +
            (error?.message || String(error))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const candidateMap = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates]
  );

  const unified = useMemo<UnifiedAppointment[]>(() => {
    const rows: UnifiedAppointment[] = [
      ...events.map((event) => ({
        key: `recruiting:${event.id}`,
        source: "recruiting" as const,
        date: event.eventDate,
        time: event.eventTime,
        recruiting: event,
      })),
      ...crmEvents.map((event) => ({
        key: `crm:${event.id}`,
        source: "crm" as const,
        date: event.startDate,
        time: event.startTime,
        crm: event,
      })),
    ];

    return rows.sort((a, b) =>
      `${a.date} ${a.time || "00:00"}`.localeCompare(
        `${b.date} ${b.time || "00:00"}`
      )
    );
  }, [events, crmEvents]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("it");
    const today = localDateKey();

    return unified.filter((item) => {
      if (!showPast && item.date < today) return false;
      if (sourceFilter === "RECRUITING" && item.source !== "recruiting") {
        return false;
      }
      if (sourceFilter === "CRM" && item.source !== "crm") return false;

      if (!needle) return true;

      if (item.source === "crm") {
        const crm = item.crm;
        return [
          crmClientName(crm),
          crm.title,
          plainText(crm.notes),
          crm.assignedTo,
          crmZone(crm),
        ]
          .join(" ")
          .toLocaleLowerCase("it")
          .includes(needle);
      }

      const event = item.recruiting;
      const candidate = event.candidateId
        ? candidateMap.get(event.candidateId)
        : null;

      return [
        candidate?.fullName,
        candidate?.operationalZone,
        candidate?.provinceCode,
        candidate?.region,
        EVENT_LABELS[event.eventType],
        event.customType,
        event.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(needle);
    });
  }, [
    unified,
    search,
    sourceFilter,
    showPast,
    candidateMap,
  ]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedKey("");
      return;
    }

    if (!filtered.some((item) => item.key === selectedKey)) {
      setSelectedKey(filtered[0].key);
    }
  }, [filtered, selectedKey]);

  const selected =
    filtered.find((item) => item.key === selectedKey) ||
    unified.find((item) => item.key === selectedKey) ||
    null;

  const selectedCandidate =
    selected?.source === "recruiting" &&
    selected.recruiting.candidateId
      ? candidateMap.get(selected.recruiting.candidateId) || null
      : null;

  const scheduleActivity = async () => {
    if (!ctx || !selected) return;

    if (!activityDate) {
      setMessage("Seleziona la data della nuova attività.");
      return;
    }

    if (activityType === "ALTRO" && !activityCustom.trim()) {
      setMessage("Scrivi la tipologia dell'attività.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      let notes = activityNotes.trim();

      if (selected.source === "crm") {
        const reference =
          `CRM +ENERGIA #${selected.crm.crmEventId} · ${crmClientName(
            selected.crm
          )}`;
        notes = notes ? `${reference}\n${notes}` : reference;
      }

      const candidateId =
        selected.source === "recruiting"
          ? selected.recruiting.candidateId
          : null;

      const { data, error } = await ctx.client
        .from("recruiting_events")
        .insert({
          owner_key: ctx.ownerKey,
          candidate_id: candidateId,
          event_date: activityDate,
          event_time: activityTime || null,
          event_type: activityType,
          custom_type:
            activityType === "ALTRO"
              ? activityCustom.trim()
              : "",
          notes,
          completed: false,
        })
        .select("id")
        .single();

      if (error) throw error;

      let googleMessage = "";
      try {
        const googleStatus = await getGoogleCalendarStatus();
        if (
          googleStatus.connected &&
          !googleStatus.needs_reconnect
        ) {
          await syncGoogleCalendarEvent(String(data.id));
          googleMessage = " e sincronizzata con Google Calendar";
        }
      } catch (googleError) {
        console.warn("APPOINTMENTS GOOGLE SYNC ERROR:", googleError);
        googleMessage =
          ". Attività salvata, ma la sincronizzazione Google non è riuscita";
      }

      setActivityNotes("");
      setActivityCustom("");
      await loadData(ctx);
      setMessage(
        `Attività inserita nel calendario${googleMessage}.`
      );
    } catch (error: any) {
      setMessage(
        "Errore nell'inserimento dell'attività: " +
          (error?.message || String(error))
      );
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setSourceFilter("ALL");
    setShowPast(false);
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <strong>Caricamento appuntamenti...</strong>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        width: "100%",
        minWidth: 0,
      }}
    >
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>APPUNTAMENTI</h2>
            <div
              style={{
                marginTop: 4,
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Recruiting e CRM +ENERGIA in un unico elenco cronologico.
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            style={{
              ...baseButton,
              background: "#e2e8f0",
            }}
          >
            AGGIORNA DATI
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(220px,1.5fr) minmax(180px,.8fr) minmax(160px,.7fr) auto",
            gap: 10,
            alignItems: "end",
            marginTop: 14,
          }}
        >
          <div>
            <label style={labelStyle}>Ricerca libera</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cliente, zona, note, tipo attività..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Origine</label>
            <select
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(
                  event.target.value as
                    | "ALL"
                    | "RECRUITING"
                    | "CRM"
                )
              }
              style={inputStyle}
            >
              <option value="ALL">TUTTI</option>
              <option value="RECRUITING">RECRUITING</option>
              <option value="CRM">CRM +ENERGIA</option>
            </select>
          </div>

          <label
            style={{
              minHeight: 39,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showPast}
              onChange={(event) =>
                setShowPast(event.target.checked)
              }
            />
            MOSTRA PASSATI
          </label>

          <button
            type="button"
            onClick={resetFilters}
            disabled={
              !search &&
              sourceFilter === "ALL" &&
              !showPast
            }
            style={{
              ...baseButton,
              minHeight: 39,
              opacity:
                !search &&
                sourceFilter === "ALL" &&
                !showPast
                  ? 0.45
                  : 1,
            }}
          >
            AZZERA FILTRI
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 9,
            background: "#eff6ff",
            color: "#1e40af",
            border: "1px solid #bfdbfe",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(320px,.78fr) minmax(0,1.65fr)",
          gap: 12,
          alignItems: "start",
          minWidth: 0,
        }}
      >
        <div
          style={{
            ...cardStyle,
            padding: 12,
            position: "sticky",
            top: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <h3 style={{ margin: 0 }}>
              Elenco appuntamenti
            </h3>
            <strong style={{ color: "#dc2626" }}>
              {filtered.length}
            </strong>
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              maxHeight: "calc(100vh - 300px)",
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {!filtered.length && (
              <div
                style={{
                  padding: 16,
                  color: "#64748b",
                  textAlign: "center",
                }}
              >
                Nessun appuntamento con questi filtri.
              </div>
            )}

            {filtered.map((item) => {
              const active = item.key === selectedKey;

              if (item.source === "crm") {
                const client = crmClientName(item.crm);
                const zone = crmZone(item.crm);

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    style={{
                      textAlign: "left",
                      border: active
                        ? "4px solid #c2410c"
                        : "4px solid #f97316",
                      borderRadius: 10,
                      padding: 10,
                      background: active
                        ? "#ea580c"
                        : "white",
                      color: active ? "white" : "#0f172a",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      <span>
                        {formatShortDate(item.date)}
                        {item.time ? ` · ${item.time}` : ""}
                      </span>
                      <span>CRM +ENERGIA</span>
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontWeight: 900,
                        lineHeight: 1.2,
                      }}
                    >
                      {client}
                    </div>

                    {zone && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          fontWeight: 800,
                          color: active
                            ? "#ffedd5"
                            : "#c2410c",
                        }}
                      >
                        {zone}
                      </div>
                    )}
                  </button>
                );
              }

              const event = item.recruiting;
              const candidate = event.candidateId
                ? candidateMap.get(event.candidateId)
                : null;
              const style = EVENT_COLORS[event.eventType];

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedKey(item.key)}
                  style={{
                    textAlign: "left",
                    border: `4px solid ${style.border}`,
                    borderRadius: 10,
                    padding: 10,
                    background: active
                      ? style.background
                      : "white",
                    color: "#0f172a",
                    cursor: "pointer",
                    opacity: event.completed ? 0.65 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 11,
                      fontWeight: 900,
                      color: style.color,
                    }}
                  >
                    <span>
                      {formatShortDate(item.date)}
                      {item.time ? ` · ${item.time}` : ""}
                    </span>
                    <span>RECRUITING</span>
                  </div>

                  <div
                    style={{
                      marginTop: 5,
                      fontWeight: 900,
                      lineHeight: 1.2,
                    }}
                  >
                    {candidate?.fullName ||
                      event.customType ||
                      EVENT_LABELS[event.eventType]}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      fontWeight: 800,
                      color: style.color,
                    }}
                  >
                    {event.eventType === "ALTRO" &&
                    event.customType
                      ? event.customType.toLocaleUpperCase("it")
                      : EVENT_LABELS[event.eventType]}
                    {event.completed ? " · COMPLETATO" : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          {!selected && (
            <div style={cardStyle}>
              Seleziona un appuntamento dall'elenco.
            </div>
          )}

          {selected && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0,1.35fr) minmax(300px,.8fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>
                      Scheda appuntamento
                    </h3>
                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 12,
                        fontWeight: 900,
                        color:
                          selected.source === "crm"
                            ? "#ea580c"
                            : "#1d4ed8",
                      }}
                    >
                      {selected.source === "crm"
                        ? "CRM +ENERGIA"
                        : "RECRUITING"}
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 8,
                      padding: "7px 10px",
                      background:
                        selected.source === "crm"
                          ? "#ffedd5"
                          : "#e0f2fe",
                      color:
                        selected.source === "crm"
                          ? "#c2410c"
                          : "#0369a1",
                      fontWeight: 900,
                    }}
                  >
                    {formatDate(selected.date)}
                    {selected.time
                      ? ` · ${selected.time}`
                      : ""}
                  </div>
                </div>

                {selected.source === "recruiting" ? (
                  (() => {
                    const event = selected.recruiting;
                    const candidate = selectedCandidate;
                    const eventLabel =
                      event.eventType === "ALTRO" &&
                      event.customType
                        ? event.customType.toLocaleUpperCase("it")
                        : EVENT_LABELS[event.eventType];

                    return (
                      <div
                        style={{
                          display: "grid",
                          gap: 14,
                          marginTop: 18,
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit,minmax(180px,1fr))",
                            gap: 12,
                          }}
                        >
                          <div>
                            <div style={labelStyle}>
                              Contatto
                            </div>
                            <strong>
                              {candidate?.fullName || "SENZA CONTATTO"}
                            </strong>
                          </div>

                          <div>
                            <div style={labelStyle}>
                              Tipo attività
                            </div>
                            <strong>{eventLabel}</strong>
                          </div>

                          {candidate && (
                            <>
                              <div>
                                <div style={labelStyle}>Zona</div>
                                <strong>
                                  {[
                                    candidate.operationalZone,
                                    candidate.provinceCode,
                                    candidate.region,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </strong>
                              </div>

                              <div>
                                <div style={labelStyle}>Stato</div>
                                <strong>
                                  {candidate.status || "—"}
                                </strong>
                              </div>

                              <div>
                                <div style={labelStyle}>
                                  Settore energia
                                </div>
                                <strong>
                                  {candidate.sectorEnergy
                                    ? `SI${candidate.companyName
                                        ? ` · ${candidate.companyName}`
                                        : ""}`
                                    : `NO${candidate.sectorOther
                                        ? ` · ${candidate.sectorOther}`
                                        : ""}`}
                                </strong>
                              </div>
                            </>
                          )}
                        </div>

                        {event.notes && (
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 9,
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.45,
                            }}
                          >
                            {event.notes}
                          </div>
                        )}

                        {candidate && (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {candidate.phone && (
                              <a
                                href={`tel:${candidate.phone.replace(
                                  /\s+/g,
                                  ""
                                )}`}
                                style={{
                                  ...baseButton,
                                  textDecoration: "none",
                                  background: "#dcfce7",
                                  color: "#166534",
                                }}
                              >
                                ☎ TELEFONO
                              </a>
                            )}

                            {candidate.email && (
                              <a
                                href={`mailto:${candidate.email}`}
                                style={{
                                  ...baseButton,
                                  textDecoration: "none",
                                  background: "#dbeafe",
                                  color: "#1d4ed8",
                                }}
                              >
                                ✉ EMAIL
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const crm = selected.crm;
                    const client = crmClientName(crm);
                    const zone = crmZone(crm);
                    const mapUrl = crmMapUrl(crm);
                    const phones = crmPhones(crm);
                    const notes = plainText(crm.notes);

                    return (
                      <div
                        style={{
                          display: "grid",
                          gap: 14,
                          marginTop: 18,
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit,minmax(180px,1fr))",
                            gap: 12,
                          }}
                        >
                          <div>
                            <div style={labelStyle}>Cliente</div>
                            <strong>{client}</strong>
                          </div>

                          <div>
                            <div style={labelStyle}>
                              Attività / stato CRM
                            </div>
                            <strong>
                              {plainText(crm.title) || "—"}
                            </strong>
                          </div>

                          <div>
                            <div style={labelStyle}>Zona</div>
                            <strong>{zone || "—"}</strong>
                          </div>

                          <div>
                            <div style={labelStyle}>
                              In carico a
                            </div>
                            <strong>
                              {plainText(crm.assignedTo) || "—"}
                            </strong>
                          </div>

                          <div>
                            <div style={labelStyle}>ID CRM</div>
                            <strong>#{crm.crmEventId}</strong>
                          </div>
                        </div>

                        {notes && (
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 9,
                              background: "#fff7ed",
                              border: "1px solid #fed7aa",
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.45,
                            }}
                          >
                            {notes}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          {mapUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  mapUrl,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                              style={{
                                ...baseButton,
                                background: "#ea580c",
                                color: "white",
                                borderColor: "#ea580c",
                              }}
                            >
                              MAPPA
                            </button>
                          )}

                          {phones.map((phone) => (
                            <a
                              key={phone.dial}
                              href={`tel:${phone.dial}`}
                              style={{
                                ...baseButton,
                                textDecoration: "none",
                                background: "#16a34a",
                                color: "white",
                                borderColor: "#16a34a",
                              }}
                            >
                              ☎ {phone.display}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              <div
                style={{
                  ...cardStyle,
                  background: "#fff7ed",
                  borderColor: "#fed7aa",
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  Programma attività
                </h3>
                <div
                  style={{
                    color: "#9a3412",
                    fontSize: 13,
                    marginBottom: 14,
                  }}
                >
                  Rifissa una chiamata, un appuntamento o una
                  videocal nel CALENDARIO.
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Contatto</label>
                    <div
                      style={{
                        ...inputStyle,
                        background: "#f8fafc",
                        fontWeight: 800,
                      }}
                    >
                      {selected.source === "crm"
                        ? crmClientName(selected.crm)
                        : selectedCandidate?.fullName ||
                          "SENZA CONTATTO"}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Tipo</label>
                    <select
                      value={activityType}
                      onChange={(event) =>
                        setActivityType(
                          event.target.value as EventType
                        )
                      }
                      style={inputStyle}
                    >
                      {Object.entries(EVENT_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {activityType === "ALTRO" && (
                    <div>
                      <label style={labelStyle}>
                        Specifica attività
                      </label>
                      <input
                        value={activityCustom}
                        onChange={(event) =>
                          setActivityCustom(event.target.value)
                        }
                        placeholder="Scrivi il tipo di attività"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Data</label>
                      <input
                        type="date"
                        value={activityDate}
                        onChange={(event) =>
                          setActivityDate(event.target.value)
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Ora</label>
                      <input
                        type="time"
                        value={activityTime}
                        onChange={(event) =>
                          setActivityTime(event.target.value)
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Nota attività
                    </label>
                    <textarea
                      value={activityNotes}
                      onChange={(event) =>
                        setActivityNotes(event.target.value)
                      }
                      rows={5}
                      placeholder="Scrivi una nota..."
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void scheduleActivity()}
                    style={{
                      ...baseButton,
                      background: "#f97316",
                      color: "white",
                      borderColor: "#f97316",
                      minHeight: 42,
                      opacity: busy ? 0.65 : 1,
                    }}
                  >
                    {busy
                      ? "INSERIMENTO..."
                      : "INSERISCI NEL CALENDARIO"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
