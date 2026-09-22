import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRecruitingContext, type RecruitingContext } from "./recruitingClient";
import { ITALIAN_REGIONS, normalizeItalianRegion } from "./recruitingData";
import RecruitingManagement from "./RecruitingManagement";
import {
  deleteGoogleCalendarEvent,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  startGoogleCalendarConnection,
  syncAllGoogleCalendarEvents,
  syncGoogleCalendarEvent,
} from "./googleCalendar";

const ITALY_REGIONS_GEOJSON_URL = "/italy-regions.geojson";

type CandidateStatus = string;

type Candidate = {
  id: string;
  fullName: string;
  operationalZone: string;
  sectorEnergy: boolean;
  sectorOther: string;
  phone: string;
  email: string;
  companyName: string;
  createdAt: string;
  status: CandidateStatus;
  forwardedTo: string;
  provinceCode: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
};

type ContactNote = {
  id: string;
  candidateId: string;
  noteDate: string;
  noteText: string;
  calledByMe: boolean;
  hrSyncPending: boolean;
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

type CandidateMapPoint = {
  candidateId: string;
  fullName: string;
  phone: string;
  email: string;
  zone: string;
  region: string;
  status: CandidateStatus;
  latitude: number;
  longitude: number;
};

const EVENT_LABELS: Record<EventType, string> = {
  CHIAMARE: "CHIAMARE",
  APPUNTAMENTO_ZONA: "APPUNTAMENTO IN ZONA",
  APPUNTAMENTO_SEDE: "APPUNTAMENTO IN SEDE",
  VIDEOCALL: "VIDEOCALL",
  ALTRO: "ALTRO",
};

const CANDIDATE_STATUS: Record<
  string,
  { label: string; background: string; color: string; border: string }
> = {
  CHIAMATO: {
    label: "CHIAMATO",
    background: "#ede9fe",
    color: "#6d28d9",
    border: "#8b5cf6",
  },
  DA_CHIAMARE: {
    label: "DA CHIAMARE",
    background: "#fef9c3",
    color: "#854d0e",
    border: "#facc15",
  },
  INVIATO_MANDATO: {
    label: "INVIATO MANDATO",
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "#60a5fa",
  },
  FISSATO_APPUNTAMENTO: {
    label: "FISSATO APPUNTAMENTO",
    background: "#ffedd5",
    color: "#c2410c",
    border: "#fb923c",
  },
  FISSATA_VIDEOCALL: {
    label: "FISSATA VIDEOCALL",
    background: "#dcfce7",
    color: "#15803d",
    border: "#4ade80",
  },
  FIRMATO_MANDATO: {
    label: "FIRMATO MANDATO",
    background: "#bbf7d0",
    color: "#166534",
    border: "#22c55e",
  },
  INOLTRATO_A: {
    label: "INOLTRATO A",
    background: "#e0e7ff",
    color: "#4338ca",
    border: "#818cf8",
  },
  KO: {
    label: "KO",
    background: "#fee2e2",
    color: "#b91c1c",
    border: "#f87171",
  },
  DA_RISENTIRE: {
    label: "DA RISENTIRE PIÙ AVANTI",
    background: "#ccfbf1",
    color: "#0f766e",
    border: "#2dd4bf",
  },
};

const CANDIDATE_STATUS_OPTIONS = Object.entries(CANDIDATE_STATUS) as Array<
  [string, { label: string; background: string; color: string; border: string }]
>;

type RecruitingStatusRow = {
  code: string;
  label: string;
  colorKey: string;
  sortOrder: number;
};

const STATUS_COLOR_PALETTE = [
  { key: "purple", name: "Viola", background: "#ede9fe", color: "#6d28d9", border: "#8b5cf6" },
  { key: "yellow", name: "Giallo", background: "#fef9c3", color: "#854d0e", border: "#facc15" },
  { key: "blue", name: "Blu", background: "#dbeafe", color: "#1d4ed8", border: "#60a5fa" },
  { key: "orange", name: "Arancione", background: "#ffedd5", color: "#c2410c", border: "#fb923c" },
  { key: "green", name: "Verde", background: "#dcfce7", color: "#15803d", border: "#4ade80" },
  { key: "emerald", name: "Smeraldo", background: "#d1fae5", color: "#047857", border: "#34d399" },
  { key: "indigo", name: "Indaco", background: "#e0e7ff", color: "#4338ca", border: "#818cf8" },
  { key: "red", name: "Rosso", background: "#fee2e2", color: "#b91c1c", border: "#f87171" },
  { key: "teal", name: "Turchese", background: "#ccfbf1", color: "#0f766e", border: "#2dd4bf" },
  { key: "cyan", name: "Ciano", background: "#cffafe", color: "#0e7490", border: "#22d3ee" },
  { key: "sky", name: "Azzurro", background: "#e0f2fe", color: "#0369a1", border: "#38bdf8" },
  { key: "lime", name: "Lime", background: "#ecfccb", color: "#4d7c0f", border: "#a3e635" },
  { key: "amber", name: "Ambra", background: "#fef3c7", color: "#92400e", border: "#f59e0b" },
  { key: "rose", name: "Rosa", background: "#ffe4e6", color: "#be123c", border: "#fb7185" },
  { key: "pink", name: "Pink", background: "#fce7f3", color: "#be185d", border: "#f472b6" },
  { key: "fuchsia", name: "Fucsia", background: "#fae8ff", color: "#a21caf", border: "#e879f9" },
  { key: "violet", name: "Violetto", background: "#f3e8ff", color: "#7e22ce", border: "#c084fc" },
  { key: "slate", name: "Ardesia", background: "#e2e8f0", color: "#334155", border: "#94a3b8" },
  { key: "stone", name: "Pietra", background: "#e7e5e4", color: "#44403c", border: "#a8a29e" },
  { key: "gray", name: "Grigio", background: "#f3f4f6", color: "#374151", border: "#9ca3af" },
  { key: "navy", name: "Blu notte", background: "#dbeafe", color: "#172554", border: "#1e3a8a" },
  { key: "royal", name: "Blu reale", background: "#eef2ff", color: "#312e81", border: "#4f46e5" },
  { key: "mint", name: "Menta", background: "#ecfdf5", color: "#065f46", border: "#10b981" },
  { key: "forest", name: "Verde bosco", background: "#dcfce7", color: "#14532d", border: "#15803d" },
  { key: "olive", name: "Oliva", background: "#f7fee7", color: "#365314", border: "#65a30d" },
  { key: "gold", name: "Oro", background: "#fefce8", color: "#713f12", border: "#ca8a04" },
  { key: "brown", name: "Marrone", background: "#f5ebe0", color: "#78350f", border: "#92400e" },
  { key: "coral", name: "Corallo", background: "#fff1f2", color: "#9f1239", border: "#fb7185" },
  { key: "salmon", name: "Salmone", background: "#fff7ed", color: "#9a3412", border: "#f97316" },
  { key: "magenta", name: "Magenta", background: "#fdf4ff", color: "#86198f", border: "#c026d3" },
  { key: "black", name: "Nero", background: "#f1f5f9", color: "#0f172a", border: "#0f172a" },
  { key: "white", name: "Bianco", background: "#ffffff", color: "#0f172a", border: "#cbd5e1" },
] as const;

const DEFAULT_STATUS_COLOR_KEY: Record<string, string> = {
  CHIAMATO: "purple",
  DA_CHIAMARE: "yellow",
  INVIATO_MANDATO: "blue",
  FISSATO_APPUNTAMENTO: "orange",
  FISSATA_VIDEOCALL: "green",
  FIRMATO_MANDATO: "emerald",
  INOLTRATO_A: "indigo",
  KO: "red",
  DA_RISENTIRE: "teal",
};

function statusPaletteByKey(key: string) {
  return (
    STATUS_COLOR_PALETTE.find((item) => item.key === key) ||
    STATUS_COLOR_PALETTE.find((item) => item.key === "slate")!
  );
}

function StatusColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(104px,1fr))",
        gap: 6,
      }}
    >
      {STATUS_COLOR_PALETTE.map((item) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            title={item.name}
            style={{
              border: `${selected ? 3 : 2}px solid ${item.border}`,
              background: item.background,
              color: item.color,
              borderRadius: 9,
              padding: "7px 8px",
              fontSize: 11,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: selected
                ? "0 0 0 2px rgba(15,23,42,.14)"
                : "none",
              minHeight: 36,
            }}
          >
            {selected ? "✓ " : ""}
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

function normalizeStatusCode(value: string) {
  const normalized = String(value || "")
    .trim()
    .toLocaleUpperCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "STATO";
}
const PROVINCE_REGION_BY_CODE: Record<string, string> = {
  AQ: "Abruzzo", CH: "Abruzzo", PE: "Abruzzo", TE: "Abruzzo",
  MT: "Basilicata", PZ: "Basilicata",
  CZ: "Calabria", CS: "Calabria", KR: "Calabria", RC: "Calabria", VV: "Calabria",
  AV: "Campania", BN: "Campania", CE: "Campania", NA: "Campania", SA: "Campania",
  BO: "Emilia-Romagna", FC: "Emilia-Romagna", FE: "Emilia-Romagna", MO: "Emilia-Romagna",
  PR: "Emilia-Romagna", PC: "Emilia-Romagna", RA: "Emilia-Romagna", RE: "Emilia-Romagna",
  RN: "Emilia-Romagna",
  GO: "Friuli-Venezia Giulia", PN: "Friuli-Venezia Giulia", TS: "Friuli-Venezia Giulia",
  UD: "Friuli-Venezia Giulia",
  FR: "Lazio", LT: "Lazio", RI: "Lazio", RM: "Lazio", VT: "Lazio",
  GE: "Liguria", IM: "Liguria", SP: "Liguria", SV: "Liguria",
  BG: "Lombardia", BS: "Lombardia", CO: "Lombardia", CR: "Lombardia", LC: "Lombardia",
  LO: "Lombardia", MN: "Lombardia", MI: "Lombardia", MB: "Lombardia", PV: "Lombardia",
  SO: "Lombardia", VA: "Lombardia",
  AN: "Marche", AP: "Marche", FM: "Marche", MC: "Marche", PU: "Marche",
  CB: "Molise", IS: "Molise",
  AL: "Piemonte", AT: "Piemonte", BI: "Piemonte", CN: "Piemonte", NO: "Piemonte",
  TO: "Piemonte", VB: "Piemonte", VC: "Piemonte",
  BA: "Puglia", BT: "Puglia", BR: "Puglia", FG: "Puglia", LE: "Puglia", TA: "Puglia",
  CA: "Sardegna", CI: "Sardegna", NU: "Sardegna", OG: "Sardegna", OR: "Sardegna",
  OT: "Sardegna", SS: "Sardegna", SU: "Sardegna", VS: "Sardegna",
  AG: "Sicilia", CL: "Sicilia", CT: "Sicilia", EN: "Sicilia", ME: "Sicilia",
  PA: "Sicilia", RG: "Sicilia", SR: "Sicilia", TP: "Sicilia",
  AR: "Toscana", FI: "Toscana", GR: "Toscana", LI: "Toscana", LU: "Toscana",
  MS: "Toscana", PI: "Toscana", PO: "Toscana", PT: "Toscana", SI: "Toscana",
  BZ: "Trentino-Alto Adige", TN: "Trentino-Alto Adige",
  PG: "Umbria", TR: "Umbria",
  AO: "Valle d'Aosta",
  BL: "Veneto", PD: "Veneto", RO: "Veneto", TV: "Veneto", VE: "Veneto",
  VI: "Veneto", VR: "Veneto",
};

function normalizeProvinceCode(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
}

function regionFromProvinceCode(value: string) {
  return PROVINCE_REGION_BY_CODE[normalizeProvinceCode(value)] || "";
}

function provinceCodeFromAddress(address: any) {
  if (!address || typeof address !== "object") return "";

  const isoValues = Object.entries(address)
    .filter(([key]) => key.startsWith("ISO3166-2"))
    .map(([, value]) => String(value || "").toUpperCase());

  for (const value of isoValues) {
    const match = value.match(/^IT-([A-Z]{2})$/);
    if (match && PROVINCE_REGION_BY_CODE[match[1]]) {
      return match[1];
    }
  }

  return "";
}


function phoneHref(value: string) {
  const clean = String(value || "").replace(/[^\d+]/g, "");
  return clean ? `tel:${clean}` : "";
}

function emailHref(value: string) {
  const clean = String(value || "").trim();
  return clean ? `mailto:${clean}` : "";
}

function normalizePlaceName(value: string) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(comune|citta|city|provincia|province|di|del|della)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function geocodeRecruitingCandidateZone(zone: string) {
  const query = String(zone || "").trim();
  if (!query) {
    return {
      latitude: null as number | null,
      longitude: null as number | null,
      region: "",
      provinceCode: "",
      displayName: "",
    };
  }

  const exactNeedle = normalizePlaceName(query);

  const fetchRows = async (url: URL) => {
    const response = await fetch(url.toString(), {
      headers: { "Accept-Language": "it" },
    });

    if (!response.ok) {
      throw new Error("Servizio di geolocalizzazione non disponibile");
    }

    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  };

  // Prima prova: ricerca strutturata come città/comune.
  const structuredUrl = new URL("https://nominatim.openstreetmap.org/search");
  structuredUrl.searchParams.set("format", "jsonv2");
  structuredUrl.searchParams.set("city", query);
  structuredUrl.searchParams.set("country", "Italia");
  structuredUrl.searchParams.set("countrycodes", "it");
  structuredUrl.searchParams.set("limit", "8");
  structuredUrl.searchParams.set("addressdetails", "1");
  structuredUrl.searchParams.set("namedetails", "1");

  let rows = await fetchRows(structuredUrl);

  // Fallback: ricerca libera più ampia se la query strutturata non trova nulla.
  if (!rows.length) {
    const fallbackUrl = new URL("https://nominatim.openstreetmap.org/search");
    fallbackUrl.searchParams.set("format", "jsonv2");
    fallbackUrl.searchParams.set("q", `${query}, Italia`);
    fallbackUrl.searchParams.set("countrycodes", "it");
    fallbackUrl.searchParams.set("limit", "12");
    fallbackUrl.searchParams.set("addressdetails", "1");
    fallbackUrl.searchParams.set("namedetails", "1");
    rows = await fetchRows(fallbackUrl);
  }

  if (!rows.length) {
    return {
      latitude: null as number | null,
      longitude: null as number | null,
      region: "",
      provinceCode: "",
      displayName: "",
    };
  }

  const scoredRows = rows
    .map((row: any) => {
      const address = row?.address || {};
      const names = [
        address.city,
        address.town,
        address.village,
        address.municipality,
        address.hamlet,
        row?.name,
        row?.namedetails?.name,
      ]
        .filter(Boolean)
        .map((value: string) => normalizePlaceName(value));

      const addressType = normalizePlaceName(
        String(row?.addresstype || row?.type || "")
      );

      let score = 0;

      if (names.some((name: string) => name === exactNeedle)) score += 100;
      if (names.some((name: string) => name.startsWith(exactNeedle))) score += 35;

      if (
        ["city", "town", "village", "municipality"].includes(addressType)
      ) {
        score += 30;
      }

      if (
        ["county", "state district", "province", "provincia"].includes(
          addressType
        )
      ) {
        score -= 80;
      }

      if (row?.class === "place") score += 20;
      if (row?.class === "boundary" && addressType === "administrative") {
        score -= 10;
      }

      return { row, score };
    })
    .sort((a: any, b: any) => b.score - a.score);

  const first = scoredRows[0]?.row;
  if (!first) {
    return {
      latitude: null as number | null,
      longitude: null as number | null,
      region: "",
      provinceCode: "",
      displayName: "",
    };
  }

  const address = first.address || {};
  const provinceCode = provinceCodeFromAddress(address);
  const region =
    regionFromProvinceCode(provinceCode) ||
    normalizeItalianRegion(
      address.state || address.region || address.state_district || ""
    );

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    region,
    provinceCode,
    displayName: String(first.display_name || query),
  };
}

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
    fullName: String(row.full_name || "").toLocaleUpperCase("it"),
    operationalZone: String(row.operational_zone || ""),
    sectorEnergy: row.sector_energy !== false,
    sectorOther: String(row.sector_other || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    companyName: String(row.company_name || ""),
    createdAt: String(row.created_at || ""),
    status: (String(row.contact_status || "DA_CHIAMARE") as CandidateStatus),
    forwardedTo: String(row.forwarded_to || ""),
    provinceCode: normalizeProvinceCode(String(row.province_code || "")),
    region: normalizeItalianRegion(String(row.region || "")),
    latitude:
      row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
  };
}

function noteFromRow(row: any): ContactNote {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    noteDate: String(row.note_date || ""),
    noteText: String(row.note_text || ""),
    calledByMe: Boolean(row.called_by_me),
    hrSyncPending: Boolean(row.hr_sync_pending),
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
  const [section, setSection] = useState<
    "contacts" | "calendar" | "map" | "hr_notes" | "management"
  >("contacts");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [googleCalendarConfigured, setGoogleCalendarConfigured] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarBusy, setGoogleCalendarBusy] = useState(false);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [events, setEvents] = useState<RecruitingEvent[]>([]);
  const [macroareas, setMacroareas] = useState<Macroarea[]>([]);
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);
  const [statusRows, setStatusRows] = useState<RecruitingStatusRow[]>([]);

  const [nameFilter, setNameFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState<"" | "SI" | "NO">("");
  const [sectorOtherFilter, setSectorOtherFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | CandidateStatus>("");
  const [forwardedToFilter, setForwardedToFilter] = useState("");
  const [calledByMeFilter, setCalledByMeFilter] = useState<"" | "SI" | "NO">("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [contactEditMode, setContactEditMode] = useState(false);
  const [showStatusManager, setShowStatusManager] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusColorKey, setNewStatusColorKey] = useState("slate");
  const [editingStatusCode, setEditingStatusCode] = useState<string | null>(null);
  const [editingStatusLabel, setEditingStatusLabel] = useState("");
  const [editingStatusColorKey, setEditingStatusColorKey] = useState("slate");
  const [showNewContact, setShowNewContact] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<Candidate[]>([]);

  const [newName, setNewName] = useState("");
  const [newZone, setNewZone] = useState("");
  const [newSectorEnergy, setNewSectorEnergy] = useState(true);
  const [newSectorChoice, setNewSectorChoice] = useState("");
  const [newSectorOther, setNewSectorOther] = useState("");
  const [newCompanyChoice, setNewCompanyChoice] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [editName, setEditName] = useState("");
  const [editZone, setEditZone] = useState("");
  const [editProvinceCode, setEditProvinceCode] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editSectorEnergy, setEditSectorEnergy] = useState(true);
  const [editSectorOther, setEditSectorOther] = useState("");
  const [editCompanyChoice, setEditCompanyChoice] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [noteDate, setNoteDate] = useState(localDateKey());
  const [noteText, setNoteText] = useState("");
  const [noteCalledByMe, setNoteCalledByMe] = useState(false);
  const [noteStatusDraft, setNoteStatusDraft] = useState<CandidateStatus>("DA_CHIAMARE");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDate, setEditingNoteDate] = useState(localDateKey());
  const [editingNoteText, setEditingNoteText] = useState("");
  const [editingNoteCalledByMe, setEditingNoteCalledByMe] = useState(false);

  const [activityCandidateId, setActivityCandidateId] = useState("");
  const [activityType, setActivityType] = useState<EventType>("CHIAMARE");
  const [activityCustom, setActivityCustom] = useState("");
  const [activityDate, setActivityDate] = useState(localDateKey());
  const [activityTime, setActivityTime] = useState("");
  const [activityNotes, setActivityNotes] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(localMonthKey());
  const [calendarSearchFilter, setCalendarSearchFilter] = useState("");
  const [calendarCandidateFilter, setCalendarCandidateFilter] = useState("");
  const [calendarTypeFilter, setCalendarTypeFilter] = useState<"" | EventType>("");
  const [calendarCandidateId, setCalendarCandidateId] = useState("");
  const [calendarType, setCalendarType] = useState<EventType>("CHIAMARE");
  const [calendarCustom, setCalendarCustom] = useState("");
  const [calendarDate, setCalendarDate] = useState(localDateKey());
  const [calendarTime, setCalendarTime] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");

  const [forwardedNewCandidateId, setForwardedNewCandidateId] = useState<string | null>(null);
  const [forwardedNewName, setForwardedNewName] = useState("");

  const [eventModalId, setEventModalId] = useState<string | null>(null);
  const [eventModalMode, setEventModalMode] = useState<"view" | "edit">("view");
  const [eventEditCandidateId, setEventEditCandidateId] = useState("");
  const [eventEditType, setEventEditType] = useState<EventType>("CHIAMARE");
  const [eventEditCustom, setEventEditCustom] = useState("");
  const [eventEditDate, setEventEditDate] = useState(localDateKey());
  const [eventEditTime, setEventEditTime] = useState("");
  const [eventEditNotes, setEventEditNotes] = useState("");
  const [calendarContactPreviewId, setCalendarContactPreviewId] = useState<string | null>(null);

  const [mapView, setMapView] =
    useState<"agents" | "candidates">("agents");
  const [mapCandidateStatusFilters, setMapCandidateStatusFilters] =
    useState<CandidateStatus[]>([]);
  const [mapShowActiveAgents, setMapShowActiveAgents] = useState(false);
  const [mapCandidateGeocoding, setMapCandidateGeocoding] = useState(false);
  const [mapCandidateGeocodingProgress, setMapCandidateGeocodingProgress] =
    useState({ done: 0, total: 0 });
  const [mapMode, setMapMode] = useState<"italy" | "region" | "macroarea">("italy");
  const [mapRegion, setMapRegion] = useState<string>("Umbria");
  const [mapMacroareaId, setMapMacroareaId] = useState("");
  const [mapReturnView, setMapReturnView] = useState<{
    mode: "italy" | "macroarea";
    macroareaId: string;
  } | null>(null);
  const [regionsGeoJson, setRegionsGeoJson] = useState<any>(null);
  const [mapBoundariesLoading, setMapBoundariesLoading] = useState(false);
  const [mapBoundariesError, setMapBoundariesError] = useState("");
  const [focusedCandidateMap, setFocusedCandidateMap] =
    useState<CandidateMapPoint | null>(null);
  const [mapRefreshing, setMapRefreshing] = useState(false);
  const [mapCandidateBusyId, setMapCandidateBusyId] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const regionsLayerRef = useRef<L.GeoJSON | null>(null);
  const candidateMapGeocodingRef = useRef(false);
  const candidateMapFailedZonesRef = useRef<Set<string>>(new Set());

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
      statusesResult,
    ] = await Promise.all([
      active.client
        .from("recruiting_candidates")
        .select("id,full_name,operational_zone,sector_energy,sector_other,phone,email,company_name,created_at,contact_status,forwarded_to,province_code,region,latitude,longitude")
        .order("full_name", { ascending: true }),
      active.client
        .from("recruiting_notes")
        .select("id,candidate_id,note_date,note_text,called_by_me,hr_sync_pending,created_at")
        .order("note_date", { ascending: false })
        .order("created_at", { ascending: false }),
      active.client
        .from("recruiting_events")
        .select("id,candidate_id,event_date,event_time,event_type,custom_type,notes,completed,google_sync_status,google_sync_error,google_synced_at")
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
      active.client
        .from("recruiting_statuses")
        .select("code,label,color_key,sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
    ]);

    for (const result of [
      candidatesResult,
      notesResult,
      eventsResult,
      macroResult,
      macroRegionsResult,
      activeAgentsResult,
      statusesResult,
    ]) {
      if (result.error) throw result.error;
    }

    const nextCandidates = (candidatesResult.data || []).map(candidateFromRow);
    setCandidates(nextCandidates);
    setNotes((notesResult.data || []).map(noteFromRow));
    setEvents((eventsResult.data || []).map(eventFromRow));
    setActiveAgents((activeAgentsResult.data || []).map(activeAgentFromRow));
    setStatusRows(
      (statusesResult.data || []).map((row: any) => ({
        code: String(row.code || ""),
        label: String(row.label || ""),
        colorKey: String(row.color_key || "slate"),
        sortOrder: Number(row.sort_order || 100),
      }))
    );

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

  const refreshGoogleCalendarConnectionStatus = async () => {
    try {
      const status = await getGoogleCalendarStatus();
      setGoogleCalendarConfigured(Boolean(status.configured));
      setGoogleCalendarConnected(Boolean(status.connected));
      return Boolean(status.connected);
    } catch (error: any) {
      console.error("GOOGLE CALENDAR STATUS ERROR:", error);
      setGoogleCalendarConfigured(false);
      setGoogleCalendarConnected(false);
      return false;
    }
  };

  const connectGoogleCalendar = async () => {
    setGoogleCalendarBusy(true);
    try {
      const authUrl = await startGoogleCalendarConnection();
      window.location.assign(authUrl);
    } catch (error: any) {
      setMessage(
        "Errore nel collegamento a Google Calendar: " +
          (error?.message || error)
      );
      setGoogleCalendarBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    if (
      !window.confirm(
        "Scollegare Google Calendar? Gli eventi già creati su Google non verranno eliminati."
      )
    ) {
      return;
    }

    setGoogleCalendarBusy(true);
    try {
      await disconnectGoogleCalendar();
      setGoogleCalendarConnected(false);
      setMessage("Google Calendar scollegato.");
    } catch (error: any) {
      setMessage(
        "Errore durante la disconnessione da Google Calendar: " +
          (error?.message || error)
      );
    } finally {
      setGoogleCalendarBusy(false);
    }
  };

  const syncAllGoogle = async () => {
    setGoogleCalendarBusy(true);
    try {
      const result = await syncAllGoogleCalendarEvents();
      if (!result?.connected) {
        setGoogleCalendarConnected(false);
        setMessage("Collega prima Google Calendar.");
        return;
      }

      setGoogleCalendarConnected(true);
      setMessage(
        `Google Calendar sincronizzato: ${Number(result.synced || 0)} attività${Number(result.errors || 0) ? ` · ${Number(result.errors || 0)} errori` : ""}.`
      );
      await loadAll(ctx || undefined);
    } catch (error: any) {
      setMessage(
        "Errore durante la sincronizzazione Google Calendar: " +
          (error?.message || error)
      );
    } finally {
      setGoogleCalendarBusy(false);
    }
  };

  const syncEventToGoogleIfConnected = async (eventId: string) => {
    if (!googleCalendarConnected) return true;

    try {
      const result = await syncGoogleCalendarEvent(eventId);
      if (result?.connected === false) {
        setGoogleCalendarConnected(false);
        return false;
      }
      return true;
    } catch (error: any) {
      console.error("GOOGLE CALENDAR EVENT SYNC ERROR:", error);
      setMessage(
        "Attività salvata nella webapp, ma Google Calendar non si è sincronizzato: " +
          (error?.message || error)
      );
      return false;
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

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const googleResult = params.get("google_calendar");
      const googleMessage = params.get("google_calendar_message");

      const connected = await refreshGoogleCalendarConnectionStatus();

      if (googleResult) {
        setSection("calendar");

        if (googleResult === "connected") {
          setGoogleCalendarConnected(true);
          setMessage(
            "Google Calendar collegato. Puoi sincronizzare le attività già presenti con SINCRONIZZA ORA."
          );
        } else if (googleResult === "error") {
          setMessage(
            "Collegamento Google Calendar non riuscito" +
              (googleMessage ? `: ${googleMessage}` : ".")
          );
        }

        const cleanUrl =
          window.location.pathname +
          window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      } else {
        setGoogleCalendarConnected(connected);
      }
    })();
  }, []);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) || null;

  useEffect(() => {
    if (!selectedCandidate) return;
    setContactEditMode(false);
    setActivityCandidateId(selectedCandidate.id);
    setEditName(selectedCandidate.fullName);
    setEditZone(selectedCandidate.operationalZone);
    setEditProvinceCode(selectedCandidate.provinceCode);
    setEditRegion(selectedCandidate.region);
    setEditSectorEnergy(selectedCandidate.sectorEnergy);
    setEditSectorOther(selectedCandidate.sectorOther);
    setEditCompanyChoice(selectedCandidate.companyName || "");
    setEditCompanyName("");
    setEditPhone(selectedCandidate.phone);
    setEditEmail(selectedCandidate.email);
  }, [selectedCandidateId, selectedCandidate?.fullName]);

  const normalizeFilterValue = (value: string) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase("it")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const normalizeCandidateName = (value: string) =>
    normalizeFilterValue(value).replace(/\s+/g, " ");

  const existingOtherSectors = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .filter((candidate) => !candidate.sectorEnergy)
            .map((candidate) => candidate.sectorOther.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [candidates]
  );

  const existingCompanies = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .filter((candidate) => candidate.sectorEnergy)
            .map((candidate) => candidate.companyName.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [candidates]
  );

  const existingZones = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .map((candidate) => candidate.operationalZone.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [candidates]
  );

  const existingForwardedRecipients = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .map((candidate) => candidate.forwardedTo.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [candidates]
  );

  const alphabeticalCandidates = useMemo(
    () =>
      [...candidates].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "it")
      ),
    [candidates]
  );

  const statusDefinitions = useMemo(() => {
    const overrides = new Map(
      statusRows.map((row) => [row.code, row])
    );

    const defaults = CANDIDATE_STATUS_OPTIONS.flatMap(
      ([code, definition], index) => {
        const override = overrides.get(code);
        if (override?.colorKey === "__deleted__") return [];

        const colorKey =
          override?.colorKey ||
          DEFAULT_STATUS_COLOR_KEY[code] ||
          "slate";
        const palette = statusPaletteByKey(colorKey);

        return [{
          code,
          label: override?.label || definition.label,
          colorKey,
          sortOrder: override?.sortOrder ?? index,
          background: palette.background,
          color: palette.color,
          border: palette.border,
        }];
      }
    );

    const defaultCodes = new Set(
      CANDIDATE_STATUS_OPTIONS.map(([code]) => code)
    );
    const custom = statusRows
      .filter(
        (row) =>
          !defaultCodes.has(row.code) &&
          row.colorKey !== "__deleted__"
      )
      .map((row) => {
        const palette = statusPaletteByKey(row.colorKey);
        return {
          code: row.code,
          label: row.label,
          colorKey: row.colorKey,
          sortOrder: row.sortOrder,
          background: palette.background,
          color: palette.color,
          border: palette.border,
        };
      });

    return [...defaults, ...custom].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label, "it");
    });
  }, [statusRows]);

  const statusDefinitionMap = useMemo(
    () => new Map(statusDefinitions.map((item) => [item.code, item])),
    [statusDefinitions]
  );

  const getStatusDefinition = (code: string) => {
    const existing = statusDefinitionMap.get(code);
    if (existing) return existing;

    const palette = statusPaletteByKey("slate");
    return {
      code,
      label: code || "STATO",
      colorKey: "slate",
      sortOrder: 9999,
      background: palette.background,
      color: palette.color,
      border: palette.border,
    };
  };

  const calledByMeCandidateIds = useMemo(
    () =>
      new Set(
        notes
          .filter((note) => note.calledByMe)
          .map((note) => note.candidateId)
      ),
    [notes]
  );

  const lastNoteSortKeyByCandidateId = useMemo(() => {
    const latest = new Map<string, string>();

    notes.forEach((note) => {
      const key = `${note.noteDate}|${note.createdAt}`;
      const current = latest.get(note.candidateId);
      if (!current || key > current) {
        latest.set(note.candidateId, key);
      }
    });

    return latest;
  }, [notes]);

  const filteredCandidates = useMemo(() => {
    const nameNeedle = normalizeFilterValue(nameFilter);
    const zoneNeedle = normalizeFilterValue(zoneFilter);
    const regionNeedle = normalizeFilterValue(regionFilter);
    const sectorOtherNeedle = normalizeFilterValue(sectorOtherFilter);
    const companyNeedle = normalizeFilterValue(companyFilter);
    const forwardedNeedle = normalizeFilterValue(forwardedToFilter);

    return candidates.filter((candidate) => {
      if (
        nameNeedle &&
        !normalizeFilterValue(candidate.fullName).includes(nameNeedle)
      ) {
        return false;
      }

      if (
        zoneNeedle &&
        !normalizeFilterValue(candidate.operationalZone).includes(zoneNeedle)
      ) {
        return false;
      }

      if (
        regionNeedle &&
        normalizeFilterValue(candidate.region) !== regionNeedle
      ) {
        return false;
      }

      if (sectorFilter === "SI" && !candidate.sectorEnergy) return false;
      if (sectorFilter === "NO" && candidate.sectorEnergy) return false;

      if (
        sectorFilter === "NO" &&
        sectorOtherNeedle &&
        normalizeFilterValue(candidate.sectorOther) !== sectorOtherNeedle
      ) {
        return false;
      }

      if (
        sectorFilter === "SI" &&
        companyNeedle &&
        normalizeFilterValue(candidate.companyName) !== companyNeedle
      ) {
        return false;
      }

      if (statusFilter && candidate.status !== statusFilter) return false;

      if (
        statusFilter === "INOLTRATO_A" &&
        forwardedNeedle &&
        normalizeFilterValue(candidate.forwardedTo) !== forwardedNeedle
      ) {
        return false;
      }

      const calledByMe = calledByMeCandidateIds.has(candidate.id);
      if (calledByMeFilter === "SI" && !calledByMe) return false;
      if (calledByMeFilter === "NO" && calledByMe) return false;

      return true;
    }).sort((a, b) => {
      const aPriority = a.status === "DA_CHIAMARE" ? 0 : 1;
      const bPriority = b.status === "DA_CHIAMARE" ? 0 : 1;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aCreatedKey = a.createdAt
        ? `${a.createdAt.slice(0, 10)}|${a.createdAt}`
        : "";
      const bCreatedKey = b.createdAt
        ? `${b.createdAt.slice(0, 10)}|${b.createdAt}`
        : "";

      const aLast =
        lastNoteSortKeyByCandidateId.get(a.id) || aCreatedKey;
      const bLast =
        lastNoteSortKeyByCandidateId.get(b.id) || bCreatedKey;

      if (aLast !== bLast) {
        return bLast.localeCompare(aLast);
      }

      return a.fullName.localeCompare(b.fullName, "it");
    });
  }, [
    candidates,
    lastNoteSortKeyByCandidateId,
    nameFilter,
    zoneFilter,
    regionFilter,
    sectorFilter,
    sectorOtherFilter,
    companyFilter,
    statusFilter,
    forwardedToFilter,
    calledByMeFilter,
    calledByMeCandidateIds,
  ]);

  const hasActiveContactFilters = Boolean(
    nameFilter.trim() ||
      zoneFilter.trim() ||
      regionFilter ||
      sectorFilter ||
      sectorOtherFilter ||
      companyFilter ||
      statusFilter ||
      forwardedToFilter ||
      calledByMeFilter
  );

  const resetContactFilters = () => {
    setNameFilter("");
    setZoneFilter("");
    setRegionFilter("");
    setSectorFilter("");
    setSectorOtherFilter("");
    setCompanyFilter("");
    setStatusFilter("");
    setForwardedToFilter("");
    setCalledByMeFilter("");
  };

  const resetCalendarFilters = () => {
    setCalendarSearchFilter("");
    setCalendarCandidateFilter("");
    setCalendarTypeFilter("");
  };

  const selectedNotes = useMemo(
    () =>
      notes
        .filter((note) => note.candidateId === selectedCandidateId)
        .sort((a, b) =>
          `${b.noteDate}|${b.createdAt}`.localeCompare(`${a.noteDate}|${a.createdAt}`)
        ),
    [notes, selectedCandidateId]
  );

  const hrSyncNotes = useMemo(
    () =>
      notes
        .filter((note) => note.hrSyncPending)
        .sort((a, b) =>
          `${b.noteDate}|${b.createdAt}`.localeCompare(
            `${a.noteDate}|${a.createdAt}`
          )
        ),
    [notes]
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

  const saveStatusDefinition = async (
    code: string,
    label: string,
    colorKey: string,
    sortOrder: number
  ) => {
    if (!ctx) return false;

    const { error } = await ctx.client
      .from("recruiting_statuses")
      .upsert(
        {
          owner_key: ctx.ownerKey,
          code,
          label,
          color_key: colorKey,
          sort_order: sortOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_key,code" }
      );

    if (error) {
      setMessage("Errore nel salvataggio dello stato: " + error.message);
      return false;
    }

    await loadAll(ctx);
    return true;
  };

  const addCustomStatus = async () => {
    if (!ctx) return;

    const label = newStatusLabel.trim().toLocaleUpperCase("it");
    if (!label) {
      setMessage("Scrivi il nome del nuovo stato.");
      return;
    }

    let code = normalizeStatusCode(label);
    const existingCodes = new Set(statusDefinitions.map((item) => item.code));
    if (existingCodes.has(code)) {
      code = `${code}_${Date.now().toString().slice(-5)}`;
    }

    const nextSort =
      Math.max(100, ...statusDefinitions.map((item) => item.sortOrder)) + 10;

    const saved = await saveStatusDefinition(
      code,
      label,
      newStatusColorKey,
      nextSort
    );
    if (!saved) return;

    setNewStatusLabel("");
    setNewStatusColorKey("slate");
    setMessage("Nuovo stato aggiunto.");
  };

  const startEditStatus = (status: {
    code: string;
    label: string;
    colorKey: string;
  }) => {
    setEditingStatusCode(status.code);
    setEditingStatusLabel(status.label);
    setEditingStatusColorKey(status.colorKey);
  };

  const cancelEditStatus = () => {
    setEditingStatusCode(null);
    setEditingStatusLabel("");
    setEditingStatusColorKey("slate");
  };

  const saveEditedStatus = async (status: {
    code: string;
    sortOrder: number;
  }) => {
    const label = editingStatusLabel.trim().toLocaleUpperCase("it");
    if (!label) {
      setMessage("Il nome dello stato non può essere vuoto.");
      return;
    }

    const saved = await saveStatusDefinition(
      status.code,
      label,
      editingStatusColorKey,
      status.sortOrder
    );
    if (!saved) return;

    cancelEditStatus();
    setMessage("Stato modificato.");
  };

  const deleteStatusDefinition = async (status: {
    code: string;
    label: string;
    colorKey: string;
    sortOrder: number;
  }) => {
    if (!ctx) return;
    if (statusDefinitions.length <= 1) {
      setMessage("Deve rimanere almeno uno stato disponibile.");
      return;
    }

    const affectedCount = candidates.filter(
      (candidate) => candidate.status === status.code
    ).length;
    const replacement =
      statusDefinitions.find(
        (item) => item.code === "DA_CHIAMARE" && item.code !== status.code
      ) ||
      statusDefinitions.find((item) => item.code !== status.code);

    if (!replacement) {
      setMessage("Non è possibile eliminare l'ultimo stato disponibile.");
      return;
    }

    const confirmation = affectedCount
      ? `Eliminare lo stato "${status.label}"? I ${affectedCount} contatti che lo usano passeranno automaticamente a "${replacement.label}".`
      : `Eliminare lo stato "${status.label}"?`;

    if (!window.confirm(confirmation)) return;

    setBusy(true);
    try {
      if (affectedCount) {
        const { error: candidatesError } = await ctx.client
          .from("recruiting_candidates")
          .update({
            contact_status: replacement.code,
            updated_at: new Date().toISOString(),
          })
          .eq("owner_key", ctx.ownerKey)
          .eq("contact_status", status.code);

        if (candidatesError) throw candidatesError;
      }

      const isBuiltIn = CANDIDATE_STATUS_OPTIONS.some(
        ([code]) => code === status.code
      );

      if (isBuiltIn) {
        const { error } = await ctx.client
          .from("recruiting_statuses")
          .upsert(
            {
              owner_key: ctx.ownerKey,
              code: status.code,
              label: status.label,
              color_key: "__deleted__",
              sort_order: status.sortOrder,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "owner_key,code" }
          );
        if (error) throw error;
      } else {
        const { error } = await ctx.client
          .from("recruiting_statuses")
          .delete()
          .eq("owner_key", ctx.ownerKey)
          .eq("code", status.code);
        if (error) throw error;
      }

      if (statusFilter === status.code) setStatusFilter("");
      if (editingStatusCode === status.code) cancelEditStatus();

      await loadAll(ctx);
      setMessage("Stato eliminato.");
    } catch (error: any) {
      setMessage(
        "Errore nell'eliminazione dello stato: " +
          (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
  };

  const updateCandidateStatus = async (
    candidate: Candidate,
    status: CandidateStatus
  ) => {
    if (!ctx || candidate.status === status) return;

    const previousStatus = candidate.status;
    setCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id ? { ...item, status } : item
      )
    );

    try {
      const { error } = await ctx.client
        .from("recruiting_candidates")
        .update({
          contact_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);

      if (error) throw error;
    } catch (error: any) {
      setCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id ? { ...item, status: previousStatus } : item
        )
      );
      setMessage(
        "Errore nell'aggiornamento dello stato: " + (error?.message || error)
      );
    }
  };

  const confirmNoteStatus = async () => {
    if (!selectedCandidate) return;

    if (noteStatusDraft) {
      await updateCandidateStatus(selectedCandidate, noteStatusDraft);
    }

    setNoteStatusDraft("DA_CHIAMARE");
  };

  const updateCandidateForwardedTo = async (
    candidate: Candidate,
    forwardedTo: string
  ) => {
    if (!ctx) return;

    const nextValue = forwardedTo.trim();
    const previousValue = candidate.forwardedTo;

    setCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id
          ? { ...item, forwardedTo: nextValue }
          : item
      )
    );

    try {
      const { error } = await ctx.client
        .from("recruiting_candidates")
        .update({
          forwarded_to: nextValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);

      if (error) throw error;
    } catch (error: any) {
      setCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id
            ? { ...item, forwardedTo: previousValue }
            : item
        )
      );
      setMessage(
        "Errore nel salvataggio del destinatario: " +
          (error?.message || error)
      );
    }
  };

  const beginNewForwardedRecipient = (candidateId: string) => {
    setForwardedNewCandidateId(candidateId);
    setForwardedNewName("");
  };

  const saveNewForwardedRecipient = async (candidate: Candidate) => {
    const value = forwardedNewName.trim();
    if (!value) {
      setMessage("Scrivi il nome a cui hai inoltrato il contatto.");
      return;
    }

    await updateCandidateForwardedTo(candidate, value);
    setForwardedNewCandidateId(null);
    setForwardedNewName("");
  };

  const autofillEditGeography = async (zoneValue: string) => {
    const zone = zoneValue.trim();
    if (!zone) {
      setEditProvinceCode("");
      setEditRegion("");
      return;
    }

    try {
      const geo = await geocodeRecruitingCandidateZone(zone);
      if (geo.provinceCode) {
        setEditProvinceCode(geo.provinceCode);
      }
      if (geo.region) {
        setEditRegion(geo.region);
      }
    } catch (error) {
      console.warn("AUTO GEOGRAPHY ERROR:", error);
    }
  };

  const createCandidate = async (forceDuplicate = false) => {
    if (!ctx) return;
    if (!newName.trim()) {
      setMessage("Inserisci nome e cognome.");
      return;
    }

    if (!forceDuplicate) {
      const normalizedName = normalizeCandidateName(newName);
      const duplicates = candidates.filter(
        (candidate) =>
          normalizeCandidateName(candidate.fullName) === normalizedName
      );

      if (duplicates.length) {
        setDuplicateCandidates(duplicates);
        return;
      }
    }

    setDuplicateCandidates([]);

    const resolvedNewSector = newSectorEnergy
      ? ""
      : newSectorChoice === "__NEW__" || !existingOtherSectors.length
      ? newSectorOther.trim()
      : newSectorChoice.trim();

    const resolvedNewCompany = newSectorEnergy
      ? newCompanyChoice === "__NEW__" || !existingCompanies.length
        ? newCompanyName.trim()
        : newCompanyChoice.trim()
      : "";

    if (newSectorEnergy && !resolvedNewCompany) {
      setMessage("Seleziona un'azienda oppure aggiungine una nuova.");
      return;
    }

    if (!newSectorEnergy && !resolvedNewSector) {
      setMessage("Seleziona un settore oppure aggiungine uno nuovo.");
      return;
    }

    setBusy(true);
    try {
      let geography = {
        provinceCode: "",
        region: "",
        latitude: null as number | null,
        longitude: null as number | null,
      };

      if (newZone.trim()) {
        try {
          const geo = await geocodeRecruitingCandidateZone(newZone.trim());
          geography = {
            provinceCode: geo.provinceCode || "",
            region: geo.region || "",
            latitude:
              geo.latitude !== null && Number.isFinite(geo.latitude)
                ? geo.latitude
                : null,
            longitude:
              geo.longitude !== null && Number.isFinite(geo.longitude)
                ? geo.longitude
                : null,
          };
        } catch (error) {
          console.warn("NEW CANDIDATE GEOGRAPHY ERROR:", error);
        }
      }

      const { data, error } = await ctx.client
        .from("recruiting_candidates")
        .insert({
          owner_key: ctx.ownerKey,
          full_name: newName.trim().toLocaleUpperCase("it"),
          operational_zone: newZone.trim().toLocaleUpperCase("it"),
          sector_energy: newSectorEnergy,
          sector_other: resolvedNewSector,
          company_name: resolvedNewCompany,
          phone: newPhone.trim(),
          email: newEmail.trim(),
          contact_status: "DA_CHIAMARE",
          forwarded_to: "",
          province_code: geography.provinceCode,
          region: geography.region,
          latitude: geography.latitude,
          longitude: geography.longitude,
        })
        .select("id")
        .single();

      if (error) throw error;

      setNewName("");
      setNewZone("");
      setNewSectorEnergy(true);
      setNewSectorChoice("");
      setNewSectorOther("");
      setNewCompanyChoice("");
      setNewCompanyName("");
      setNewPhone("");
      setNewEmail("");
      setDuplicateCandidates([]);
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

    const resolvedEditCompany = editSectorEnergy
      ? editCompanyChoice === "__NEW__" || !existingCompanies.length
        ? editCompanyName.trim()
        : editCompanyChoice.trim()
      : "";

    if (editSectorEnergy && !resolvedEditCompany) {
      setMessage("Seleziona un'azienda oppure aggiungine una nuova.");
      return;
    }

    setBusy(true);
    try {
      let nextLatitude = selectedCandidate.latitude;
      let nextLongitude = selectedCandidate.longitude;
      let nextProvinceCode = normalizeProvinceCode(editProvinceCode);
      let nextRegion =
        editRegion || regionFromProvinceCode(editProvinceCode);

      const zoneChanged =
        normalizePlaceName(editZone) !==
        normalizePlaceName(selectedCandidate.operationalZone);

      if (
        editZone.trim() &&
        (zoneChanged ||
          nextLatitude === null ||
          nextLongitude === null)
      ) {
        try {
          const geo = await geocodeRecruitingCandidateZone(editZone.trim());
          if (
            geo.latitude !== null &&
            geo.longitude !== null &&
            Number.isFinite(geo.latitude) &&
            Number.isFinite(geo.longitude)
          ) {
            nextLatitude = geo.latitude;
            nextLongitude = geo.longitude;
          }
          if (geo.provinceCode) nextProvinceCode = geo.provinceCode;
          if (geo.region) nextRegion = geo.region;
        } catch (error) {
          console.warn("EDIT CANDIDATE GEOGRAPHY ERROR:", error);
        }
      }

      const { error } = await ctx.client
        .from("recruiting_candidates")
        .update({
          full_name: editName.trim().toLocaleUpperCase("it"),
          operational_zone: editZone.trim().toLocaleUpperCase("it"),
          province_code: nextProvinceCode,
          region: nextRegion,
          latitude: nextLatitude,
          longitude: nextLongitude,
          sector_energy: editSectorEnergy,
          sector_other: editSectorEnergy ? "" : editSectorOther.trim(),
          company_name: resolvedEditCompany,
          phone: editPhone.trim(),
          email: editEmail.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedCandidate.id);

      if (error) throw error;
      await loadAll(ctx);
      setContactEditMode(false);
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

  const addNote = async (sendToHr = false) => {
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
        called_by_me: noteCalledByMe,
        hr_sync_pending: sendToHr,
      });
      if (error) throw error;

      setNoteText("");
      setNoteDate(localDateKey());
      setNoteCalledByMe(false);
      setNoteStatusDraft("DA_CHIAMARE");
      await loadAll(ctx);
      setMessage(
        sendToHr
          ? "Nota aggiunta e inserita nelle NOTE DA SINCRONIZZARE SU HR SPECIALIST."
          : "Nota aggiunta."
      );
    } catch (error: any) {
      setMessage("Errore nel salvataggio della nota: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const startEditNote = (note: ContactNote) => {
    setEditingNoteId(note.id);
    setEditingNoteDate(note.noteDate || localDateKey());
    setEditingNoteText(note.noteText);
    setEditingNoteCalledByMe(note.calledByMe);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteDate(localDateKey());
    setEditingNoteText("");
    setEditingNoteCalledByMe(false);
  };

  const saveEditedNote = async (note: ContactNote) => {
    if (!ctx) return;
    if (!editingNoteText.trim()) {
      setMessage("La nota non può essere vuota.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await ctx.client
        .from("recruiting_notes")
        .update({
          note_date: editingNoteDate,
          note_text: editingNoteText.trim(),
          called_by_me: editingNoteCalledByMe,
        })
        .eq("id", note.id)
        .eq("owner_key", ctx.ownerKey);

      if (error) throw error;

      cancelEditNote();
      await loadAll(ctx);
      setMessage("Nota modificata.");
    } catch (error: any) {
      setMessage(
        "Errore nella modifica della nota: " + (error?.message || error)
      );
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
    if (editingNoteId === note.id) cancelEditNote();
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
    if (!ctx) return null;
    if (!date) {
      setMessage("Seleziona la data dell'attività.");
      return null;
    }
    if (type === "ALTRO" && !customType.trim()) {
      setMessage("Scrivi il tipo di attività nella voce ALTRO.");
      return null;
    }

    const { data, error } = await ctx.client
      .from("recruiting_events")
      .insert({
        owner_key: ctx.ownerKey,
        candidate_id: candidateId,
        event_date: date,
        event_time: time || null,
        event_type: type,
        custom_type: type === "ALTRO" ? customType.trim() : "",
        notes: notesText.trim(),
      })
      .select("id")
      .single();

    if (error) throw error;

    const eventId = String(data.id);
    await syncEventToGoogleIfConnected(eventId);
    return eventId;
  };

  const addActivityFromContact = async () => {
    if (!selectedCandidate) return;

    const linkedCandidateId =
      activityCandidateId || selectedCandidate.id;

    if (!linkedCandidateId) {
      setMessage("Seleziona il nominativo da collegare all'attività.");
      return;
    }

    setBusy(true);
    try {
      const eventId = await insertEvent({
        candidateId: linkedCandidateId,
        type: activityType,
        customType: activityCustom,
        date: activityDate,
        time: activityTime,
        notesText: activityNotes,
      });
      if (!eventId) return;

      setActivityCandidateId(selectedCandidate.id);
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
      const eventId = await insertEvent({
        candidateId: calendarCandidateId || null,
        type: calendarType,
        customType: calendarCustom,
        date: calendarDate,
        time: calendarTime,
        notesText: calendarNotes,
      });
      if (!eventId) return;

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

    await syncEventToGoogleIfConnected(event.id);
    await loadAll(ctx);
  };

  const deleteEvent = async (event: RecruitingEvent) => {
    if (!ctx || !window.confirm("Eliminare questa attività dal calendario?")) return;

    if (googleCalendarConnected) {
      try {
        await deleteGoogleCalendarEvent(event.id);
      } catch (error: any) {
        setMessage(
          "Non ho eliminato l'attività perché Google Calendar non ha risposto correttamente: " +
            (error?.message || error)
        );
        return;
      }
    }

    const { error } = await ctx.client.from("recruiting_events").delete().eq("id", event.id);
    if (error) {
      setMessage("Errore nell'eliminazione attività: " + error.message);
      return;
    }
    await loadAll(ctx);
  };

  const openEventModal = (
    event: RecruitingEvent,
    mode: "view" | "edit" = "view"
  ) => {
    setEventModalId(event.id);
    setEventModalMode(mode);
    setEventEditCandidateId(event.candidateId || "");
    setEventEditType(event.eventType);
    setEventEditCustom(event.customType);
    setEventEditDate(event.eventDate);
    setEventEditTime(formatTime(event.eventTime));
    setEventEditNotes(event.notes);
  };

  const saveEventChanges = async () => {
    if (!ctx || !eventModalId) return;

    if (!eventEditDate) {
      setMessage("Seleziona la data dell'attività.");
      return;
    }

    if (eventEditType === "ALTRO" && !eventEditCustom.trim()) {
      setMessage("Scrivi il tipo di attività.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await ctx.client
        .from("recruiting_events")
        .update({
          candidate_id: eventEditCandidateId || null,
          event_date: eventEditDate,
          event_time: eventEditTime || null,
          event_type: eventEditType,
          custom_type:
            eventEditType === "ALTRO" ? eventEditCustom.trim() : "",
          notes: eventEditNotes.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", eventModalId);

      if (error) throw error;

      await syncEventToGoogleIfConnected(eventModalId);
      await loadAll(ctx);
      setEventModalMode("view");
      setMessage(
        googleCalendarConnected
          ? "Attività aggiornata e sincronizzata con Google Calendar."
          : "Attività aggiornata."
      );
    } catch (error: any) {
      setMessage(
        "Errore nella modifica dell'attività: " +
          (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
  };

  const openReadOnlyContact = (candidateId: string | null) => {
    if (!candidateId) {
      setMessage("Questa attività non è collegata a un nominativo.");
      return;
    }

    setCalendarContactPreviewId(candidateId);
  };

  const openContactForEditing = (candidateId: string) => {
    setCalendarContactPreviewId(null);
    setEventModalId(null);
    setSelectedCandidateId(candidateId);
    setSection("contacts");

    window.setTimeout(() => {
      document
        .getElementById(`recruiting-candidate-${candidateId}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 100);
  };

  const candidateName = (candidateId: string | null) =>
    candidates.find((candidate) => candidate.id === candidateId)?.fullName || "Senza contatto";

  const eventModalEvent =
    events.find((event) => event.id === eventModalId) || null;

  const calendarContactPreview =
    candidates.find(
      (candidate) => candidate.id === calendarContactPreviewId
    ) || null;

  const calendarContactPreviewNotes = useMemo(
    () =>
      notes
        .filter(
          (note) => note.candidateId === calendarContactPreviewId
        )
        .sort((a, b) =>
          `${b.noteDate}|${b.createdAt}`.localeCompare(
            `${a.noteDate}|${a.createdAt}`
          )
        ),
    [notes, calendarContactPreviewId]
  );

  const calendarAssociatedCandidates = useMemo(() => {
    const ids = new Set(
      events
        .map((event) => event.candidateId)
        .filter((value): value is string => Boolean(value))
    );

    return candidates
      .filter((candidate) => ids.has(candidate.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }, [events, candidates]);

  const calendarCells = useMemo(
    () => getMonthCells(calendarMonth),
    [calendarMonth]
  );

  const resetMapInstance = () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    markersRef.current = null;
    regionsLayerRef.current = null;
  };

  const refreshRecruitingMap = async () => {
    setMapRefreshing(true);
    setMapBoundariesError("");

    try {
      resetMapInstance();
      setRegionsGeoJson(null);
      candidateMapFailedZonesRef.current.clear();
      await loadAll(ctx || undefined);
    } catch (error: any) {
      console.error("REFRESH RECRUITING MAP ERROR:", error);
      setMapBoundariesError(
        "Errore durante l'aggiornamento della mappa: " +
          (error?.message || error)
      );
    } finally {
      setMapRefreshing(false);
    }
  };

  const showCandidateOnMap = async (candidate: Candidate) => {
    const zone =
      candidate.id === selectedCandidateId
        ? editZone.trim() || candidate.operationalZone.trim()
        : candidate.operationalZone.trim();

    if (!zone) {
      setMessage(
        "Per mostrare il nominativo sulla mappa devi prima indicare la zona operativa."
      );
      return;
    }

    setMapCandidateBusyId(candidate.id);
    setMessage("Posiziono il nominativo sulla mappa...");

    try {
      const geo = await geocodeRecruitingCandidateZone(zone);

      if (
        geo.latitude === null ||
        geo.longitude === null ||
        !Number.isFinite(geo.latitude) ||
        !Number.isFinite(geo.longitude)
      ) {
        throw new Error(
          "Zona non riconosciuta. Prova a indicare una città o località più precisa."
        );
      }

      const region = normalizeItalianRegion(geo.region || "");

      setFocusedCandidateMap({
        candidateId: candidate.id,
        fullName: candidate.fullName,
        phone: candidate.phone,
        email: candidate.email,
        zone,
        region,
        status: candidate.status,
        latitude: geo.latitude,
        longitude: geo.longitude,
      });

      if (ctx) {
        const { error: coordinateError } = await ctx.client
          .from("recruiting_candidates")
          .update({
            latitude: geo.latitude,
            longitude: geo.longitude,
            province_code:
              geo.provinceCode || candidate.provinceCode || "",
            region: region || candidate.region || "",
            updated_at: new Date().toISOString(),
          })
          .eq("id", candidate.id)
          .eq("owner_key", ctx.ownerKey);

        if (!coordinateError) {
          setCandidates((current) =>
            current.map((item) =>
              item.id === candidate.id
                ? {
                    ...item,
                    latitude: geo.latitude,
                    longitude: geo.longitude,
                    provinceCode:
                      geo.provinceCode ||
                      item.provinceCode,
                    region: region || item.region,
                  }
                : item
            )
          );
        }
      }

      setMapView("candidates");
      setMapCandidateStatusFilters((current) =>
        current.length === 0 || current.includes(candidate.status)
          ? current
          : [...current, candidate.status]
      );
      setMapReturnView(null);

      if (ITALIAN_REGIONS.includes(region as any)) {
        setMapRegion(region);
        setMapMode("region");
      } else {
        setMapMode("italy");
      }

      setSection("map");
      setMessage(
        `${candidate.fullName} è evidenziato nella mappa NOMINATIVI IN LAVORAZIONE.`
      );
    } catch (error: any) {
      console.error("SHOW CANDIDATE MAP ERROR:", error);
      setMessage(
        "Non riesco a posizionare il nominativo sulla mappa: " +
          (error?.message || error)
      );
    } finally {
      setMapCandidateBusyId(null);
    }
  };

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

  const mapStatusFilteredCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          mapCandidateStatusFilters.length === 0 ||
          mapCandidateStatusFilters.includes(candidate.status)
      ),
    [candidates, mapCandidateStatusFilters]
  );

  const visibleMapCandidates = useMemo(() => {
    return mapStatusFilteredCandidates.filter((candidate) => {
      if (
        candidate.latitude === null ||
        candidate.longitude === null ||
        !Number.isFinite(candidate.latitude) ||
        !Number.isFinite(candidate.longitude)
      ) {
        return false;
      }

      if (mapMode === "italy") return true;
      const region = normalizeItalianRegion(
        candidate.region || candidate.operationalZone
      );
      return visibleMapRegions.includes(region);
    });
  }, [mapStatusFilteredCandidates, mapMode, visibleMapRegions]);

  const mapAgentsToRender =
    mapView === "agents" || mapShowActiveAgents
      ? visibleMapAgents
      : [];

  const geocodeMissingCandidateMapPoints = async () => {
    if (!ctx || candidateMapGeocodingRef.current) return;

    const pending = mapStatusFilteredCandidates.filter(
      (candidate) =>
        candidate.operationalZone.trim() &&
        (candidate.latitude === null ||
          candidate.longitude === null ||
          !Number.isFinite(candidate.latitude) ||
          !Number.isFinite(candidate.longitude))
    );

    const groups = new Map<string, Candidate[]>();
    pending.forEach((candidate) => {
      const key = normalizePlaceName(candidate.operationalZone);
      if (!key || candidateMapFailedZonesRef.current.has(key)) return;
      const current = groups.get(key) || [];
      current.push(candidate);
      groups.set(key, current);
    });

    const entries = Array.from(groups.entries());
    if (!entries.length) return;

    candidateMapGeocodingRef.current = true;
    setMapCandidateGeocoding(true);
    setMapCandidateGeocodingProgress({
      done: 0,
      total: entries.length,
    });

    try {
      for (let index = 0; index < entries.length; index += 1) {
        const [zoneKey, groupedCandidates] = entries[index];
        const zone = groupedCandidates[0]?.operationalZone.trim();
        if (!zone) continue;

        try {
          const geo = await geocodeRecruitingCandidateZone(zone);

          if (
            geo.latitude === null ||
            geo.longitude === null ||
            !Number.isFinite(geo.latitude) ||
            !Number.isFinite(geo.longitude)
          ) {
            throw new Error("Zona non riconosciuta");
          }

          const ids = groupedCandidates.map((candidate) => candidate.id);
          const normalizedRegion = normalizeItalianRegion(
            geo.region || groupedCandidates[0]?.region || ""
          );

          const { error } = await ctx.client
            .from("recruiting_candidates")
            .update({
              latitude: geo.latitude,
              longitude: geo.longitude,
              province_code:
                geo.provinceCode ||
                groupedCandidates[0]?.provinceCode ||
                "",
              region:
                normalizedRegion ||
                groupedCandidates[0]?.region ||
                "",
              updated_at: new Date().toISOString(),
            })
            .eq("owner_key", ctx.ownerKey)
            .in("id", ids);

          if (error) throw error;

          setCandidates((current) =>
            current.map((candidate) =>
              ids.includes(candidate.id)
                ? {
                    ...candidate,
                    latitude: geo.latitude,
                    longitude: geo.longitude,
                    provinceCode:
                      geo.provinceCode ||
                      candidate.provinceCode,
                    region:
                      normalizedRegion ||
                      candidate.region,
                  }
                : candidate
            )
          );
        } catch (error) {
          console.warn(
            "CANDIDATE MAP GEOCODING ERROR:",
            zone,
            error
          );
          candidateMapFailedZonesRef.current.add(zoneKey);
        }

        setMapCandidateGeocodingProgress({
          done: index + 1,
          total: entries.length,
        });

        if (index < entries.length - 1) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, 450)
          );
        }
      }
    } finally {
      candidateMapGeocodingRef.current = false;
      setMapCandidateGeocoding(false);
    }
  };

  useEffect(() => {
    if (section !== "map" || mapView !== "candidates") return;
    void geocodeMissingCandidateMapPoints();
  }, [
    section,
    mapView,
    mapCandidateStatusFilters,
    mapStatusFilteredCandidates.length,
  ]);

  useEffect(() => {
    if (section !== "map" || regionsGeoJson) return;

    let cancelled = false;
    setMapBoundariesLoading(true);
    setMapBoundariesError("");

    fetch(ITALY_REGIONS_GEOJSON_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Confini regionali non disponibili");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setRegionsGeoJson(data);
      })
      .catch((error) => {
        console.error("ITALY REGIONS MAP ERROR:", error);
        if (!cancelled) {
          setMapBoundariesError("Non riesco a caricare i confini regionali italiani.");
        }
      })
      .finally(() => {
        if (!cancelled) setMapBoundariesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [section, regionsGeoJson]);

  useEffect(() => {
    if (section !== "map") return;
    void loadAll(ctx || undefined);
  }, [section]);

  useEffect(() => {
    if (section !== "map" || !mapElementRef.current || !regionsGeoJson) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapElementRef.current, {
        center: [42.6, 12.5],
        zoom: 5,
        minZoom: 4,
        maxZoom: 10,
        zoomControl: true,
        attributionControl: false,
        maxBounds: [
          [34.5, 5.2],
          [48.5, 20.2],
        ],
        maxBoundsViscosity: 1,
      });
      mapRef.current.getContainer().style.background = "#f8fafc";
      markersRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const markerLayer = markersRef.current;
    markerLayer?.clearLayers();

    if (regionsLayerRef.current) {
      regionsLayerRef.current.removeFrom(map);
      regionsLayerRef.current = null;
    }

    const selectedRegions =
      mapMode === "italy"
        ? [...ITALIAN_REGIONS]
        : visibleMapRegions.map((region) => normalizeItalianRegion(region));

    const filteredFeatures = (regionsGeoJson.features || []).filter((feature: any) => {
      const regionName = normalizeItalianRegion(String(feature?.properties?.reg_name || ""));
      return selectedRegions.includes(regionName as any);
    });

    const selectedGeoJson = {
      ...regionsGeoJson,
      features: filteredFeatures,
    };

    const regionLayer = L.geoJSON(selectedGeoJson, {
      style: () => ({
        color: "#475569",
        weight: 2,
        opacity: 1,
        fillColor: "#e2e8f0",
        fillOpacity: 0.92,
      }),
      onEachFeature: (feature: any, layer: any) => {
        const regionName = normalizeItalianRegion(
          String(feature?.properties?.reg_name || "")
        );

        layer.bindTooltip(regionName, {
          permanent: true,
          direction: "center",
          opacity: 0.95,
          interactive: false,
        });

        if (mapMode === "italy" || mapMode === "macroarea") {
          layer.on("click", () => {
            setMapReturnView({
              mode: mapMode,
              macroareaId: mapMacroareaId,
            });
            setMapRegion(regionName);
            setMapMode("region");
          });

          layer.on("mouseover", () => {
            layer.setStyle({
              fillColor: "#bfdbfe",
              fillOpacity: 0.98,
            });
          });

          layer.on("mouseout", () => {
            layer.setStyle({
              fillColor: "#e2e8f0",
              fillOpacity: 0.92,
            });
          });
        }
      },
    }).addTo(map);

    regionsLayerRef.current = regionLayer;

    mapAgentsToRender.forEach((agent) => {
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
      marker.addTo(markerLayer!);
    });

    if (mapView === "candidates") {
      visibleMapCandidates.forEach((candidate, index) => {
        if (
          candidate.id === focusedCandidateMap?.candidateId ||
          candidate.latitude === null ||
          candidate.longitude === null
        ) {
          return;
        }

        const statusStyle = getStatusDefinition(candidate.status);
        const nameParts = candidate.fullName
          .split(/\s+/)
          .filter(Boolean);
        const initials =
          nameParts
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join("")
            .toUpperCase() || "N";

        const hash = candidate.id
          .split("")
          .reduce(
            (acc, char) =>
              ((acc << 5) - acc + char.charCodeAt(0)) | 0,
            0
          );
        const angle = ((Math.abs(hash) % 360) * Math.PI) / 180;
        const radius = ((Math.abs(hash) % 4) + 1) * 0.0018;
        const markerLat =
          candidate.latitude + Math.sin(angle) * radius;
        const markerLng =
          candidate.longitude + Math.cos(angle) * radius;

        const candidateIcon = L.divIcon({
          className: "",
          html: `<div style="width:34px;height:34px;border-radius:999px;background:${statusStyle.background};color:${statusStyle.color};border:4px solid ${statusStyle.border};box-shadow:0 2px 8px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;">${escapeHtml(initials)}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([markerLat, markerLng], {
          icon: candidateIcon,
        });

        marker.bindTooltip(escapeHtml(candidate.fullName), {
          direction: "top",
          offset: [0, -15],
        });

        marker.bindPopup(
          `<div style="min-width:220px">
            <div style="font-size:11px;font-weight:900;color:${statusStyle.color};margin-bottom:4px">NOMINATIVO IN LAVORAZIONE</div>
            <div style="font-weight:900;font-size:15px;margin-bottom:7px">${escapeHtml(candidate.fullName)}</div>
            <div><strong>Stato:</strong> ${escapeHtml(statusStyle.label)}</div>
            <div><strong>Cellulare:</strong> ${escapeHtml(candidate.phone || "—")}</div>
            <div><strong>Email:</strong> ${escapeHtml(candidate.email || "—")}</div>
            <div><strong>Zona:</strong> ${escapeHtml(candidate.operationalZone || "—")}</div>
          </div>`
        );

        marker.addTo(markerLayer!);
      });
    }

    const focusedRegion = focusedCandidateMap
      ? normalizeItalianRegion(focusedCandidateMap.region || focusedCandidateMap.zone)
      : "";

    const focusedCandidateVisible =
      Boolean(focusedCandidateMap) &&
      (mapMode === "italy" || selectedRegions.includes(focusedRegion as any));

    if (focusedCandidateMap && focusedCandidateVisible) {
      const candidateIcon = L.divIcon({
        className: "",
        html: `<div style="width:38px;height:38px;border-radius:999px;background:#2563eb;color:white;border:4px solid white;box-shadow:0 3px 10px rgba(37,99,235,.42);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;">★</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const candidateMarker = L.marker(
        [focusedCandidateMap.latitude, focusedCandidateMap.longitude],
        { icon: candidateIcon }
      );

      candidateMarker.bindTooltip(
        escapeHtml(`CONTATTO: ${focusedCandidateMap.fullName}`),
        {
          permanent: true,
          direction: "top",
          offset: [0, -18],
          opacity: 0.95,
        }
      );

      candidateMarker.bindPopup(
        `<div style="min-width:210px">
          <div style="font-size:11px;font-weight:900;color:#2563eb;margin-bottom:4px">CONTATTO RECRUITING</div>
          <div style="font-weight:900;font-size:15px;margin-bottom:7px">${escapeHtml(focusedCandidateMap.fullName)}</div>
          <div><strong>Stato:</strong> ${escapeHtml(getStatusDefinition(focusedCandidateMap.status).label)}</div>
          <div><strong>Cellulare:</strong> ${escapeHtml(focusedCandidateMap.phone || "—")}</div>
          <div><strong>Email:</strong> ${escapeHtml(focusedCandidateMap.email || "—")}</div>
          <div><strong>Zona:</strong> ${escapeHtml(focusedCandidateMap.zone || "—")}</div>
        </div>`
      );

      candidateMarker.addTo(markerLayer!);
    }

    const markerCoords: Array<[number, number]> = mapAgentsToRender
      .filter((agent) => agent.latitude !== null && agent.longitude !== null)
      .map((agent) => [agent.latitude as number, agent.longitude as number]);

    if (mapView === "candidates") {
      visibleMapCandidates.forEach((candidate) => {
        if (
          candidate.latitude !== null &&
          candidate.longitude !== null
        ) {
          markerCoords.push([
            candidate.latitude,
            candidate.longitude,
          ]);
        }
      });
    }

    if (focusedCandidateMap && focusedCandidateVisible) {
      markerCoords.push([
        focusedCandidateMap.latitude,
        focusedCandidateMap.longitude,
      ]);
    }

    if (
      markerCoords.length &&
      (mapView === "candidates" ||
        (focusedCandidateMap && focusedCandidateVisible))
    ) {
      if (markerCoords.length === 1) {
        map.setView(markerCoords[0], 9);
      } else {
        map.fitBounds(L.latLngBounds(markerCoords), {
          padding: [65, 65],
          maxZoom: 9,
        });
      }
    } else if (filteredFeatures.length && regionLayer.getBounds().isValid()) {
      map.fitBounds(regionLayer.getBounds(), {
        padding: mapMode === "region" ? [45, 45] : [30, 30],
        maxZoom: mapMode === "region" ? 7 : 6,
      });
    } else {
      map.setView([42.6, 12.5], 5);
    }

    window.setTimeout(() => map.invalidateSize(), 50);
  }, [
    section,
    mapMode,
    mapRegion,
    mapMacroareaId,
    mapView,
    mapShowActiveAgents,
    mapAgentsToRender,
    visibleMapCandidates,
    visibleMapRegions,
    focusedCandidateMap,
    regionsGeoJson,
  ]);

  useEffect(() => {
    return () => {
      resetMapInstance();
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
      <style>{`
        .recruiting-contact-layout {
          display: grid;
          grid-template-columns: minmax(290px, 38%) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          min-width: 0;
        }

        .recruiting-candidate-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(150px, 185px);
          gap: 10px;
          align-items: center;
          min-width: 0;
        }

        .recruiting-status-column {
          align-self: stretch;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }

        .recruiting-status-menu {
          width: 100%;
          position: relative;
        }

        .recruiting-status-menu > summary {
          list-style: none;
        }

        .recruiting-status-menu > summary::-webkit-details-marker {
          display: none;
        }

        .recruiting-status-options {
          display: grid;
          gap: 5px;
          margin-top: 6px;
          padding: 7px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: white;
          box-shadow: 0 8px 22px rgba(15, 23, 42, .12);
        }

        .recruiting-status-option {
          width: 100%;
          border-radius: 8px;
          padding: 8px 9px;
          text-align: left;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .recruiting-detail-bottom-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr);
          gap: 14px;
          align-items: start;
          min-width: 0;
        }

        @media (max-width: 820px) {
          .recruiting-contact-layout,
          .recruiting-detail-bottom-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .recruiting-candidate-card {
            grid-template-columns: minmax(0, 1fr);
            gap: 8px;
          }

          .recruiting-status-column {
            width: 100%;
          }

          .recruiting-status-column select {
            min-height: 42px;
          }
        }

        .recruiting-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 5000;
          background: rgba(15, 23, 42, .55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .recruiting-modal {
          width: min(760px, 100%);
          max-height: 88vh;
          overflow: auto;
          background: white;
          border-radius: 16px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 20px 70px rgba(15, 23, 42, .35);
          padding: 18px;
        }
      `}</style>
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setSection("hr_notes")}
            style={{
              ...buttonStyle,
              background:
                section === "hr_notes" ? "#2563eb" : "white",
              color:
                section === "hr_notes" ? "white" : "#1d4ed8",
              border: "1px solid #93c5fd",
            }}
          >
            NOTE DA SINCRONIZZARE SU HR SPECIALIST
            {hrSyncNotes.length > 0 && (
              <span
                style={{
                  marginLeft: 7,
                  display: "inline-flex",
                  minWidth: 20,
                  height: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  padding: "0 5px",
                  background:
                    section === "hr_notes" ? "white" : "#2563eb",
                  color:
                    section === "hr_notes" ? "#2563eb" : "white",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                {hrSyncNotes.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSection("management")}
            style={{
              ...buttonStyle,
              background:
                section === "management" ? "#0f172a" : "white",
              color:
                section === "management" ? "white" : "#0f172a",
              border:
                section === "management"
                  ? "1px solid #0f172a"
                  : "1px solid #cbd5e1",
            }}
          >
            GESTIONE RECRUITING
          </button>
        </div>
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
                onClick={() => {
                  setDuplicateCandidates([]);
                  setShowNewContact((value) => !value);
                }}
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
                    <input
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value.toLocaleUpperCase("it"));
                        if (duplicateCandidates.length) {
                          setDuplicateCandidates([]);
                        }
                      }}
                      style={{
                        ...inputStyle,
                        textTransform: "uppercase",
                      }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Zona operativa</label>
                    <input
                      value={newZone}
                      onChange={(e) =>
                        setNewZone(e.target.value.toLocaleUpperCase("it"))
                      }
                      style={{
                        ...inputStyle,
                        textTransform: "uppercase",
                      }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Settore energia</label>
                    <select
                      value={newSectorEnergy ? "SI" : "NO"}
                      onChange={(e) => {
                        const isEnergy = e.target.value === "SI";
                        setNewSectorEnergy(isEnergy);
                        if (isEnergy) {
                          setNewSectorChoice("");
                          setNewSectorOther("");
                        } else {
                          setNewCompanyChoice("");
                          setNewCompanyName("");
                          if (!existingOtherSectors.length) {
                            setNewSectorChoice("__NEW__");
                          }
                        }
                      }}
                      style={inputStyle}
                    >
                      <option value="SI">SI</option>
                      <option value="NO">NO</option>
                    </select>
                  </div>

                  {newSectorEnergy ? (
                    <>
                      {existingCompanies.length > 0 && (
                        <div>
                          <label style={labelStyle}>Azienda</label>
                          <select
                            value={newCompanyChoice}
                            onChange={(e) => {
                              setNewCompanyChoice(e.target.value);
                              if (e.target.value !== "__NEW__") {
                                setNewCompanyName("");
                              }
                            }}
                            style={inputStyle}
                          >
                            <option value="">Seleziona azienda...</option>
                            {existingCompanies.map((company) => (
                              <option key={company} value={company}>
                                {company}
                              </option>
                            ))}
                            <option value="__NEW__">
                              + Aggiungi nuova azienda
                            </option>
                          </select>
                        </div>
                      )}

                      {(newCompanyChoice === "__NEW__" ||
                        !existingCompanies.length) && (
                        <div>
                          <label style={labelStyle}>Nuova azienda</label>
                          <input
                            value={newCompanyName}
                            onChange={(e) =>
                              setNewCompanyName(e.target.value)
                            }
                            placeholder="Scrivi il nome azienda"
                            style={inputStyle}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {existingOtherSectors.length > 0 && (
                        <div>
                          <label style={labelStyle}>Settore attuale</label>
                          <select
                            value={newSectorChoice}
                            onChange={(e) => {
                              setNewSectorChoice(e.target.value);
                              if (e.target.value !== "__NEW__") {
                                setNewSectorOther("");
                              }
                            }}
                            style={inputStyle}
                          >
                            <option value="">Seleziona settore...</option>
                            {existingOtherSectors.map((sector) => (
                              <option key={sector} value={sector}>
                                {sector}
                              </option>
                            ))}
                            <option value="__NEW__">+ Aggiungi nuovo settore</option>
                          </select>
                        </div>
                      )}

                      {(newSectorChoice === "__NEW__" ||
                        !existingOtherSectors.length) && (
                        <div>
                          <label style={labelStyle}>Nuovo settore</label>
                          <input
                            value={newSectorOther}
                            onChange={(e) => setNewSectorOther(e.target.value)}
                            placeholder="Scrivi il nuovo settore"
                            style={inputStyle}
                          />
                        </div>
                      )}
                    </>
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

                {duplicateCandidates.length > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      border: "3px solid #f59e0b",
                      borderRadius: 12,
                      background: "#fffbeb",
                      boxShadow: "0 4px 14px rgba(146,64,14,.12)",
                    }}
                  >
                    <div
                      style={{
                        color: "#92400e",
                        fontWeight: 900,
                        fontSize: 15,
                      }}
                    >
                      ⚠ NOMINATIVO GIÀ PRESENTE
                    </div>
                    <div
                      style={{
                        marginTop: 5,
                        color: "#78350f",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      Nel database esiste già un contatto con lo stesso nome.
                      Controlla i dati prima di procedere.
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 9,
                        marginTop: 12,
                      }}
                    >
                      {duplicateCandidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          style={{
                            padding: 11,
                            borderRadius: 10,
                            border: "1px solid #fcd34d",
                            background: "#ffffff",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit,minmax(170px,1fr))",
                              gap: 9,
                            }}
                          >
                            <div>
                              <div style={labelStyle}>Nome</div>
                              <strong>
                                {candidate.fullName || "—"}
                              </strong>
                            </div>
                            <div>
                              <div style={labelStyle}>Cellulare</div>
                              <strong>
                                {candidate.phone || "—"}
                              </strong>
                            </div>
                            <div>
                              <div style={labelStyle}>Zona</div>
                              <strong>
                                {candidate.operationalZone || "—"}
                              </strong>
                            </div>
                            <div>
                              <div style={labelStyle}>Email</div>
                              <strong
                                style={{
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {candidate.email || "—"}
                              </strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        fontWeight: 900,
                        color: "#78350f",
                      }}
                    >
                      Vuoi procedere comunque con il nuovo salvataggio?
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void createCandidate(true)}
                        style={{
                          ...buttonStyle,
                          background: "#dc2626",
                          color: "white",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        SÌ, PROCEDI COMUNQUE
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDuplicateCandidates([])}
                        style={{
                          ...buttonStyle,
                          background: "#e2e8f0",
                          color: "#0f172a",
                        }}
                      >
                        NO, NON SALVARE
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createCandidate()}
                    style={{ ...buttonStyle, background: "#16a34a", color: "white", opacity: busy ? 0.6 : 1 }}
                  >
                    Salva contatto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateCandidates([]);
                      setShowNewContact(false);
                    }}
                    style={{ ...buttonStyle, background: "#e2e8f0" }}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                gap: 10,
                marginTop: 14,
              }}
            >
              <div>
                <label style={labelStyle}>Nome</label>
                <input
                  type="search"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Cerca nome..."
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Zona</label>
                <input
                  type="search"
                  list="recruiting-zone-options"
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  placeholder="Cerca zona..."
                  style={inputStyle}
                />
                <datalist id="recruiting-zone-options">
                  {existingZones.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={labelStyle}>Regione</label>
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  style={{ ...inputStyle, textTransform: "uppercase" }}
                >
                  <option value="">TUTTE LE REGIONI</option>
                  {ITALIAN_REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region.toLocaleUpperCase("it")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Settore energia</label>
                <select
                  value={sectorFilter}
                  onChange={(e) => {
                    const value = e.target.value as "" | "SI" | "NO";
                    setSectorFilter(value);
                    if (value !== "NO") setSectorOtherFilter("");
                    if (value !== "SI") setCompanyFilter("");
                  }}
                  style={inputStyle}
                >
                  <option value="">Tutti</option>
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </div>

              {sectorFilter === "NO" && (
                <div>
                  <label style={labelStyle}>Settore</label>
                  <select
                    value={sectorOtherFilter}
                    onChange={(e) => setSectorOtherFilter(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Tutti i settori</option>
                    {existingOtherSectors.map((sector) => (
                      <option key={sector} value={sector}>
                        {sector}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <label style={{ ...labelStyle, marginBottom: 5 }}>Stato</label>
                  <button
                    type="button"
                    onClick={() => setShowStatusManager((value) => !value)}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "#2563eb",
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    MODIFICA
                  </button>
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    const value = e.target.value as "" | CandidateStatus;
                    setStatusFilter(value);
                    if (value !== "INOLTRATO_A") {
                      setForwardedToFilter("");
                    }
                  }}
                  style={inputStyle}
                >
                  <option value="">Tutti gli stati</option>
                  {statusDefinitions.map((option) => (
                    <option
                      key={option.code}
                      value={option.code}
                      style={{
                        background: option.background,
                        color: option.color,
                        fontWeight: 800,
                      }}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Chiamato da me</label>
                <select
                  value={calledByMeFilter}
                  onChange={(e) =>
                    setCalledByMeFilter(
                      e.target.value as "" | "SI" | "NO"
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">Tutti</option>
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </div>

              {sectorFilter === "SI" && (
                <div>
                  <label style={labelStyle}>Azienda</label>
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Tutte le aziende</option>
                    {existingCompanies.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {statusFilter === "INOLTRATO_A" && (
                <div>
                  <label style={labelStyle}>Inoltrato a</label>
                  <select
                    value={forwardedToFilter}
                    onChange={(e) => setForwardedToFilter(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Tutti</option>
                    {existingForwardedRecipients.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "end",
                }}
              >
                <button
                  type="button"
                  onClick={resetContactFilters}
                  disabled={!hasActiveContactFilters}
                  style={{
                    ...buttonStyle,
                    width: "100%",
                    minHeight: 40,
                    background: hasActiveContactFilters
                      ? "#fee2e2"
                      : "#f1f5f9",
                    color: hasActiveContactFilters
                      ? "#b91c1c"
                      : "#94a3b8",
                    border: hasActiveContactFilters
                      ? "1px solid #fecaca"
                      : "1px solid #e2e8f0",
                    opacity: hasActiveContactFilters ? 1 : 0.7,
                    cursor: hasActiveContactFilters
                      ? "pointer"
                      : "default",
                  }}
                >
                  AZZERA FILTRI
                </button>
              </div>
            </div>
          </div>

          {showStatusManager && (
            <div
              style={{
                ...cardStyle,
                borderColor: "#c7d2fe",
                background: "#f8faff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>Gestione stati</h3>
                  <div
                    style={{
                      marginTop: 4,
                      color: "#64748b",
                      fontSize: 12,
                    }}
                  >
                    Puoi modificare nome e colore, eliminare uno stato oppure
                    crearne uno nuovo. Sono disponibili {STATUS_COLOR_PALETTE.length} colori.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    cancelEditStatus();
                    setShowStatusManager(false);
                  }}
                  style={{ ...buttonStyle, background: "#e2e8f0" }}
                >
                  Chiudi
                </button>
              </div>

              <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
                {statusDefinitions.map((status) => {
                  const isEditing = editingStatusCode === status.code;

                  return (
                    <div
                      key={status.code}
                      style={{
                        padding: 11,
                        borderRadius: 10,
                        border: `3px solid ${status.border}`,
                        background: status.background,
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          <div>
                            <label style={labelStyle}>Nome stato</label>
                            <input
                              value={editingStatusLabel}
                              onChange={(e) =>
                                setEditingStatusLabel(
                                  e.target.value.toLocaleUpperCase("it")
                                )
                              }
                              style={inputStyle}
                            />
                          </div>

                          <div>
                            <label style={labelStyle}>Colore</label>
                            <StatusColorPicker
                              value={editingStatusColorKey}
                              onChange={setEditingStatusColorKey}
                            />
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveEditedStatus(status)}
                              style={{
                                ...buttonStyle,
                                background: "#2563eb",
                                color: "white",
                                opacity: busy ? 0.6 : 1,
                              }}
                            >
                              SALVA
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={cancelEditStatus}
                              style={{
                                ...buttonStyle,
                                background: "#e2e8f0",
                              }}
                            >
                              ANNULLA
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(160px,1fr) auto",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong style={{ color: status.color }}>
                              {status.label}
                            </strong>
                            <div
                              style={{
                                marginTop: 4,
                                color: status.color,
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              {statusPaletteByKey(status.colorKey).name}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 7,
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => startEditStatus(status)}
                              style={{
                                ...buttonStyle,
                                background: "#dbeafe",
                                color: "#1d4ed8",
                              }}
                            >
                              MODIFICA
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void deleteStatusDefinition(status)
                              }
                              style={{
                                ...buttonStyle,
                                background: "#fee2e2",
                                color: "#b91c1c",
                                opacity: busy ? 0.6 : 1,
                              }}
                            >
                              ELIMINA
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid #c7d2fe",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Nuovo stato</label>
                  <input
                    value={newStatusLabel}
                    onChange={(e) =>
                      setNewStatusLabel(
                        e.target.value.toLocaleUpperCase("it")
                      )
                    }
                    placeholder="Es. DA RICHIAMARE"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Colore</label>
                  <StatusColorPicker
                    value={newStatusColorKey}
                    onChange={setNewStatusColorKey}
                  />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addCustomStatus()}
                  style={{
                    ...buttonStyle,
                    width: "fit-content",
                    background: "#2563eb",
                    color: "white",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  + AGGIUNGI STATO
                </button>
              </div>
            </div>
          )}

          <div className="recruiting-contact-layout">
            <div style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 9,
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 0 }}>
                  Lista nominativi
                </h3>
                <span
                  style={{
                    color: "#dc2626",
                    fontSize: 17,
                    fontWeight: 950,
                  }}
                >
                  {hasActiveContactFilters
                    ? `${filteredCandidates.length} SU ${candidates.length}`
                    : candidates.length}
                </span>
              </div>
              <div style={{ maxHeight: 720, overflow: "auto", display: "grid", gap: 7 }}>
                {filteredCandidates.map((candidate) => {
                  const active = candidate.id === selectedCandidateId;
                  const statusStyle =
                    getStatusDefinition(candidate.status);
                  const href = phoneHref(candidate.phone);

                  return (
                    <div
                      id={`recruiting-candidate-${candidate.id}`}
                      key={candidate.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setContactEditMode(false);
                        setSelectedCandidateId(candidate.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setContactEditMode(false);
                          setSelectedCandidateId(candidate.id);
                        }
                      }}
                      className="recruiting-candidate-card"
                      style={{
                        textAlign: "left",
                        border: `6px solid ${statusStyle.border}`,
                        background: active ? statusStyle.background : "#ffffff",
                        boxShadow: active
                          ? "0 0 0 3px rgba(37,99,235,.22)"
                          : "0 2px 7px rgba(15,23,42,.06)",
                        borderRadius: 10,
                        padding: 11,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {candidate.fullName}
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            color: "#dc2626",
                            fontSize: 13,
                            fontWeight: 900,
                          }}
                        >
                          <span>
                            {(candidate.operationalZone || "ZONA NON INDICATA").toLocaleUpperCase("it")}
                          </span>
                          {(candidate.provinceCode || candidate.region) && (
                            <span
                              style={{
                                marginLeft: 7,
                                color: "#475569",
                                fontWeight: 800,
                              }}
                            >
                              {candidate.provinceCode
                                ? `· ${candidate.provinceCode}`
                                : ""}
                              {candidate.region
                                ? ` · ${candidate.region.toLocaleUpperCase("it")}`
                                : ""}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            marginTop: 5,
                            flexWrap: "wrap",
                          }}
                        >
                          {candidate.phone ? (
                            <>
                              <a
                                href={href}
                                onClick={(event) => event.stopPropagation()}
                                style={{
                                  color: "#111827",
                                  textDecoration: "underline",
                                  fontSize: 13,
                                  fontWeight: 800,
                                }}
                              >
                                {candidate.phone}
                              </a>
                              <a
                                href={href}
                                aria-label={`Chiama ${candidate.fullName}`}
                                title="Chiama"
                                onClick={(event) => event.stopPropagation()}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 30,
                                  height: 30,
                                  borderRadius: 999,
                                  background: "#dcfce7",
                                  border: "1px solid #86efac",
                                  color: "#166534",
                                  textDecoration: "none",
                                  fontSize: 16,
                                }}
                              >
                                ☎
                              </a>
                            </>
                          ) : (
                            <span style={{ color: "#64748b", fontSize: 13 }}>
                              Telefono non indicato
                            </span>
                          )}

                          {candidate.email && (
                            <a
                              href={emailHref(candidate.email)}
                              aria-label={`Invia email a ${candidate.fullName}`}
                              title={`Invia email a ${candidate.email}`}
                              onClick={(event) => event.stopPropagation()}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 30,
                                height: 30,
                                borderRadius: 999,
                                background: "#dbeafe",
                                border: "1px solid #93c5fd",
                                color: "#1d4ed8",
                                textDecoration: "none",
                                fontSize: 16,
                              }}
                            >
                              ✉
                            </a>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          Settore energia:{" "}
                          {candidate.sectorEnergy
                            ? `SI${candidate.companyName ? ` · ${candidate.companyName}` : ""}`
                            : `NO${candidate.sectorOther ? ` · ${candidate.sectorOther}` : ""}`}
                        </div>
                      </div>

                      <div
                        className="recruiting-status-column"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {calledByMeCandidateIds.has(candidate.id) && (
                          <div
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              marginBottom: 7,
                              padding: "6px 8px",
                              borderRadius: 8,
                              background: "#ede9fe",
                              color: "#6d28d9",
                              border: "1px solid #c4b5fd",
                              fontSize: 10,
                              fontWeight: 900,
                              textAlign: "center",
                            }}
                          >
                            CHIAMATO DA ME
                          </div>
                        )}

                        <details className="recruiting-status-menu">
                          <summary
                            aria-label={`Stato di ${candidate.fullName}`}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              borderRadius: 9,
                              padding: "8px 9px",
                              fontSize: 11,
                              fontWeight: 900,
                              border: `1px solid ${statusStyle.border}`,
                              background: statusStyle.background,
                              color: statusStyle.color,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span>{statusStyle.label}</span>
                            <span>▾</span>
                          </summary>

                          <div className="recruiting-status-options">
                            {statusDefinitions.map((option) => (
                              <button
                                key={option.code}
                                type="button"
                                className="recruiting-status-option"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void updateCandidateStatus(
                                    candidate,
                                    option.code
                                  );
                                  event.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                }}
                                style={{
                                  border: `1px solid ${option.border}`,
                                  background: option.background,
                                  color: option.color,
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </details>

                        {candidate.status === "INOLTRATO_A" && (
                          <div
                            style={{
                              width: "100%",
                              marginTop: 8,
                              padding: 8,
                              boxSizing: "border-box",
                              borderRadius: 9,
                              background: "#eef2ff",
                              border: "1px solid #c7d2fe",
                            }}
                          >
                            <label
                              style={{
                                display: "block",
                                marginBottom: 5,
                                color: "#4338ca",
                                fontSize: 10,
                                fontWeight: 900,
                              }}
                            >
                              INOLTRATO A
                            </label>
                            <select
                              value={
                                forwardedNewCandidateId === candidate.id
                                  ? "__NEW__"
                                  : candidate.forwardedTo
                              }
                              onChange={(event) => {
                                event.stopPropagation();
                                const value = event.target.value;

                                if (value === "__NEW__") {
                                  beginNewForwardedRecipient(candidate.id);
                                  return;
                                }

                                setForwardedNewCandidateId(null);
                                setForwardedNewName("");
                                void updateCandidateForwardedTo(
                                  candidate,
                                  value
                                );
                              }}
                              style={{
                                ...inputStyle,
                                padding: "7px 8px",
                                fontSize: 12,
                              }}
                            >
                              <option value="">Seleziona...</option>
                              {existingForwardedRecipients.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                              <option value="__NEW__">
                                + Aggiungi nuovo nome
                              </option>
                            </select>

                            {forwardedNewCandidateId === candidate.id && (
                              <div
                                style={{
                                  display: "grid",
                                  gap: 6,
                                  marginTop: 7,
                                }}
                              >
                                <input
                                  value={forwardedNewName}
                                  onChange={(event) =>
                                    setForwardedNewName(
                                      event.target.value
                                    )
                                  }
                                  placeholder="Scrivi il nuovo nome"
                                  style={{
                                    ...inputStyle,
                                    padding: "7px 8px",
                                    fontSize: 12,
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void saveNewForwardedRecipient(
                                      candidate
                                    )
                                  }
                                  style={{
                                    ...buttonStyle,
                                    padding: "7px 9px",
                                    background: "#4f46e5",
                                    color: "white",
                                    fontSize: 11,
                                  }}
                                >
                                  Salva nome
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
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

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!contactEditMode ? (
                          <button
                            type="button"
                            onClick={() => setContactEditMode(true)}
                            style={{
                              ...buttonStyle,
                              padding: "7px 10px",
                              background: "#0f172a",
                              color: "white",
                            }}
                          >
                            MODIFICA
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditName(selectedCandidate.fullName);
                              setEditZone(selectedCandidate.operationalZone);
                              setEditProvinceCode(selectedCandidate.provinceCode);
                              setEditRegion(selectedCandidate.region);
                              setEditSectorEnergy(selectedCandidate.sectorEnergy);
                              setEditSectorOther(selectedCandidate.sectorOther);
                              setEditCompanyChoice(selectedCandidate.companyName || "");
                              setEditCompanyName("");
                              setEditPhone(selectedCandidate.phone);
                              setEditEmail(selectedCandidate.email);
                              setContactEditMode(false);
                            }}
                            style={{
                              ...buttonStyle,
                              padding: "7px 10px",
                              background: "#e2e8f0",
                              color: "#334155",
                            }}
                          >
                            ANNULLA MODIFICA
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={mapCandidateBusyId === selectedCandidate.id}
                          onClick={() => void showCandidateOnMap(selectedCandidate)}
                          style={{
                            ...buttonStyle,
                            padding: "7px 10px",
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            border: "1px solid #93c5fd",
                            opacity:
                              mapCandidateBusyId === selectedCandidate.id ? 0.65 : 1,
                          }}
                        >
                          {mapCandidateBusyId === selectedCandidate.id
                            ? "Posiziono..."
                            : "📍 MOSTRA IN MAPPA"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteCandidate()}
                          style={{ ...buttonStyle, padding: "7px 10px", background: "#fee2e2", color: "#991b1b" }}
                        >
                          Elimina contatto
                        </button>
                      </div>
                    </div>

                    {!contactEditMode ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(190px,1fr))",
                          gap: 10,
                          marginTop: 14,
                        }}
                      >
                        <div>
                          <label style={labelStyle}>Nome e cognome</label>
                          <div style={{ fontWeight: 900 }}>
                            {selectedCandidate.fullName}
                          </div>
                        </div>

                        <div>
                          <label style={labelStyle}>Città / zona operativa</label>
                          <div style={{ fontWeight: 900 }}>
                            {(selectedCandidate.operationalZone || "—").toLocaleUpperCase("it")}
                          </div>
                        </div>

                        <div>
                          <label style={labelStyle}>Provincia</label>
                          <div style={{ fontWeight: 900 }}>
                            {(selectedCandidate.provinceCode || "—").toLocaleUpperCase("it")}
                          </div>
                        </div>

                        <div>
                          <label style={labelStyle}>Regione</label>
                          <div style={{ fontWeight: 900 }}>
                            {(selectedCandidate.region || "—").toLocaleUpperCase("it")}
                          </div>
                        </div>

                        <div>
                          <label style={labelStyle}>Settore energia</label>
                          <div style={{ fontWeight: 900 }}>
                            {selectedCandidate.sectorEnergy
                              ? `SI${selectedCandidate.companyName ? ` · ${selectedCandidate.companyName}` : ""}`
                              : `NO${selectedCandidate.sectorOther ? ` · ${selectedCandidate.sectorOther}` : ""}`}
                          </div>
                        </div>

                        <div>
                          <label style={labelStyle}>Numero di telefono</label>
                          {selectedCandidate.phone ? (
                            <a
                              href={phoneHref(selectedCandidate.phone)}
                              style={{
                                color: "#111827",
                                textDecoration: "underline",
                                fontWeight: 900,
                              }}
                            >
                              {selectedCandidate.phone}
                            </a>
                          ) : (
                            <div>—</div>
                          )}
                        </div>

                        <div>
                          <label style={labelStyle}>Email</label>
                          {selectedCandidate.email ? (
                            <a
                              href={emailHref(selectedCandidate.email)}
                              style={{
                                color: "#1d4ed8",
                                textDecoration: "underline",
                                fontWeight: 800,
                              }}
                            >
                              {selectedCandidate.email}
                            </a>
                          ) : (
                            <div>—</div>
                          )}
                        </div>

                        <div>
                          <label style={labelStyle}>Stato</label>
                          <div
                            style={{
                              display: "inline-block",
                              padding: "7px 10px",
                              borderRadius: 9,
                              border: `2px solid ${getStatusDefinition(selectedCandidate.status).border}`,
                              background:
                                getStatusDefinition(selectedCandidate.status)
                                  .background,
                              color:
                                getStatusDefinition(selectedCandidate.status)
                                  .color,
                              fontWeight: 900,
                            }}
                          >
                            {getStatusDefinition(selectedCandidate.status).label}
                          </div>
                        </div>

                        {selectedCandidate.status === "INOLTRATO_A" && (
                          <div>
                            <label style={labelStyle}>Inoltrato a</label>
                            <div style={{ fontWeight: 900 }}>
                              {selectedCandidate.forwardedTo || "—"}
                            </div>
                          </div>
                        )}

                        <div>
                          <label style={labelStyle}>Chiamato da me</label>
                          <div style={{ fontWeight: 900 }}>
                            {calledByMeCandidateIds.has(selectedCandidate.id)
                              ? "SI"
                              : "NO"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit,minmax(190px,1fr))",
                            gap: 10,
                            marginTop: 14,
                          }}
                        >
                          <div>
                            <label style={labelStyle}>Nome e cognome</label>
                            <input
                              value={editName}
                              onChange={(e) =>
                                setEditName(
                                  e.target.value.toLocaleUpperCase("it")
                                )
                              }
                              style={{
                                ...inputStyle,
                                textTransform: "uppercase",
                              }}
                            />
                          </div>

                          <div>
                            <label style={labelStyle}>
                              Città / zona operativa
                            </label>
                            <input
                              value={editZone}
                              onChange={(e) =>
                                setEditZone(
                                  e.target.value.toLocaleUpperCase("it")
                                )
                              }
                              onBlur={(e) =>
                                void autofillEditGeography(
                                  e.currentTarget.value
                                )
                              }
                              style={{
                                ...inputStyle,
                                textTransform: "uppercase",
                              }}
                            />
                          </div>

                          <div>
                            <label style={labelStyle}>Provincia</label>
                            <input
                              value={editProvinceCode}
                              maxLength={2}
                              placeholder="PG"
                              onChange={(e) => {
                                const code = normalizeProvinceCode(
                                  e.target.value
                                );
                                setEditProvinceCode(code);
                                const automaticRegion =
                                  regionFromProvinceCode(code);
                                if (automaticRegion) {
                                  setEditRegion(automaticRegion);
                                }
                              }}
                              style={{
                                ...inputStyle,
                                textTransform: "uppercase",
                                fontWeight: 900,
                              }}
                            />
                          </div>

                          <div>
                            <label style={labelStyle}>Regione</label>
                            <select
                              value={editRegion}
                              onChange={(e) =>
                                setEditRegion(e.target.value)
                              }
                              style={{
                                ...inputStyle,
                                textTransform: "uppercase",
                              }}
                            >
                              <option value="">SELEZIONA REGIONE...</option>
                              {ITALIAN_REGIONS.map((region) => (
                                <option key={region} value={region}>
                                  {region.toLocaleUpperCase("it")}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={labelStyle}>Settore energia</label>
                            <select
                              value={editSectorEnergy ? "SI" : "NO"}
                              onChange={(e) => {
                                const isEnergy =
                                  e.target.value === "SI";
                                setEditSectorEnergy(isEnergy);
                                if (!isEnergy) {
                                  setEditCompanyChoice("");
                                  setEditCompanyName("");
                                } else if (
                                  selectedCandidate?.companyName
                                ) {
                                  setEditCompanyChoice(
                                    selectedCandidate.companyName
                                  );
                                }
                              }}
                              style={inputStyle}
                            >
                              <option value="SI">SI</option>
                              <option value="NO">NO</option>
                            </select>
                          </div>

                          {editSectorEnergy ? (
                            <>
                              {existingCompanies.length > 0 && (
                                <div>
                                  <label style={labelStyle}>Azienda</label>
                                  <select
                                    value={editCompanyChoice}
                                    onChange={(e) => {
                                      setEditCompanyChoice(
                                        e.target.value
                                      );
                                      if (
                                        e.target.value !== "__NEW__"
                                      ) {
                                        setEditCompanyName("");
                                      }
                                    }}
                                    style={inputStyle}
                                  >
                                    <option value="">
                                      Seleziona azienda...
                                    </option>
                                    {existingCompanies.map(
                                      (company) => (
                                        <option
                                          key={company}
                                          value={company}
                                        >
                                          {company}
                                        </option>
                                      )
                                    )}
                                    <option value="__NEW__">
                                      + Aggiungi nuova azienda
                                    </option>
                                  </select>
                                </div>
                              )}

                              {(editCompanyChoice === "__NEW__" ||
                                !existingCompanies.length) && (
                                <div>
                                  <label style={labelStyle}>
                                    Nuova azienda
                                  </label>
                                  <input
                                    value={editCompanyName}
                                    onChange={(e) =>
                                      setEditCompanyName(
                                        e.target.value
                                      )
                                    }
                                    placeholder="Scrivi il nome azienda"
                                    style={inputStyle}
                                  />
                                </div>
                              )}
                            </>
                          ) : (
                            <div>
                              <label style={labelStyle}>
                                Settore attuale
                              </label>
                              <input
                                value={editSectorOther}
                                onChange={(e) =>
                                  setEditSectorOther(e.target.value)
                                }
                                placeholder="Scrivi il settore"
                                style={inputStyle}
                              />
                            </div>
                          )}

                          <div>
                            <label style={labelStyle}>
                              Numero di telefono
                            </label>
                            <input
                              value={editPhone}
                              onChange={(e) =>
                                setEditPhone(e.target.value)
                              }
                              style={inputStyle}
                            />
                          </div>

                          <div>
                            <label style={labelStyle}>Email</label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) =>
                                setEditEmail(e.target.value)
                              }
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveCandidate()}
                          style={{
                            ...buttonStyle,
                            marginTop: 12,
                            background: "#2563eb",
                            color: "white",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          Salva modifiche
                        </button>
                      </>
                    )}
                  </div>

                  <div className="recruiting-detail-bottom-layout">
                    <div style={cardStyle}>
                      <h3 style={{ marginTop: 0 }}>Note del contatto</h3>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "end",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ width: 220, maxWidth: "100%" }}>
                            <label style={labelStyle}>Data nota</label>
                            <input
                              type="date"
                              value={noteDate}
                              onChange={(e) => setNoteDate(e.target.value)}
                              style={inputStyle}
                            />
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "end",
                              flexWrap: "wrap",
                              flex: "1 1 360px",
                            }}
                          >
                            <div
                              style={{
                                width: 260,
                                maxWidth: "100%",
                                flex: "1 1 240px",
                              }}
                            >
                              <label style={labelStyle}>Stato</label>
                              <select
                                value={noteStatusDraft}
                                onChange={(e) =>
                                  setNoteStatusDraft(e.target.value)
                                }
                                style={{
                                  ...inputStyle,
                                  border: `2px solid ${getStatusDefinition(noteStatusDraft).border}`,
                                  background:
                                    getStatusDefinition(noteStatusDraft)
                                      .background,
                                  color:
                                    getStatusDefinition(noteStatusDraft)
                                      .color,
                                  fontWeight: 900,
                                }}
                              >
                                {statusDefinitions.map((option) => (
                                  <option
                                    key={option.code}
                                    value={option.code}
                                    style={{
                                      background: option.background,
                                      color: option.color,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              type="button"
                              disabled={busy || !noteStatusDraft}
                              onClick={() => void confirmNoteStatus()}
                              style={{
                                ...buttonStyle,
                                minHeight: 40,
                                background: "#16a34a",
                                color: "white",
                                opacity:
                                  busy || !noteStatusDraft ? 0.6 : 1,
                              }}
                            >
                              OK
                            </button>
                          </div>
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

                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "fit-content",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={noteCalledByMe}
                            onChange={(e) => setNoteCalledByMe(e.target.checked)}
                            style={{ width: 18, height: 18 }}
                          />
                          Chiamato da me
                        </label>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          marginTop: 9,
                        }}
                      >
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addNote(false)}
                          style={{
                            ...buttonStyle,
                            background: "#0f172a",
                            color: "white",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          Aggiungi nota
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addNote(true)}
                          style={{
                            ...buttonStyle,
                            marginLeft: "auto",
                            background: "#2563eb",
                            color: "white",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          AGGIUNGI NOTA E SU HR
                        </button>
                      </div>

                      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                        {selectedNotes.map((note) => {
                          const isEditing = editingNoteId === note.id;

                          return (
                            <div
                              key={note.id}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 9,
                                padding: 11,
                              }}
                            >
                              {isEditing ? (
                                <div style={{ display: "grid", gap: 9 }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "minmax(150px,220px) minmax(180px,1fr)",
                                      gap: 10,
                                    }}
                                  >
                                    <div>
                                      <label style={labelStyle}>Data nota</label>
                                      <input
                                        type="date"
                                        value={editingNoteDate}
                                        onChange={(e) =>
                                          setEditingNoteDate(e.target.value)
                                        }
                                        style={inputStyle}
                                      />
                                    </div>

                                    <label
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        alignSelf: "end",
                                        minHeight: 40,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editingNoteCalledByMe}
                                        onChange={(e) =>
                                          setEditingNoteCalledByMe(
                                            e.target.checked
                                          )
                                        }
                                        style={{ width: 18, height: 18 }}
                                      />
                                      Chiamato da me
                                    </label>
                                  </div>

                                  <div>
                                    <label style={labelStyle}>Nota</label>
                                    <textarea
                                      value={editingNoteText}
                                      onChange={(e) =>
                                        setEditingNoteText(e.target.value)
                                      }
                                      rows={4}
                                      style={{
                                        ...inputStyle,
                                        resize: "vertical",
                                      }}
                                    />
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void saveEditedNote(note)
                                      }
                                      style={{
                                        ...buttonStyle,
                                        background: "#2563eb",
                                        color: "white",
                                        opacity: busy ? 0.6 : 1,
                                      }}
                                    >
                                      Salva modifiche
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={cancelEditNote}
                                      style={{
                                        ...buttonStyle,
                                        background: "#e2e8f0",
                                        color: "#0f172a",
                                      }}
                                    >
                                      Annulla
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 8,
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <strong>
                                        {formatDate(note.noteDate)}
                                      </strong>
                                      {note.calledByMe && (
                                        <span
                                          style={{
                                            color: "#6d28d9",
                                            fontSize: 12,
                                            fontWeight: 900,
                                          }}
                                        >
                                          ALESSIO CEDRONI DICE:
                                        </span>
                                      )}
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => startEditNote(note)}
                                        style={{
                                          border: 0,
                                          background: "transparent",
                                          color: "#2563eb",
                                          fontWeight: 900,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Modifica
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void deleteNote(note)}
                                        style={{
                                          border: 0,
                                          background: "transparent",
                                          color: "#b91c1c",
                                          fontWeight: 800,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Elimina
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 6,
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {note.noteText}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                        {!selectedNotes.length && <div style={{ color: "#64748b" }}>Nessuna nota inserita.</div>}
                      </div>
                    </div>

                    <div style={{ ...cardStyle, borderColor: "#fed7aa", background: "#fff7ed" }}>
                      <h3 style={{ marginTop: 0 }}>Programma attività</h3>
                      <div style={{ color: "#9a3412", fontSize: 13, marginBottom: 11 }}>
                        La chiamata o l'appuntamento verrà inserito nel CALENDARIO.
                      </div>

                      <div style={{ marginBottom: 9 }}>
                        <label style={labelStyle}>Contatto</label>
                        <select
                          value={activityCandidateId || selectedCandidate.id}
                          onChange={(e) =>
                            setActivityCandidateId(e.target.value)
                          }
                          style={inputStyle}
                        >
                          {alphabeticalCandidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.fullName}
                            </option>
                          ))}
                        </select>
                        <div
                          style={{
                            marginTop: 5,
                            color: "#64748b",
                            fontSize: 11,
                          }}
                        >
                          Il nominativo scelto sarà collegato all'attività e potrà essere aperto dal CALENDARIO con il tasto SCHEDA.
                        </div>
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
                              <button
                                type="button"
                                onClick={() =>
                                  openEventModal(event, "edit")
                                }
                                style={{
                                  ...buttonStyle,
                                  marginTop: 6,
                                  padding: "5px 8px",
                                  background: "#fff",
                                  color: "#c2410c",
                                  border: "1px solid #fdba74",
                                  fontSize: 10,
                                }}
                              >
                                MODIFICA
                              </button>
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
          <div
            style={{
              ...cardStyle,
              borderColor: googleCalendarConnected ? "#86efac" : "#bfdbfe",
              background: googleCalendarConnected ? "#f0fdf4" : "#eff6ff",
            }}
          >
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
                <h3 style={{ margin: 0 }}>Google Calendar</h3>
                <div
                  style={{
                    marginTop: 5,
                    color: googleCalendarConnected ? "#166534" : "#1e40af",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {googleCalendarConnected
                    ? "● COLLEGATO · le nuove attività e le modifiche vengono sincronizzate automaticamente."
                    : googleCalendarConfigured
                    ? "○ NON COLLEGATO"
                    : "Configurazione Google Calendar non disponibile."}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {!googleCalendarConnected ? (
                  <button
                    type="button"
                    disabled={googleCalendarBusy || !googleCalendarConfigured}
                    onClick={() => void connectGoogleCalendar()}
                    style={{
                      ...buttonStyle,
                      background: "#2563eb",
                      color: "white",
                      opacity:
                        googleCalendarBusy || !googleCalendarConfigured
                          ? 0.6
                          : 1,
                    }}
                  >
                    {googleCalendarBusy
                      ? "COLLEGAMENTO..."
                      : "COLLEGA GOOGLE CALENDAR"}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={googleCalendarBusy}
                      onClick={() => void syncAllGoogle()}
                      style={{
                        ...buttonStyle,
                        background: "#16a34a",
                        color: "white",
                        opacity: googleCalendarBusy ? 0.6 : 1,
                      }}
                    >
                      {googleCalendarBusy
                        ? "SINCRONIZZAZIONE..."
                        : "↻ SINCRONIZZA ORA"}
                    </button>

                    <button
                      type="button"
                      disabled={googleCalendarBusy}
                      onClick={() => void disconnectGoogle()}
                      style={{
                        ...buttonStyle,
                        background: "white",
                        color: "#b91c1c",
                        border: "1px solid #fecaca",
                      }}
                    >
                      DISCONNETTI
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Nuova attività</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Contatto</label>
                <select value={calendarCandidateId} onChange={(e) => setCalendarCandidateId(e.target.value)} style={inputStyle}>
                  <option value="">Senza contatto</option>
                  {alphabeticalCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.fullName}
                    </option>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(210px,1fr))",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={labelStyle}>Ricerca libera</label>
                <input
                  type="search"
                  value={calendarSearchFilter}
                  onChange={(e) =>
                    setCalendarSearchFilter(e.target.value)
                  }
                  placeholder="Cerca nome, attività o note..."
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Nominativo associato</label>
                <select
                  value={calendarCandidateFilter}
                  onChange={(e) =>
                    setCalendarCandidateFilter(e.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="">TUTTI I NOMINATIVI</option>
                  {calendarAssociatedCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Tipologia attività</label>
                <select
                  value={calendarTypeFilter}
                  onChange={(e) =>
                    setCalendarTypeFilter(
                      e.target.value as "" | EventType
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">TUTTE LE ATTIVITÀ</option>
                  {Object.entries(EVENT_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "end",
                }}
              >
                <button
                  type="button"
                  onClick={resetCalendarFilters}
                  disabled={
                    !calendarSearchFilter.trim() &&
                    !calendarCandidateFilter &&
                    !calendarTypeFilter
                  }
                  style={{
                    ...buttonStyle,
                    width: "100%",
                    minHeight: 40,
                    background:
                      calendarSearchFilter.trim() ||
                      calendarCandidateFilter ||
                      calendarTypeFilter
                        ? "#fee2e2"
                        : "#f1f5f9",
                    color:
                      calendarSearchFilter.trim() ||
                      calendarCandidateFilter ||
                      calendarTypeFilter
                        ? "#b91c1c"
                        : "#94a3b8",
                    border:
                      calendarSearchFilter.trim() ||
                      calendarCandidateFilter ||
                      calendarTypeFilter
                        ? "1px solid #fecaca"
                        : "1px solid #e2e8f0",
                    cursor:
                      calendarSearchFilter.trim() ||
                      calendarCandidateFilter ||
                      calendarTypeFilter
                        ? "pointer"
                        : "default",
                  }}
                >
                  AZZERA FILTRI
                </button>
              </div>
            </div>

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
                const calendarSearchNeedle =
                  normalizeFilterValue(calendarSearchFilter);

                const dayEvents = events
                  .filter((event) => {
                    if (event.eventDate !== cell.dateKey) return false;

                    if (
                      calendarCandidateFilter &&
                      event.candidateId !== calendarCandidateFilter
                    ) {
                      return false;
                    }

                    if (
                      calendarTypeFilter &&
                      event.eventType !== calendarTypeFilter
                    ) {
                      return false;
                    }

                    if (calendarSearchNeedle) {
                      const searchableText = normalizeFilterValue(
                        [
                          candidateName(event.candidateId),
                          eventDisplayLabel(event),
                          event.customType,
                          event.notes,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      );

                      if (
                        !searchableText.includes(calendarSearchNeedle)
                      ) {
                        return false;
                      }
                    }

                    return true;
                  })
                  .sort((a, b) =>
                    (a.eventTime || "").localeCompare(
                      b.eventTime || ""
                    )
                  );

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
                          role="button"
                          tabIndex={0}
                          onClick={() => openEventModal(event, "view")}
                          onKeyDown={(keyEvent) => {
                            if (
                              keyEvent.key === "Enter" ||
                              keyEvent.key === " "
                            ) {
                              openEventModal(event, "view");
                            }
                          }}
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
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                void toggleEventCompleted(event);
                              }}
                              style={{ border: 0, borderRadius: 5, padding: "3px 5px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                            >
                              {event.completed ? "Riapri" : "Fatto"}
                            </button>
                            <button
                              type="button"
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                void deleteEvent(event);
                              }}
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
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMapView("agents");
                setFocusedCandidateMap(null);
              }}
              style={{
                ...buttonStyle,
                background:
                  mapView === "agents" ? "#0f172a" : "white",
                color:
                  mapView === "agents" ? "white" : "#0f172a",
                border: "1px solid #0f172a",
              }}
            >
              AGENTI ATTIVI
            </button>
            <button
              type="button"
              onClick={() => setMapView("candidates")}
              style={{
                ...buttonStyle,
                background:
                  mapView === "candidates" ? "#2563eb" : "white",
                color:
                  mapView === "candidates" ? "white" : "#1d4ed8",
                border: "1px solid #60a5fa",
              }}
            >
              NOMINATIVI IN LAVORAZIONE
            </button>
          </div>

          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h3 style={{ margin: 0 }}>
                {mapView === "agents"
                  ? "AGENTI ATTIVI"
                  : "NOMINATIVI IN LAVORAZIONE"}
              </h3>

              <button
                type="button"
                disabled={
                  mapRefreshing ||
                  mapBoundariesLoading ||
                  mapCandidateGeocoding
                }
                onClick={() => void refreshRecruitingMap()}
                style={{
                  ...buttonStyle,
                  background: "#0f172a",
                  color: "white",
                  opacity:
                    mapRefreshing ||
                    mapBoundariesLoading ||
                    mapCandidateGeocoding
                      ? 0.65
                      : 1,
                }}
              >
                {mapRefreshing || mapBoundariesLoading
                  ? "↻ AGGIORNAMENTO..."
                  : "↻ AGGIORNA MAPPA"}
              </button>
            </div>

            <div
              style={{
                color: "#64748b",
                fontSize: 13,
                marginTop: 6,
                marginBottom: 12,
              }}
            >
              {mapView === "agents"
                ? "I punti arancioni provengono da GESTIONE RECRUITING → ASSEGNAZIONE ZONE."
                : "I nominativi provengono dall'elenco CONTATTI e sono colorati in base allo stato."}
              {focusedCandidateMap && (
                <span
                  style={{
                    color: "#1d4ed8",
                    fontWeight: 900,
                  }}
                >
                  {" "}
                  Il punto blu evidenzia {focusedCandidateMap.fullName}.
                </span>
              )}
            </div>

            {mapView === "candidates" &&
              mapCandidateGeocoding && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "9px 11px",
                    borderRadius: 9,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1e40af",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  Posiziono i nominativi non ancora geolocalizzati:{" "}
                  {mapCandidateGeocodingProgress.done} /{" "}
                  {mapCandidateGeocodingProgress.total}
                </div>
              )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div>
                <label style={labelStyle}>Visualizzazione</label>
                <select
                  value={mapMode}
                  onChange={(e) => {
                    setMapReturnView(null);
                    setFocusedCandidateMap(null);
                    setMapMode(e.target.value as "italy" | "region" | "macroarea");
                  }}
                  style={inputStyle}
                >
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

              {mapView === "candidates" && (
                <>
                  <div
                    style={{
                      gridColumn: "1 / -1",
                    }}
                  >
                    <label style={labelStyle}>
                      Stato nominativi · MULTISELEZIONE
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                        padding: 9,
                        border: "1px solid #cbd5e1",
                        borderRadius: 10,
                        background: "white",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 9px",
                          borderRadius: 8,
                          background:
                            mapCandidateStatusFilters.length === 0
                              ? "#0f172a"
                              : "#f8fafc",
                          color:
                            mapCandidateStatusFilters.length === 0
                              ? "white"
                              : "#0f172a",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            mapCandidateStatusFilters.length === 0
                          }
                          onChange={() =>
                            setMapCandidateStatusFilters([])
                          }
                        />
                        TUTTI GLI STATI
                      </label>

                      {statusDefinitions.map((status) => (
                        <label
                          key={status.code}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "7px 9px",
                            borderRadius: 8,
                            background: status.background,
                            color: status.color,
                            border: `2px solid ${status.border}`,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={mapCandidateStatusFilters.includes(
                              status.code
                            )}
                            onChange={(event) => {
                              setFocusedCandidateMap(null);
                              setMapCandidateStatusFilters(
                                (current) => {
                                  if (event.target.checked) {
                                    return current.includes(status.code)
                                      ? current
                                      : [...current, status.code];
                                  }
                                  return current.filter(
                                    (code) => code !== status.code
                                  );
                                }
                              );
                            }}
                          />
                          {status.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "end",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 40,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={mapShowActiveAgents}
                        onChange={(event) =>
                          setMapShowActiveAgents(
                            event.target.checked
                          )
                        }
                        style={{
                          width: 18,
                          height: 18,
                        }}
                      />
                      MOSTRA ANCHE AGENTI ATTIVI
                    </label>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "end",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMapCandidateStatusFilters([]);
                        setMapShowActiveAgents(false);
                        setFocusedCandidateMap(null);
                      }}
                      style={{
                        ...buttonStyle,
                        width: "100%",
                        minHeight: 40,
                        background:
                          mapCandidateStatusFilters.length ||
                          mapShowActiveAgents
                            ? "#fee2e2"
                            : "#f1f5f9",
                        color:
                          mapCandidateStatusFilters.length ||
                          mapShowActiveAgents
                            ? "#b91c1c"
                            : "#94a3b8",
                        border: "1px solid #fecaca",
                      }}
                    >
                      AZZERA FILTRI
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 10, position: "relative" }}>
            {mapBoundariesLoading && (
              <div style={{ padding: "12px 6px", fontWeight: 800, color: "#475569" }}>
                Caricamento confini regionali italiani...
              </div>
            )}
            {mapBoundariesError && (
              <div style={{ padding: "12px 6px", fontWeight: 800, color: "#b91c1c" }}>
                {mapBoundariesError}
              </div>
            )}
            <div
              ref={mapElementRef}
              style={{
                height: 600,
                width: "100%",
                borderRadius: 10,
                overflow: "hidden",
                background: "#f8fafc",
              }}
            />

            {focusedCandidateMap && (
              <button
                type="button"
                aria-label="Indietro alla lista nominativi"
                onClick={() => {
                  const candidateId = focusedCandidateMap.candidateId;
                  setFocusedCandidateMap(null);
                  setMapReturnView(null);
                  setSection("contacts");

                  window.setTimeout(() => {
                    document
                      .getElementById(`recruiting-candidate-${candidateId}`)
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                  }, 80);
                }}
                style={{
                  position: "absolute",
                  right: 22,
                  bottom: 22,
                  zIndex: 1001,
                  border: "1px solid #0f172a",
                  borderRadius: 999,
                  padding: "10px 15px",
                  background: "#0f172a",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 5px 18px rgba(15,23,42,.28)",
                }}
              >
                ← INDIETRO
              </button>
            )}

            {!focusedCandidateMap && mapReturnView && mapMode === "region" && (
              <button
                type="button"
                onClick={() => {
                  setMapMode(mapReturnView.mode);
                  if (mapReturnView.mode === "macroarea") {
                    setMapMacroareaId(mapReturnView.macroareaId);
                  }
                  setMapReturnView(null);
                }}
                style={{
                  position: "absolute",
                  right: 22,
                  bottom: 22,
                  zIndex: 1000,
                  border: "1px solid #0f172a",
                  borderRadius: 999,
                  padding: "10px 15px",
                  background: "#0f172a",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 5px 18px rgba(15,23,42,.28)",
                }}
              >
                ← INDIETRO
              </button>
            )}
          </div>

          {mapView === "agents" ? (
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>
                Agenti visualizzati ({visibleMapAgents.length})
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(220px,1fr))",
                  gap: 8,
                }}
              >
                {visibleMapAgents.map((agent) => (
                  <div
                    key={agent.id}
                    style={{
                      border: "1px solid #fed7aa",
                      background: "#fff7ed",
                      borderRadius: 9,
                      padding: 10,
                    }}
                  >
                    <strong>
                      {agent.firstName} {agent.lastName}
                    </strong>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      Cellulare: {agent.phone || "—"}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      Zona: {agent.zone || "—"}
                    </div>
                  </div>
                ))}
                {!visibleMapAgents.length && (
                  <div style={{ color: "#64748b" }}>
                    Nessun agente attivo posizionato nell'area
                    selezionata.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>
                  Nominativi visualizzati (
                  {visibleMapCandidates.length})
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit,minmax(240px,1fr))",
                    gap: 8,
                  }}
                >
                  {visibleMapCandidates.map((candidate) => {
                    const statusStyle = getStatusDefinition(
                      candidate.status
                    );
                    return (
                      <div
                        key={candidate.id}
                        style={{
                          border: `2px solid ${statusStyle.border}`,
                          background: statusStyle.background,
                          borderRadius: 9,
                          padding: 10,
                        }}
                      >
                        <strong>{candidate.fullName}</strong>
                        <div
                          style={{
                            marginTop: 4,
                            color: statusStyle.color,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {statusStyle.label}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13 }}>
                          Cellulare: {candidate.phone || "—"}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          Zona:{" "}
                          {candidate.operationalZone || "—"}
                        </div>
                      </div>
                    );
                  })}
                  {!visibleMapCandidates.length &&
                    !mapCandidateGeocoding && (
                      <div style={{ color: "#64748b" }}>
                        Nessun nominativo con i filtri selezionati
                        è posizionato nell'area.
                      </div>
                    )}
                </div>
              </div>

              {mapShowActiveAgents && (
                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0 }}>
                    Agenti attivi mostrati insieme (
                    {visibleMapAgents.length})
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(220px,1fr))",
                      gap: 8,
                    }}
                  >
                    {visibleMapAgents.map((agent) => (
                      <div
                        key={agent.id}
                        style={{
                          border: "1px solid #fed7aa",
                          background: "#fff7ed",
                          borderRadius: 9,
                          padding: 10,
                        }}
                      >
                        <strong>
                          {agent.firstName} {agent.lastName}
                        </strong>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                          }}
                        >
                          Zona: {agent.zone || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {eventModalId && eventModalEvent && (
        <div
          className="recruiting-modal-backdrop"
          onClick={() => setEventModalId(null)}
        >
          <div
            className="recruiting-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>
                {eventModalMode === "edit"
                  ? "Modifica attività"
                  : "Dettaglio attività"}
              </h3>
              <button
                type="button"
                onClick={() => setEventModalId(null)}
                style={{ ...buttonStyle, background: "#e2e8f0" }}
              >
                Chiudi
              </button>
            </div>

            {eventModalMode === "view" ? (
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                <div>
                  <strong>{eventDisplayLabel(eventModalEvent)}</strong>
                </div>
                <div>
                  Data: <strong>{formatDate(eventModalEvent.eventDate)}</strong>
                  {eventModalEvent.eventTime && (
                    <> · {formatTime(eventModalEvent.eventTime)}</>
                  )}
                </div>
                <div>
                  Contatto:{" "}
                  <strong>
                    {candidateName(eventModalEvent.candidateId)}
                  </strong>
                </div>
                {eventModalEvent.notes && (
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      padding: 10,
                      borderRadius: 9,
                      background: "#f8fafc",
                    }}
                  >
                    {eventModalEvent.notes}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 6,
                  }}
                >
                  {eventModalEvent.candidateId && (
                    <button
                      type="button"
                      onClick={() =>
                        openReadOnlyContact(
                          eventModalEvent.candidateId
                        )
                      }
                      style={{
                        ...buttonStyle,
                        background: "#dbeafe",
                        color: "#1d4ed8",
                      }}
                    >
                      SCHEDA
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      openEventModal(eventModalEvent, "edit")
                    }
                    style={{
                      ...buttonStyle,
                      background: "#ffedd5",
                      color: "#c2410c",
                    }}
                  >
                    MODIFICA ATTIVITÀ
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <div>
                  <label style={labelStyle}>Contatto</label>
                  <select
                    value={eventEditCandidateId}
                    onChange={(e) =>
                      setEventEditCandidateId(e.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="">Senza contatto</option>
                    {alphabeticalCandidates.map((candidate) => (
                      <option
                        key={candidate.id}
                        value={candidate.id}
                      >
                        {candidate.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select
                    value={eventEditType}
                    onChange={(e) =>
                      setEventEditType(
                        e.target.value as EventType
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

                {eventEditType === "ALTRO" && (
                  <div>
                    <label style={labelStyle}>Specifica</label>
                    <input
                      value={eventEditCustom}
                      onChange={(e) =>
                        setEventEditCustom(e.target.value)
                      }
                      style={inputStyle}
                    />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Data</label>
                  <input
                    type="date"
                    value={eventEditDate}
                    onChange={(e) =>
                      setEventEditDate(e.target.value)
                    }
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Ora</label>
                  <input
                    type="time"
                    value={eventEditTime}
                    onChange={(e) =>
                      setEventEditTime(e.target.value)
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Note</label>
                  <textarea
                    value={eventEditNotes}
                    onChange={(e) =>
                      setEventEditNotes(e.target.value)
                    }
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEventChanges()}
                    style={{
                      ...buttonStyle,
                      background: "#f97316",
                      color: "white",
                    }}
                  >
                    SALVA MODIFICHE
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {calendarContactPreviewId && calendarContactPreview && (
        <div
          className="recruiting-modal-backdrop"
          onClick={() => setCalendarContactPreviewId(null)}
        >
          <div
            className="recruiting-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>
                  {calendarContactPreview.fullName}
                </h3>
                <div style={{ color: "#64748b", marginTop: 4 }}>
                  Scheda in sola lettura
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() =>
                    openContactForEditing(
                      calendarContactPreview.id
                    )
                  }
                  style={{
                    ...buttonStyle,
                    background: "#2563eb",
                    color: "white",
                  }}
                >
                  MODIFICA
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarContactPreviewId(null)
                  }
                  style={{ ...buttonStyle, background: "#e2e8f0" }}
                >
                  Chiudi
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(180px,1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              <div>
                <strong>Città:</strong>{" "}
                {(calendarContactPreview.operationalZone || "—").toLocaleUpperCase("it")}
              </div>
              <div>
                <strong>Provincia:</strong>{" "}
                {(calendarContactPreview.provinceCode || "—").toLocaleUpperCase("it")}
              </div>
              <div>
                <strong>Regione:</strong>{" "}
                {(calendarContactPreview.region || "—").toLocaleUpperCase("it")}
              </div>
              <div><strong>Telefono:</strong> {calendarContactPreview.phone || "—"}</div>
              <div><strong>Email:</strong> {calendarContactPreview.email || "—"}</div>
              <div>
                <strong>Settore energia:</strong>{" "}
                {calendarContactPreview.sectorEnergy
                  ? `SI${calendarContactPreview.companyName ? ` · ${calendarContactPreview.companyName}` : ""}`
                  : `NO${calendarContactPreview.sectorOther ? ` · ${calendarContactPreview.sectorOther}` : ""}`}
              </div>
              <div>
                <strong>Stato:</strong>{" "}
                {getStatusDefinition(calendarContactPreview.status).label}
              </div>
              {calendarContactPreview.status === "INOLTRATO_A" && (
                <div>
                  <strong>Inoltrato a:</strong>{" "}
                  {calendarContactPreview.forwardedTo || "—"}
                </div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <h4 style={{ marginBottom: 8 }}>Note</h4>
              <div style={{ display: "grid", gap: 8 }}>
                {calendarContactPreviewNotes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 9,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong>{formatDate(note.noteDate)}</strong>
                      {note.calledByMe && (
                        <span
                          style={{
                            color: "#6d28d9",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          ALESSIO CEDRONI DICE:
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {note.noteText}
                    </div>
                  </div>
                ))}
                {!calendarContactPreviewNotes.length && (
                  <div style={{ color: "#64748b" }}>
                    Nessuna nota inserita.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === "hr_notes" && (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                NOTE DA SINCRONIZZARE SU HR SPECIALIST
              </h3>
              <div
                style={{
                  marginTop: 4,
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                {hrSyncNotes.length} note in attesa
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              marginTop: 14,
            }}
          >
            {hrSyncNotes.map((note) => {
              const candidate = candidates.find(
                (item) => item.id === note.candidateId
              );
              const statusStyle = candidate
                ? getStatusDefinition(candidate.status)
                : statusPaletteByKey("slate");

              return (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setContactEditMode(false);
                    setSelectedCandidateId(note.candidateId);
                    setSection("contacts");
                    window.setTimeout(() => {
                      document
                        .getElementById(
                          `recruiting-candidate-${note.candidateId}`
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                    }, 80);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      setContactEditMode(false);
                      setSelectedCandidateId(note.candidateId);
                      setSection("contacts");
                    }
                  }}
                  style={{
                    border: `3px solid ${
                      candidate
                        ? statusStyle.border
                        : "#cbd5e1"
                    }`,
                    borderRadius: 11,
                    padding: 13,
                    background: "white",
                    cursor: "pointer",
                    boxShadow:
                      "0 2px 8px rgba(15,23,42,.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          fontSize: 15,
                        }}
                      >
                        {candidate?.fullName ||
                          "NOMINATIVO NON DISPONIBILE"}
                      </strong>
                      <div
                        style={{
                          marginTop: 4,
                          color: "#64748b",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {formatDate(note.noteDate)}
                        {candidate?.operationalZone
                          ? ` · ${candidate.operationalZone.toLocaleUpperCase(
                              "it"
                            )}`
                          : ""}
                      </div>
                    </div>

                    {candidate && (
                      <span
                        style={{
                          padding: "6px 9px",
                          borderRadius: 8,
                          background: statusStyle.background,
                          color: statusStyle.color,
                          border: `2px solid ${statusStyle.border}`,
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        {statusStyle.label}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {note.calledByMe && (
                      <strong
                        style={{
                          color: "#6d28d9",
                          marginRight: 6,
                        }}
                      >
                        ALESSIO CEDRONI DICE:
                      </strong>
                    )}
                    {note.noteText}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      color: "#2563eb",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    CLICCA PER APRIRE LA SCHEDA COMPLETA
                  </div>
                </div>
              );
            })}

            {!hrSyncNotes.length && (
              <div
                style={{
                  padding: 18,
                  borderRadius: 10,
                  background: "#f8fafc",
                  color: "#64748b",
                  textAlign: "center",
                  fontWeight: 800,
                }}
              >
                Nessuna nota da sincronizzare su HR Specialist.
              </div>
            )}
          </div>
        </div>
      )}

      {section === "management" && <RecruitingManagement />}
    </div>
  );
}
