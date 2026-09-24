import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import Ateco from "./Ateco";
import Archive from "./Archive";
import { adminCreateUser, adminDeleteUser, adminListUsers, adminLogin, adminLogout, adminSetFullAccess, adminUpdateUser, adminUpsertSettings, ensureAdminSession } from "./adminSecurity";
import Recruiting from "./Recruiting";
import Appointments from "./Appointments";
import RecruitingManagement from "./RecruitingManagement";
import { getRecruitingContext } from "./recruitingClient";
import "./dashboard.css";


type MonthlyRow = {
  mese: string;
  anno: number;
  mono: number;
  f1: number;
  f2: number;
  f3: number;
  psv: number;
};

type DispCpRow = {
  mese: string;
  dispacciamento: number;
  cpMarket: number;
};

type EnergyOffer = {
  nome: string;
  canone: number;
  spread: number;
  maggiorazioneCapacityMarket: number;
  visibile?: boolean;
};

type GasOffer = {
  nome: string;
  canone: number;
  spread: number;
  quotaVariabile: number;
  visibile?: boolean;
};

type GasAcciseSettings = {
  agevolata: number;
  nonAgevolata: number;
};

type Agent = {
  id?: number;
  nome: string;
  cognome: string;
  username: string;
  password: string;
  owner_auth_id?: string;
};

type AdminProfile = {
  id?: number;
  auth_id: string;
  nome?: string;
  cognome?: string;
  email?: string;
  username: string;
  password?: string;
  token?: string;
  role?: string;
  full_access?: boolean;
 };
type PunPsvRow = {
  mese: string;
  mono: number;
  f1: number;
  f2: number;
  f3: number;
  psv: number;
};

const PUN_PSV_MONTHS = [
"GENNAIO 2024",
"FEBBRAIO 2024",
"MARZO 2024",
"APRILE 2024",
"MAGGIO 2024",
"GIUGNO 2024",
"LUGLIO 2024",
"AGOSTO 2024",
"SETTEMBRE 2024",
"OTTOBRE 2024",
"NOVEMBRE 2024",
"DICEMBRE 2024","GENNAIO 2025",
  "FEBBRAIO 2025",
  "MARZO 2025",
  "APRILE 2025",
  "MAGGIO 2025",
  "GIUGNO 2025",
  "LUGLIO 2025",
  "AGOSTO 2025",
  "SETTEMBRE 2025",
  "OTTOBRE 2025",
  "NOVEMBRE 2025",
  "DICEMBRE 2025",
  "GENNAIO 2026",
  "FEBBRAIO 2026",
  "MARZO 2026",
  "APRILE 2026",
  "MAGGIO 2026",
  "GIUGNO 2026",
  "LUGLIO 2026",
  "AGOSTO 2026",
  "SETTEMBRE 2026",
  "OTTOBRE 2026",
  "NOVEMBRE 2026",
  "DICEMBRE 2026",
  "GENNAIO 2027",
  "FEBBRAIO 2027",
  "MARZO 2027",
  "APRILE 2027",
  "MAGGIO 2027",
  "GIUGNO 2027",
  "LUGLIO 2027",
  "AGOSTO 2027",
  "SETTEMBRE 2027",
  "OTTOBRE 2027",
  "NOVEMBRE 2027",
  "DICEMBRE 2027",
  "GENNAIO 2028",
  "FEBBRAIO 2028",
  "MARZO 2028",
  "APRILE 2028",
  "MAGGIO 2028",
  "GIUGNO 2028",
  "LUGLIO 2028",
  "AGOSTO 2028",
  "SETTEMBRE 2028",
  "OTTOBRE 2028",
  "NOVEMBRE 2028",
  "DICEMBRE 2028",
  "GENNAIO 2029",
  "FEBBRAIO 2029",
  "MARZO 2029",
  "APRILE 2029",
  "MAGGIO 2029",
  "GIUGNO 2029",
  "LUGLIO 2029",
  "AGOSTO 2029",
  "SETTEMBRE 2029",
  "OTTOBRE 2029",
  "NOVEMBRE 2029",
  "DICEMBRE 2029",
];

const INITIAL_PUN_PSV_ROWS: PunPsvRow[] = [
  { mese: "FISSO DOMESTICO", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  { mese: "FISSO BUSINESS", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  { mese: "FISSO AD HOC", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  ...PUN_PSV_MONTHS.map((mese) => ({
    mese,
    mono: 0,
    f1: 0,
    f2: 0,
    f3: 0,
    psv: 0,
  })),
];

function normalizeMonthLabel(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}


function getLast12PunPsvRows(rows: any[], selectedMonth: string) {
  const normalizedSelected = normalizeMonthLabel(selectedMonth);

  const index = rows.findIndex(
    (r) => normalizeMonthLabel(r.mese) === normalizedSelected
  );

  if (index === -1) return [];

  return rows.slice(Math.max(0, index - 11), index + 1);
}

function getSvgPoints(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const paddingLeft = 28;
  const paddingRight = 28;
  const paddingTop = 30;
  const paddingBottom = 46;

  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  return values
    .map((v, i) => {
      const x =
        paddingLeft +
        (i / Math.max(values.length - 1, 1)) * usableWidth;

      const y =
        paddingTop +
        (1 - (v - min) / range) * usableHeight;

      return `${x},${y}`;
    })
    .join(" ");
}
function getChartCoords(values: number[], width: number, height: number) {
  if (!values.length) return [];

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const paddingLeft = 28;
  const paddingRight = 28;
  const paddingTop = 30;
  const paddingBottom = 46;

  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  return values.map((v, i) => {
    const x =
      paddingLeft +
      (i / Math.max(values.length - 1, 1)) * usableWidth;

    const y =
      paddingTop +
      (1 - (v - min) / range) * usableHeight;

    return { x, y, value: v };
  });
}
const MESI = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

const ANNI = [2024,2025, 2026, 2027, 2028, 2029];

function getMonthYearSortValue(label: string) {
  if (label === "FISSO DOMESTICO") return Number.MAX_SAFE_INTEGER;
  if (label === "FISSO BUSINESS") return Number.MAX_SAFE_INTEGER - 1;
  if (label === "FISSO AD HOC") return Number.MAX_SAFE_INTEGER - 2;

  const parts = String(label).trim().split(" ");
  if (parts.length < 2) return -1;

  const mese = parts[0];
  const anno = Number(parts[1]);
  const meseIndex = MESI.indexOf(mese);

  if (!Number.isFinite(anno) || meseIndex === -1) return -1;

  return anno * 100 + meseIndex;
}

const INITIAL_MONTHLY: MonthlyRow[] = [
  { mese: "FISSO DOMESTICO", anno: 0, mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  { mese: "FISSO BUSINESS", anno: 0, mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  { mese: "FISSO AD HOC", anno: 0, mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },

  ...ANNI.flatMap((anno) =>
    MESI.map((mese) => ({
      mese,
      anno,
      mono: 0,
      f1: 0,
      f2: 0,
      f3: 0,
      psv: 0,
    }))
  ),
];

const INITIAL_DISP_CP_ROWS: DispCpRow[] = [
  { mese: "GENNAIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "FEBBRAIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "MARZO", dispacciamento: 0, cpMarket: 0 },
  { mese: "APRILE", dispacciamento: 0, cpMarket: 0 },
  { mese: "MAGGIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "GIUGNO", dispacciamento: 0, cpMarket: 0 },
  { mese: "LUGLIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "AGOSTO", dispacciamento: 0, cpMarket: 0 },
  { mese: "SETTEMBRE", dispacciamento: 0, cpMarket: 0 },
  { mese: "OTTOBRE", dispacciamento: 0, cpMarket: 0 },
  { mese: "NOVEMBRE", dispacciamento: 0, cpMarket: 0 },
  { mese: "DICEMBRE", dispacciamento: 0, cpMarket: 0 },
];

const INITIAL_ENERGY_OFFERS: EnergyOffer[] = [
  { nome: "DEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0, visibile: true },
  { nome: "+SICURA DEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0, visibile: true },
  { nome: "BILANCIATA", canone: 18.5, spread: 0, maggiorazioneCapacityMarket: 0, visibile: true },
];

const INITIAL_GAS_OFFERS: GasOffer[] = [
  { nome: "DEDICATA", canone: 0, spread: 0, quotaVariabile: 0, visibile: true },
  { nome: "+SICURA DEDICATA", canone: 0, spread: 0, quotaVariabile: 0, visibile: true },
];

const energyTypes = [
  "RESIDENTE",
  "NON RESIDENTE",
  "RESIDENTE CANONE ESENTE",
  "BTA1",
  "BTA2",
  "BTA3",
  "BTA4",
  "BTA5",
  "BTA6",
  "MTA1",
  "MTA2",
  "MTA3",
];

const energyBilling = [
  "MENSILE",
  "BIMESTRALE",
  "MULTI POD MENSILE",
  "MULTI POD BIMESTRALE",
];

const gasBilling = [
  "MENSILE",
  "BIMESTRALE",
  "TRIMESTRALE",
  "QUADRIMESTRALE",
];

const n = (v: any) => {
  const x = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

const money = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(v || 0);

const numFormat = (v: number, decimals: number) =>
  Number(v || 0).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

function formatReportDate(value: any) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw || "-";
}

const referencePriceFormat = (v: number) =>
  Number(v || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  });

const isSi = (v: string) => String(v).trim().toUpperCase() === "SI";

const normalizeOfferName = (offer: string) => String(offer || "").trim().toUpperCase();

const isFixedDedicatedOffer = (offer: string) =>
  ["+SICURA DEDICATA", "SICURA DEDICATA", "+SICURADEDICATA", "SICURADEDICATA", "+FISSO DEDICATA", "FISSO DEDICATA"].includes(normalizeOfferName(offer));

const isDedicatedOffer = (offer: string) =>
  normalizeOfferName(offer) === "DEDICATA" || isFixedDedicatedOffer(offer);

const FIXED_COMPETENCE_MONTHS = [
  "FISSO DOMESTICO",
  "FISSO BUSINESS",
  "FISSO AD HOC",
] as const;

const isFixedCompetenceMonth = (month: string) =>
  FIXED_COMPETENCE_MONTHS.includes(
    String(month || "").trim().toUpperCase() as
      (typeof FIXED_COMPETENCE_MONTHS)[number]
  );

const isSicuraOffer = (offer: string) =>
  normalizeOfferName(offer).includes("SICURA");

const SIMULATION_DRAFT_IDLE_MS = 15 * 60 * 1000;
const ENERGY_SIMULATION_DRAFT_KEY =
  "gestione_energia_energy_draft_v1";
const GAS_SIMULATION_DRAFT_KEY =
  "gestione_energia_gas_draft_v1";

function readSimulationDraft<
  T extends Record<string, any>
>(key: string, fallback: T): {
  state: T;
  updatedAt: number;
} {
  const now = Date.now();

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { state: fallback, updatedAt: now };

    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);

    if (
      !updatedAt ||
      now - updatedAt >= SIMULATION_DRAFT_IDLE_MS
    ) {
      sessionStorage.removeItem(key);
      return { state: fallback, updatedAt: now };
    }

    return {
      state: {
        ...fallback,
        ...(parsed?.state &&
        typeof parsed.state === "object"
          ? parsed.state
          : {}),
      },
      updatedAt,
    };
  } catch {
    sessionStorage.removeItem(key);
    return { state: fallback, updatedAt: now };
  }
}

function writeSimulationDraft(
  key: string,
  state: Record<string, any>,
  updatedAt: number
) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ state, updatedAt })
    );
  } catch {}
}

function clearExpiredSimulationDraft(key: string) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);

    if (
      !updatedAt ||
      Date.now() - updatedAt >= SIMULATION_DRAFT_IDLE_MS
    ) {
      sessionStorage.removeItem(key);
    }
  } catch {
    sessionStorage.removeItem(key);
  }
}

function clearAllSimulationDrafts() {
  try {
    sessionStorage.removeItem(ENERGY_SIMULATION_DRAFT_KEY);
    sessionStorage.removeItem(GAS_SIMULATION_DRAFT_KEY);
  } catch {}
}

type SavedSimulation = {
  id: string;
  name: string;
  agent_name?: string | null;
  state: Record<string, any>;
  created_at: string;
};

type SavedSimulationType = "energy" | "gas";

async function getSimulationOwnerKey() {
  const adminRaw = localStorage.getItem("admin_session");
  const agentRaw = localStorage.getItem("agent_session");

  let seed = "";

  try {
    if (adminRaw) {
      const admin = JSON.parse(adminRaw);
      seed = [
        "admin",
        admin?.auth_id || admin?.id || "",
        String(admin?.username || "").trim().toLowerCase(),
      ].join("|");
    } else if (agentRaw) {
      const agent = JSON.parse(agentRaw);
      seed = [
        "agent",
        agent?.id || "",
        agent?.owner_auth_id || "",
        String(agent?.username || "").trim().toLowerCase(),
      ].join("|");
    }
  } catch {
    seed = "";
  }

  if (!seed || seed.endsWith("||")) {
    throw new Error(
      "Sessione utente non disponibile. Esci e accedi di nuovo."
    );
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      seed + "|saved-simulations-v1"
    )
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function simulationArchiveHeaders(
  ownerKey: string,
  includeJson = false
) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "x-client-info": `simulation-save-sync-${ownerKey}`,
    ...(includeJson
      ? { "Content-Type": "application/json" }
      : {}),
  };
}

const SIMULATION_CUSTOM_AGENT_MEMORY_PREFIX =
  "simulation_custom_agents_v1_";

async function getEmailRecipientOwnerKeyForSimulation() {
  try {
    const raw = localStorage.getItem("admin_session");
    if (!raw) return null;

    const admin = JSON.parse(raw);
    if (!admin?.id || !admin?.username) return null;

    const seed = `${admin.id}|${String(admin.username)
      .trim()
      .toLowerCase()}|email-recipient-sync-v2`;

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(seed)
    );

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function emailRecipientSimulationHeaders(
  ownerKey: string
) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "x-client-info": `email-recipient-sync-${ownerKey}`,
  };
}

function normalizeAgentOption(value: string) {
  return String(value || "").trim();
}

function uniqueAgentOptions(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  values.forEach((value) => {
    const clean = normalizeAgentOption(value);
    const key = clean.toLocaleLowerCase("it-IT");

    if (
      !clean ||
      key === "non assegnati" ||
      key === "altro" ||
      seen.has(key)
    ) {
      return;
    }

    seen.add(key);
    out.push(clean);
  });

  return out.sort((a, b) =>
    a.localeCompare(b, "it", { sensitivity: "base" })
  );
}

async function getSimulationAgentMemoryKey() {
  const ownerKey = await getSimulationOwnerKey();
  return SIMULATION_CUSTOM_AGENT_MEMORY_PREFIX + ownerKey;
}

async function readRememberedSimulationAgents() {
  try {
    const key = await getSimulationAgentMemoryKey();
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? uniqueAgentOptions(
          parsed.map((value) => String(value || ""))
        )
      : [];
  } catch {
    return [];
  }
}

async function rememberSimulationAgent(name: string) {
  const clean = normalizeAgentOption(name);
  if (!clean) return;

  try {
    const key = await getSimulationAgentMemoryKey();
    const current = await readRememberedSimulationAgents();
    const next = uniqueAgentOptions([clean, ...current]).slice(
      0,
      100
    );
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Il nome resta comunque associato alla simulazione online.
  }
}

async function loadSimulationAgentOptions() {
  const remembered = await readRememberedSimulationAgents();
  const values = [...remembered];

  // Recupera i nominativi della scheda "4. Controllo abbinamenti"
  // dell'area Invio Email, quando è disponibile una sessione Admin.
  const emailOwnerKey =
    await getEmailRecipientOwnerKeyForSimulation();

  if (emailOwnerKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/email_recipient_lists?owner_key=eq.${emailOwnerKey}&select=recipients&limit=1`,
        {
          headers:
            emailRecipientSimulationHeaders(emailOwnerKey),
        }
      );

      if (response.ok) {
        const rows = await response.json();
        const recipients = Array.isArray(rows?.[0]?.recipients)
          ? rows[0].recipients
          : [];

        recipients.forEach((item: any) => {
          values.push(String(item?.agenzia || ""));
        });
      }
    } catch {
      // L'eventuale indisponibilità dell'elenco email non blocca il salvataggio.
    }
  }

  // Recupera anche eventuali nomi agente già usati in precedenti
  // simulazioni, così rimangono disponibili anche su un altro dispositivo.
  try {
    const ownerKey = await getSimulationOwnerKey();
    const params = new URLSearchParams({
      owner_key: `eq.${ownerKey}`,
      agent_name: "not.is.null",
      select: "agent_name",
      limit: "100",
    });

    const response = await fetch(
      `${supabaseUrl}/rest/v1/saved_simulations?${params.toString()}`,
      {
        headers: simulationArchiveHeaders(ownerKey),
      }
    );

    if (response.ok) {
      const rows = await response.json();
      if (Array.isArray(rows)) {
        rows.forEach((row: any) => {
          values.push(String(row?.agent_name || ""));
        });
      }
    }
  } catch {
    // Nessun blocco: l'associazione agente è facoltativa.
  }

  return uniqueAgentOptions(values);
}

async function listSavedSimulations(
  type: SavedSimulationType
): Promise<SavedSimulation[]> {
  const ownerKey = await getSimulationOwnerKey();
  const params = new URLSearchParams({
    owner_key: `eq.${ownerKey}`,
    simulation_type: `eq.${type}`,
    select: "id,name,agent_name,state,created_at",
    order: "created_at.desc",
    limit: "100",
  });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/saved_simulations?${params.toString()}`,
    {
      headers: simulationArchiveHeaders(ownerKey),
    }
  );

  if (!response.ok) {
    throw new Error(
      "Impossibile caricare le simulazioni salvate."
    );
  }

  const data = await response.json();
  return Array.isArray(data)
    ? (data as SavedSimulation[])
    : [];
}

async function saveSimulationArchive(
  type: SavedSimulationType,
  name: string,
  state: Record<string, any>,
  agentName = ""
) {
  const ownerKey = await getSimulationOwnerKey();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/saved_simulations`,
    {
      method: "POST",
      headers: {
        ...simulationArchiveHeaders(ownerKey, true),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        owner_key: ownerKey,
        simulation_type: type,
        name: name.trim(),
        agent_name: agentName.trim() || null,
        state,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      "Impossibile salvare la simulazione."
    );
  }
}

async function deleteSavedSimulation(
  type: SavedSimulationType,
  id: string
) {
  const ownerKey = await getSimulationOwnerKey();
  const params = new URLSearchParams({
    owner_key: `eq.${ownerKey}`,
    simulation_type: `eq.${type}`,
    id: `eq.${id}`,
  });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/saved_simulations?${params.toString()}`,
    {
      method: "DELETE",
      headers: {
        ...simulationArchiveHeaders(ownerKey),
        Prefer: "return=minimal",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      "Impossibile eliminare la simulazione."
    );
  }
}

async function deleteAllSavedSimulations(
  type: SavedSimulationType
) {
  const ownerKey = await getSimulationOwnerKey();
  const params = new URLSearchParams({
    owner_key: `eq.${ownerKey}`,
    simulation_type: `eq.${type}`,
  });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/saved_simulations?${params.toString()}`,
    {
      method: "DELETE",
      headers: {
        ...simulationArchiveHeaders(ownerKey),
        Prefer: "return=minimal",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      "Impossibile eliminare le simulazioni."
    );
  }
}

function SaveSimulationModal({
  open,
  type,
  initialName,
  showAgentAssociation,
  onClose,
  onConfirm,
}: {
  open: boolean;
  type: SavedSimulationType;
  initialName: string;
  showAgentAssociation: boolean;
  onClose: () => void;
  onConfirm: (
    customerName: string,
    agentName: string
  ) => Promise<void>;
}) {
  const [customerName, setCustomerName] = useState("");
  const [agentChoice, setAgentChoice] = useState("");
  const [customAgent, setCustomAgent] = useState("");
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setCustomerName(initialName || "");
    setAgentChoice("");
    setCustomAgent("");
    setError("");

    if (!showAgentAssociation) {
      setAgentOptions([]);
      setLoadingAgents(false);
      return;
    }

    setLoadingAgents(true);
    let cancelled = false;

    void loadSimulationAgentOptions()
      .then((items) => {
        if (!cancelled) setAgentOptions(items);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, initialName, type, showAgentAssociation]);

  if (!open) return null;

  const handleConfirm = async () => {
    const cleanName = customerName.trim();

    if (!cleanName) {
      setError(
        "Inserisci il nome del cliente per salvare la simulazione."
      );
      return;
    }

    const cleanAgent = showAgentAssociation
      ? agentChoice === "__ALTRO__"
        ? customAgent.trim()
        : agentChoice.trim()
      : "";

    if (
      showAgentAssociation &&
      agentChoice === "__ALTRO__" &&
      !cleanAgent
    ) {
      setError(
        "Hai scelto ALTRO: inserisci il nome dell'agente."
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onConfirm(cleanName, cleanAgent);

      if (cleanAgent) {
        await rememberSimulationAgent(cleanAgent);
      }

      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore durante il salvataggio."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100100,
        background: "rgba(15,23,42,.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 18,
          boxShadow: "0 24px 70px rgba(15,23,42,.28)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <div
            style={{
              fontWeight: 950,
              fontSize: 22,
              color: "#0f172a",
            }}
          >
            Salva simulazione{" "}
            {type === "energy" ? "Energia" : "Gas"}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {showAgentAssociation
              ? "Il nome cliente è obbligatorio. L'agente associato è facoltativo."
              : "Il nome cliente è obbligatorio."}
          </div>
        </div>

        <label
          style={{
            display: "grid",
            gap: 5,
            fontWeight: 800,
            color: "#334155",
          }}
        >
          Nome cliente *
          <input
            value={customerName}
            onChange={(event) =>
              setCustomerName(event.target.value)
            }
            autoFocus
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 15,
              background: "white",
            }}
          />
        </label>

        {showAgentAssociation && (
          <label
            style={{
              display: "grid",
              gap: 5,
              fontWeight: 800,
              color: "#334155",
            }}
          >
            Agente associato
            <select
              value={agentChoice}
              disabled={loadingAgents}
              onChange={(event) => {
                setAgentChoice(event.target.value);
                if (event.target.value !== "__ALTRO__") {
                  setCustomAgent("");
                }
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 15,
                background: "white",
              }}
            >
              <option value="">
                {loadingAgents
                  ? "Carico nominativi..."
                  : "Nessun agente associato"}
              </option>
              {agentOptions.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
              <option value="__ALTRO__">ALTRO</option>
            </select>
          </label>
        )}

        {showAgentAssociation && agentChoice === "__ALTRO__" && (
          <label
            style={{
              display: "grid",
              gap: 5,
              fontWeight: 800,
              color: "#334155",
            }}
          >
            Nome agente
            <input
              value={customAgent}
              onChange={(event) =>
                setCustomAgent(event.target.value)
              }
              placeholder="Scrivi il nome..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 15,
                background: "white",
              }}
            />
          </label>
        )}

        {error && (
          <div
            style={{
              borderRadius: 10,
              background: "#fef2f2",
              color: "#b91c1c",
              padding: "10px 12px",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            style={{
              border: "1px solid #cbd5e1",
              background: "white",
              color: "#334155",
              borderRadius: 9,
              padding: "9px 13px",
              fontWeight: 900,
              cursor: saving ? "default" : "pointer",
            }}
          >
            ANNULLA
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            style={{
              border: "1px solid #16a34a",
              background: "#16a34a",
              color: "white",
              borderRadius: 9,
              padding: "9px 14px",
              fontWeight: 900,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "SALVATAGGIO..." : "OK, SALVA"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedSimulationsModal({
  open,
  type,
  title,
  onClose,
  onOpenSimulation,
}: {
  open: boolean;
  type: SavedSimulationType;
  title: string;
  onClose: () => void;
  onOpenSimulation: (simulation: SavedSimulation) => void;
}) {
  const [items, setItems] = useState<SavedSimulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(
    null
  );
  const [deletingAll, setDeletingAll] = useState(false);

  const reloadSavedSimulations = async () => {
    setLoading(true);
    setError("");

    try {
      const rows = await listSavedSimulations(type);
      setItems(rows);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error
          ? err.message
          : "Errore caricamento simulazioni."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void reloadSavedSimulations();
  }, [open, type]);

  const handleDeleteOne = async (
    simulation: SavedSimulation
  ) => {
    if (
      !window.confirm(
        `Vuoi eliminare la simulazione "${simulation.name}"?`
      )
    ) {
      return;
    }

    setDeletingId(simulation.id);
    setError("");

    try {
      await deleteSavedSimulation(type, simulation.id);
      setItems((current) =>
        current.filter(
          (item) => item.id !== simulation.id
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore durante l'eliminazione."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (items.length === 0) return;

    if (
      !window.confirm(
        `Vuoi eliminare tutte le simulazioni ${type === "energy" ? "Energia" : "Gas"} salvate?`
      )
    ) {
      return;
    }

    if (
      !window.confirm(
        "Conferma definitiva: questa operazione non può essere annullata."
      )
    ) {
      return;
    }

    setDeletingAll(true);
    setError("");

    try {
      await deleteAllSavedSimulations(type);
      setItems([]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore durante l'eliminazione."
      );
    } finally {
      setDeletingAll(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(15,23,42,.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          maxHeight: "82vh",
          overflow: "auto",
          background: "white",
          borderRadius: 18,
          boxShadow: "0 24px 70px rgba(15,23,42,.28)",
          padding: 18,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 950, fontSize: 22 }}>
              {title}
            </div>
            <div
              style={{
                color: "#64748b",
                fontSize: 12,
                marginTop: 3,
              }}
            >
              Ultime 100 simulazioni salvate
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              disabled={
                deletingAll || loading || items.length === 0
              }
              onClick={() => void handleDeleteAll()}
              style={{
                border: "1px solid #dc2626",
                background: "#dc2626",
                color: "white",
                borderRadius: 9,
                padding: "8px 11px",
                fontWeight: 900,
                cursor:
                  deletingAll || loading || items.length === 0
                    ? "default"
                    : "pointer",
                opacity:
                  deletingAll || loading || items.length === 0
                    ? 0.55
                    : 1,
              }}
            >
              {deletingAll ? "ELIMINAZIONE..." : "ELIMINA TUTTO"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "1px solid #cbd5e1",
                background: "white",
                borderRadius: 9,
                padding: "8px 11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              CHIUDI
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 22, color: "#64748b" }}>
            Caricamento...
          </div>
        ) : error ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "#fef2f2",
              color: "#b91c1c",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 22, color: "#64748b" }}>
            Nessuna simulazione salvata.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0,1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "11px 12px",
                  background: "#f8fafc",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      color: "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      marginTop: 3,
                    }}
                  >
                    {new Date(item.created_at).toLocaleString(
                      "it-IT"
                    )}
                  </div>
                  {item.agent_name && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#475569",
                        marginTop: 3,
                        fontWeight: 800,
                      }}
                    >
                      Agente: {item.agent_name}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 7,
                    flexWrap: "nowrap",
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenSimulation(item)}
                    style={{
                      border: 0,
                      background: "#0f172a",
                      color: "white",
                      borderRadius: 9,
                      padding: "8px 12px",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    APRI
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === item.id}
                    onClick={() =>
                      void handleDeleteOne(item)
                    }
                    style={{
                      border: "1px solid #dc2626",
                      background: "#fff",
                      color: "#b91c1c",
                      borderRadius: 9,
                      padding: "8px 10px",
                      fontWeight: 900,
                      cursor:
                        deletingId === item.id
                          ? "wait"
                          : "pointer",
                      opacity:
                        deletingId === item.id ? 0.6 : 1,
                    }}
                  >
                    {deletingId === item.id
                      ? "..."
                      : "ELIMINA"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const energyMonths = (f: string) =>
  f === "BIMESTRALE" || f === "MULTI POD BIMESTRALE" ? 2 : 1;

const gasMonths = (f: string) =>
  f === "BIMESTRALE" ? 2 : f === "TRIMESTRALE" ? 3 : f === "QUADRIMESTRALE" ? 4 : 1;

const energyVatRate = (tipo: string, iva: string) =>
  ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(tipo) ? 10 : n(iva);

function energyPdfTipologia(tipo: string) {
  if (tipo === "RESIDENTE" || tipo === "RESIDENTE CANONE ESENTE") return "DOMESTICO RESIDENTE";
  if (tipo === "NON RESIDENTE") return "DOMESTICO NON RESIDENTE";
  if (["BTA1", "BTA2", "BTA3", "BTA4", "BTA5", "BTA6"].includes(tipo)) return "ALTRI USI BT";
  if (["MTA1", "MTA2", "MTA3"].includes(tipo)) return "ALTRI USI MT";
  return tipo || "-";
}

function sanitizeFileName(name: string) {
  const cleaned = (name || "Cliente")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Cliente";
}

function printHtmlDocument(title: string, html: string, fileName?: string) {
  const win = window.open("", "_blank", "width=1000,height=900");
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
            text-rendering: geometricPrecision;
            -webkit-font-smoothing: antialiased;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 12px;
            background: #ffffff;
            color: #0f172a;
          }
          .page {
            width: 100%;
            max-width: 650px;
            margin: 0 auto;
          }
          .topbar {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .topbar-energy {
            border-bottom: 2px solid #f97316;
          }
          .topbar-gas {
            border-bottom: 2px solid #2563eb;
          }
          .title {
            font-size: 19px;
            font-weight: 700;
            margin: 0;
          }
          .box {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 9px;
            margin-bottom: 10px;
          }
          .box-energy {
            border: 2px solid #f97316 !important;
          }
          .box-gas {
            border: 2px solid #2563eb !important;
          }
          .section-title {
            font-size: 11px;
            font-weight: 700;
            margin: 0 0 6px 0;
            text-transform: uppercase;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .bar {
            height: 7px;
            border-radius: 0;
            margin-bottom: 6px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px 10px;
          }
          .label {
            font-size: 9px;
            color: #64748b;
            margin-bottom: 1px;
          }
          .value {
            font-size: 10px;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
          }
          th, td {
            padding: 4px 3px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            font-size: 10px;
            vertical-align: top;
          }
          th {
            font-size: 8px;
            color: #7c3aed;
            font-weight: 700;
          }
          th:nth-child(2), th:nth-child(3), th:nth-child(4),
          td:nth-child(2), td:nth-child(3), td:nth-child(4) {
            text-align: right;
            white-space: nowrap;
          }
          .strong-row td {
            font-weight: 700;
          }
          .sub-row td:first-child {
            color: #4b5563;
          }
          .total {
            margin-top: 8px;
            border-radius: 0;
            padding: 9px 11px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 15px;
            font-weight: 700;
            color: white;
          }
          .savings {
            margin-top: 8px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 8px 10px;
          }
          .savings-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            font-size: 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          .savings-row:last-child {
            border-bottom: none;
          }
          .savings-row strong {
            font-size: 11px;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          @media print {
            html, body {
              background: #ffffff !important;
            }
            body {
              padding: 0;
            }
            .page {
              max-width: none;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);

  win.document.close();
  win.focus();

  const finalFileName = sanitizeFileName(fileName || title);

  setTimeout(async () => {
    try {
      const doc = win.document;
      const page = doc.querySelector(".page") as HTMLElement | null;

      if (!page) {
        win.print();
        return;
      }

      // Aspetta che il browser abbia finito di comporre font e layout:
      // evita testi "morbidi" o catturati prima del rendering definitivo.
      if (doc.fonts?.ready) {
        await doc.fonts.ready;
      }

      const sourceCanvas = await html2canvas(page, {
        // 2.2x aumenta nettamente la definizione del testo rispetto al vecchio 1.2x.
        // La dimensione finale viene poi tenuta sotto 2 MB con compressione adattiva.
        scale: 2.2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 8000,
        windowWidth: Math.max(page.scrollWidth, 650),
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const marginTop = 8;
      const marginBottom = 18;
      const margin = 8;
      const usableWidth = pdfWidth - margin * 2;
      const usableHeight = pdfHeight - marginTop - marginBottom;
      const maxPdfBytes = 2 * 1024 * 1024;
      const targetPdfBytes = 1.9 * 1024 * 1024;

      const resizeCanvas = (
        input: HTMLCanvasElement,
        factor: number
      ) => {
        const output = document.createElement("canvas");
        output.width = Math.max(1, Math.round(input.width * factor));
        output.height = Math.max(1, Math.round(input.height * factor));

        const context = output.getContext("2d");
        if (!context) return input;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, output.width, output.height);
        context.drawImage(
          input,
          0,
          0,
          input.width,
          input.height,
          0,
          0,
          output.width,
          output.height
        );

        return output;
      };

      const buildPdf = (
        canvas: HTMLCanvasElement,
        jpegQuality: number
      ) => {
        const imgData = canvas.toDataURL("image/jpeg", jpegQuality);

        const pdf = new jsPDF({
          orientation: "p",
          unit: "mm",
          format: "a4",
          compress: true,
          putOnlyUsedFonts: true,
        });

        // Usa tutta la larghezza utile A4: il testo risulta anche fisicamente
        // più grande rispetto al precedente 90% della pagina.
        const imgWidth = usableWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let renderedHeight = 0;
        let pageIndex = 0;

        while (renderedHeight < imgHeight) {
          if (pageIndex > 0) {
            pdf.addPage();
          }

          pdf.addImage(
            imgData,
            "JPEG",
            margin,
            marginTop - renderedHeight,
            imgWidth,
            imgHeight,
            "preventivo-page",
            "FAST"
          );

          renderedHeight += usableHeight;
          pageIndex += 1;
        }

        return pdf;
      };

      let workingCanvas = sourceCanvas;
      let quality = 0.9;
      let pdf = buildPdf(workingCanvas, quality);
      let blob = pdf.output("blob");

      // Mantiene il file entro il limite richiesto senza sacrificare
      // inutilmente la nitidezza quando il documento è già leggero.
      let attempts = 0;
      while (blob.size > targetPdfBytes && attempts < 10) {
        attempts += 1;

        if (quality > 0.58) {
          quality = Math.max(0.58, quality - 0.06);
        } else {
          workingCanvas = resizeCanvas(workingCanvas, 0.88);
        }

        pdf = buildPdf(workingCanvas, quality);
        blob = pdf.output("blob");
      }

      // Ultima rete di sicurezza: il PDF scaricato non deve superare 2 MB.
      // Se un preventivo fosse eccezionalmente lungo, riduce gradualmente
      // la risoluzione fino a rientrare nel limite.
      let safetyAttempts = 0;
      while (blob.size > maxPdfBytes && safetyAttempts < 12) {
        safetyAttempts += 1;
        workingCanvas = resizeCanvas(workingCanvas, 0.84);
        quality = Math.max(0.42, Math.min(quality, 0.56) - 0.015);
        pdf = buildPdf(workingCanvas, quality);
        blob = pdf.output("blob");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${finalFileName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);

      win.close();
    } catch (error) {
      console.error("PDF GENERATION ERROR:", error);
      win.print();
    }
  }, 450);
}

function field(label: string, value: string, setValue: (v: string) => void, type = "text") {
  const inputType = type === "number" ? "text" : type;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <input
        style={{
          width: "100%",
          padding: 8,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          boxSizing: "border-box",
        }}
        type={inputType}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function selectField(
  label: string,
  value: string,
  setValue: (v: string) => void,
  options: string[]
) {
  return (
    <div>
      <div
        style={{
          fontSize:12,
          fontWeight:700,
          marginBottom:4,
          color:"inherit"
        }}
      >
        {label}
      </div>

      <select
        style={{
          width:"100%",
          padding:8,
          border:"1px solid #cbd5e1",
          background:"white",
          color:"inherit",
          fontWeight:400,
          borderRadius:8,
          boxSizing:"border-box",
        }}
        value={value}
        onChange={(e)=>setValue(e.target.value)}
      >
        {options.map((o)=>(
          <option key={o} value={o}>
            {o || "-"}
          </option>
        ))}
      </select>
    </div>
  );
}

function toggleAmount(
  label: string,
  flag: string,
  setFlag: (v: string) => void,
  value: string,
  setValue: (v: string) => void
) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 12,
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <select value={flag} onChange={(e) => setFlag(e.target.value)} style={{ padding: 6, borderRadius: 8 }}>
          <option>NO</option>
          <option>SI</option>
        </select>
      </div>
      {isSi(flag) && (
        <input
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxSizing: "border-box",
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          step="0.000001"
          placeholder="Importo"
        />
      )}
    </div>
  );
}

function row(label: string, value: string, bold = false, fontSize?: number) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid #e2e8f0",
        gap: 12,
        fontWeight: bold ? 700 : 400,
        fontSize: fontSize || 14,
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function previewBox(children: React.ReactNode, accent = "#e2e8f0") {
  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        borderRadius: 10,
        padding: 12,
        background: "#ffffff",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function sLikeBimestrale(fatturazione: string) {
  return fatturazione === "BIMESTRALE" || fatturazione === "MULTI POD BIMESTRALE";
}

function calcEnergia(
  d: any,
  punPsvRows: PunPsvRow[],
  energyOffers: EnergyOffer[],
  dispCpRows: DispCpRow[]
) {
  const off = energyOffers.find((x) => x.nome === d.offerta) || energyOffers[0];

  const row1 = punPsvRows.find((x) => x.mese === d.mese1) || punPsvRows[0];
  const row2 = punPsvRows.find((x) => x.mese === d.mese2) || punPsvRows[0];

  const fissoDomesticoRow =
    punPsvRows.find((x) => x.mese === "FISSO DOMESTICO") || punPsvRows[0];

  const fissoBusinessRow =
    punPsvRows.find((x) => x.mese === "FISSO BUSINESS") || punPsvRows[0];

  const mese1IsFisso = d.mese1 === "FISSO DOMESTICO" || d.mese1 === "FISSO BUSINESS";
  const mese2IsFisso = d.mese2 === "FISSO DOMESTICO" || d.mese2 === "FISSO BUSINESS";

  const mese1UsaMeseDisp = mese1IsFisso || d.mese1 === "FISSO AD HOC";
  const mese2UsaMeseDisp = mese2IsFisso || d.mese2 === "FISSO AD HOC";

  const meseTabella1 = mese1UsaMeseDisp
    ? d.meseRifTabella1
    : String(d.mese1 || "").split(" ")[0];

  const meseTabella2 = mese2UsaMeseDisp
    ? d.meseRifTabella2
    : String(d.mese2 || "").split(" ")[0];

  const dispRow1 = dispCpRows.find((x) => x.mese === meseTabella1);
  const dispRow2 = dispCpRows.find((x) => x.mese === meseTabella2);

  const isDomestico = ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(d.tipo);
  const fissoRow = isDomestico ? fissoDomesticoRow : fissoBusinessRow;

  const mesi = energyMonths(d.fatturazione);

  const spreadEff = isDedicatedOffer(d.offerta) ? n(d.dedicataSpread) : n(off.spread);
  const cmEff =
    isDedicatedOffer(d.offerta)
      ? n(d.dedicataCapacityMarket)
      : n(off.maggiorazioneCapacityMarket);
  const quotaFissaEff =
    isDedicatedOffer(d.offerta) ? n(d.dedicataQuotaFissa) : n(off.canone);

  const prezzoMono1 = mese1IsFisso ? n(fissoRow.mono) : n(row1.mono);
  const prezzoMono2 = mese2IsFisso ? n(fissoRow.mono) : n(row2.mono);

  const prezzoF11 = mese1IsFisso ? n(fissoRow.f1) : n(row1.f1);
  const prezzoF12 = mese2IsFisso ? n(fissoRow.f1) : n(row2.f1);

  const prezzoF21 = mese1IsFisso ? n(fissoRow.f2) : n(row1.f2);
  const prezzoF22 = mese2IsFisso ? n(fissoRow.f2) : n(row2.f2);

  const prezzoF31 = mese1IsFisso ? n(fissoRow.f3) : n(row1.f3);
  const prezzoF32 = mese2IsFisso ? n(fissoRow.f3) : n(row2.f3);

  const consumiMese1 =
    n(d.f1Mese1) + n(d.f2Mese1) + n(d.f3Mese1) + n(d.monoMese1);
  const consumiMese2 =
    n(d.f1Mese2) + n(d.f2Mese2) + n(d.f3Mese2) + n(d.monoMese2);
  const consumiTot = consumiMese1 + consumiMese2;

  const perditaPercentuale =
    ["MTA1", "MTA2", "MTA3"].includes(d.tipo) ? 0.038 : 0.1;

  const H22_base =
    n(d.f1Mese1) * (prezzoF11 + spreadEff) +
    n(d.f1Mese2) * (prezzoF12 + spreadEff) +
    n(d.f2Mese1) * (prezzoF21 + spreadEff) +
    n(d.f2Mese2) * (prezzoF22 + spreadEff) +
    n(d.f3Mese1) * (prezzoF31 + spreadEff) +
    n(d.f3Mese2) * (prezzoF32 + spreadEff) +
    n(d.monoMese1) * (prezzoMono1 + spreadEff) +
    n(d.monoMese2) * (prezzoMono2 + spreadEff);

  const perditeEnergia =
    n(d.f1Mese1) * perditaPercentuale * (prezzoF11 + spreadEff) +
    n(d.f1Mese2) * perditaPercentuale * (prezzoF12 + spreadEff) +
    n(d.f2Mese1) * perditaPercentuale * (prezzoF21 + spreadEff) +
    n(d.f2Mese2) * perditaPercentuale * (prezzoF22 + spreadEff) +
    n(d.f3Mese1) * perditaPercentuale * (prezzoF31 + spreadEff) +
    n(d.f3Mese2) * perditaPercentuale * (prezzoF32 + spreadEff) +
    n(d.monoMese1) * perditaPercentuale * (prezzoMono1 + spreadEff) +
    n(d.monoMese2) * perditaPercentuale * (prezzoMono2 + spreadEff);

  const totDispCp1 = n(dispRow1?.dispacciamento) + n(dispRow1?.cpMarket);
  const totDispCp2 = n(dispRow2?.dispacciamento) + n(dispRow2?.cpMarket);

  let dispCpBase = 0;
  if (sLikeBimestrale(d.fatturazione) && d.mese2) {
    if (consumiMese1 > 0 || consumiMese2 > 0) {
      const denom = consumiMese1 + consumiMese2;
      dispCpBase =
        denom > 0
          ? (consumiMese1 * totDispCp1 + consumiMese2 * totDispCp2) / denom
          : 0;
    } else {
      dispCpBase = (totDispCp1 + totDispCp2) / 2;
    }
  } else {
    dispCpBase = totDispCp1;
  }

  const consumiTotConPerdite = consumiTot * (1 + perditaPercentuale);
  const dispCpTotale =
    consumiTotConPerdite * (n(d.dispacciamentoCapacityMarket) + cmEff);

  const H22 = H22_base + perditeEnergia + dispCpTotale;
  const H24 = n(d.reattivaImmessa) + n(d.reattivaPrelevata);
  const H25 = n(d.quotaConsumiRete);
  const H28 = n(d.numeroPod) * quotaFissaEff * mesi;
  const H29 = n(d.quotaFissaRete);
  const H30 = n(d.quotaPotenzaRete);

  const H35 = isSi(d.acciseManualiFlag) ? n(d.acciseManualiValore) : consumiTot * 0.0125;
  const H38 = isSi(d.ricalcoloFlag) ? n(d.ricalcoloValore) : 0;
  const H39 = isSi(d.bonusFlag) ? n(d.bonusValore) : 0;
  const H40 = d.tipo === "RESIDENTE" ? 9 * mesi - n(d.canoneRaiGiaPagato) : 0;

  const imponibileIva = H22 + H25 + H24 + H28 + H29 + H30 + H35 + H38;
  const H36 = (imponibileIva * energyVatRate(d.tipo, d.iva)) / 100;
  const H37 = H35 + H36;
  const H41 = H22 + H25 + H24 + H28 + H29 + H30 + H37 + H38 - H39 + H40;

  const risparmioFattura = isSi(d.confrontoFlag) ? H41 - n(d.confrontoValore) : 0;
  const risparmioAnnuo = isSi(d.confrontoFlag) ? (risparmioFattura * 12) / mesi : 0;

  return {
    H22_base,
    H22,
    H24,
    H25,
    H28,
    H29,
    H30,
    H35,
    H36,
    H37,
    H38,
    H39,
    H40,
    H41,
    risparmioFattura,
    risparmioAnnuo,
    consumiTot,
    consumiMese1,
    consumiMese2,
    spreadEff,
    cmEff,
    quotaFissaEff,
    dispCpTotale,
    dispCpBase,
    perditaPercentuale,
    perditeEnergia,
  };
}

function calcGas(d: any, punPsvRows: PunPsvRow[], gasOffers: GasOffer[]) {
  const off = gasOffers.find((x) => x.nome === d.offerta) || gasOffers[0];
  const mesi = gasMonths(d.fatturazione);

  const spreadEff =
    isDedicatedOffer(d.offerta) ? n(d.dedicataSpread) : n(off.spread);

  const quotaVarEff =
    isDedicatedOffer(d.offerta)
      ? n(d.dedicataQuotaVariabile)
      : n(off.quotaVariabile);

  const quotaFissaEff =
    isDedicatedOffer(d.offerta) ? n(d.dedicataQuotaFissa) : n(off.canone);

  const p1 = n((punPsvRows.find((x) => x.mese === d.periodo1) || { psv: 0 }).psv);
  const p2 = n((punPsvRows.find((x) => x.mese === d.periodo2) || { psv: 0 }).psv);
  const p3 = n((punPsvRows.find((x) => x.mese === d.periodo3) || { psv: 0 }).psv);
  const p4 = n((punPsvRows.find((x) => x.mese === d.periodo4) || { psv: 0 }).psv);

  const consumoTotale =
    n(d.consumo1) +
    n(d.consumo2) +
    n(d.consumo3) +
    n(d.consumo4);

  const X55 =
    p1 * n(d.consumo1) +
    p2 * n(d.consumo2) +
    p3 * n(d.consumo3) +
    p4 * n(d.consumo4) +
    consumoTotale * spreadEff;

  const X56 = consumoTotale * quotaVarEff;
  const X57 = consumoTotale * n(d.adeguamentoParametro);
  const H22 = X55 + X56 + X57;
  const H23 = n(d.quotaVariabileAggiuntiva);
  const H24 = H22 + H23;
  const H27 = quotaFissaEff * mesi;
  const H28 = n(d.quotaFissaAggiuntiva);
  const H29 = H27 + H28;
  const accisaCoeff = n(d.accisaValore);
  const H32 = isSi(d.overrideAcciseFlag)
    ? n(d.overrideAcciseValore)
    : consumoTotale * accisaCoeff;
  const H35 = isSi(d.ricalcoloFlag) ? n(d.ricalcoloValore) : 0;
  const H33 = ((H24 + H29 + H32 + H35) / 100) * n(d.iva);
  const H34 = H32 + H33;
  const H36 = isSi(d.bonusFlag) ? n(d.bonusValore) : 0;
  const H37 = H24 + H29 + H34 + H35 - H36;
  const risparmioFattura = isSi(d.confrontoFlag) ? H37 - n(d.confrontoValore) : 0;
  const risparmioAnnuo = isSi(d.confrontoFlag) ? (risparmioFattura / mesi) * 12 : 0;

  return {
    X55,
    X56,
    X57,
    H22,
    H23,
    H24,
    H27,
    H28,
    H29,
    H32,
    H33,
    H34,
    H35,
    H36,
    H37,
    risparmioFattura,
    risparmioAnnuo,
    spreadEff,
    quotaVarEff,
    quotaFissaEff,
    consumoTotale,
    accisaCoeff,
    p1,
    p2,
    p3,
    p4,
  };
}

function Energia({
  punPsvRows,
  energyOffers,
  dispCpRows,
  showAgentAssociation,
}: {
  punPsvRows: PunPsvRow[];
  energyOffers: EnergyOffer[];
  dispCpRows: DispCpRow[];
  showAgentAssociation: boolean;
}) {
  const visibleEnergyOffers = energyOffers.filter((offer) => offer.visibile !== false);

  const buildEnergyInitialState = () => ({
    iva: "22",
    nome: "",
    pod: "",
    fatturazione: "MENSILE",
    numeroPod: "1",
    tipo: "BTA2",
    offerta: visibleEnergyOffers[0]?.nome || "",
    mese1: "",
    mese2: "",
    meseRifTabella1: "GENNAIO",
    meseRifTabella2: "GENNAIO",
    f1Mese1: "",
    f2Mese1: "",
    f3Mese1: "",
    monoMese1: "",
    f1Mese2: "",
    f2Mese2: "",
    f3Mese2: "",
    monoMese2: "",
    dispacciamentoCapacityMarket: "",
    dedicataSpread: "",
    dedicataCapacityMarket: "",
    dedicataQuotaFissa: "",
    quotaConsumiRete: "",
    quotaFissaRete: "",
    quotaPotenzaRete: "",
    reattivaImmessa: "",
    reattivaPrelevata: "",
    confrontoFlag: "NO",
    confrontoValore: "",
    ricalcoloFlag: "NO",
    ricalcoloValore: "",
    bonusFlag: "NO",
    bonusValore: "",
    acciseManualiFlag: "NO",
    acciseManualiValore: "",
    canoneRaiGiaPagato: "0",
  });

  const energyDraftRef = useRef<{
    state: ReturnType<typeof buildEnergyInitialState>;
    updatedAt: number;
  } | null>(null);

  if (!energyDraftRef.current) {
    energyDraftRef.current = readSimulationDraft(
      ENERGY_SIMULATION_DRAFT_KEY,
      buildEnergyInitialState()
    );
  }

  const [s, setS] = useState(
    () => energyDraftRef.current!.state
  );
  const [lastEnergyInputAt, setLastEnergyInputAt] =
    useState(() => energyDraftRef.current!.updatedAt);

  useEffect(() => {
    writeSimulationDraft(
      ENERGY_SIMULATION_DRAFT_KEY,
      s,
      lastEnergyInputAt
    );
  }, [s, lastEnergyInputAt]);

  useEffect(() => {
    const remaining = Math.max(
      0,
      SIMULATION_DRAFT_IDLE_MS -
        (Date.now() - lastEnergyInputAt)
    );

    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(
        ENERGY_SIMULATION_DRAFT_KEY
      );
      setS(buildEnergyInitialState());
      setLastEnergyInputAt(Date.now());
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [lastEnergyInputAt]);

  const resetEnergySimulation = () => {
    if (
      !window.confirm(
        "Vuoi iniziare una nuova simulazione Energia? Tutti i dati inseriti verranno cancellati."
      )
    ) return;

    sessionStorage.removeItem(
      ENERGY_SIMULATION_DRAFT_KEY
    );
    setS(buildEnergyInitialState());
    setLastEnergyInputAt(Date.now());
  };

  const [energySavedOpen, setEnergySavedOpen] =
    useState(false);
  const [energySaveConfirmOpen, setEnergySaveConfirmOpen] =
    useState(false);

  const confirmEnergySimulationSave = async (
    customerName: string,
    agentName: string
  ) => {
    const stateToSave = {
      ...s,
      nome: customerName,
    };

    setS(stateToSave);
    setLastEnergyInputAt(Date.now());

    await saveSimulationArchive(
      "energy",
      customerName,
      stateToSave,
      agentName
    );
  };

  const openSavedEnergySimulation = (
    simulation: SavedSimulation
  ) => {
    const restored = {
      ...buildEnergyInitialState(),
      ...(simulation.state || {}),
    };

    setS(restored);
    setLastEnergyInputAt(Date.now());
    setEnergySavedOpen(false);
  };

  const energyFixedMode = isFixedCompetenceMonth(s.mese1);

  const compatibleEnergyOffers = visibleEnergyOffers.filter(
    (offer) => isSicuraOffer(offer.nome) === energyFixedMode
  );

  useEffect(() => {
    if (!s.mese1) return;
    if (
      compatibleEnergyOffers.some(
        (offer) => offer.nome === s.offerta
      )
    ) {
      return;
    }

    setS((prev) => ({
      ...prev,
      offerta: compatibleEnergyOffers[0]?.nome || "",
    }));
  }, [
    energyOffers,
    s.mese1,
    s.offerta,
    energyFixedMode,
  ]);

  useEffect(() => {
    const validMonthOptions = [...punPsvRows]
      .filter((row) => {
        if (
          row.mese === "FISSO DOMESTICO" ||
          row.mese === "FISSO BUSINESS"
        ) {
          return false;
        }
  
        return (
          Number(row.mono || 0) !== 0 ||
          Number(row.f1 || 0) !== 0 ||
          Number(row.f2 || 0) !== 0 ||
          Number(row.f3 || 0) !== 0 ||
          Number(row.psv || 0) !== 0
        );
      })
      .sort((a, b) => {
        const mesi = [
          "GENNAIO",
          "FEBBRAIO",
          "MARZO",
          "APRILE",
          "MAGGIO",
          "GIUGNO",
          "LUGLIO",
          "AGOSTO",
          "SETTEMBRE",
          "OTTOBRE",
          "NOVEMBRE",
          "DICEMBRE",
        ];
  
        const score = (label: string) => {
          const parts = String(label).trim().split(" ");
          const mese = parts[0]?.toUpperCase() || "";
          const anno = parseInt(parts[1] || "0", 10);
          const meseIndex = mesi.indexOf(mese);
          return anno * 100 + meseIndex;
        };
  
        return score(b.mese) - score(a.mese);
      });
  
    if (validMonthOptions.length > 0 && !s.mese1) {
      setS((prev) => ({
        ...prev,
        mese1: validMonthOptions[0].mese,
      }));
    }
  }, [punPsvRows, s.mese1]);
  
  
  const dispCpMonthOptions = dispCpRows.map((row) => row.mese);

  const mesiOrdinati = [...punPsvRows]
  .filter((m) => {
    if (m.mese === "FISSO DOMESTICO" || m.mese === "FISSO BUSINESS" || m.mese === "FISSO AD HOC") return true;
    return (
      n(m.mono) !== 0 ||
      n(m.f1) !== 0 ||
      n(m.f2) !== 0 ||
      n(m.f3) !== 0
    );
  })
  .sort((a, b) => {
    if (a.mese === "FISSO DOMESTICO") return -1;
    if (b.mese === "FISSO DOMESTICO") return 1;
    if (a.mese === "FISSO BUSINESS") return -1;
    if (b.mese === "FISSO BUSINESS") return 1;
    if (a.mese === "FISSO AD HOC") return -1;
    if (b.mese === "FISSO AD HOC") return 1;

    const getAnno = (m: string) => Number(m.split(" ")[1] || 0);

    const getMeseNumero = (m: string) => {
      const mesi = [
        "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
        "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
      ];
      return mesi.findIndex(x => m.startsWith(x));
    };

    const annoA = getAnno(a.mese);
    const annoB = getAnno(b.mese);

    if (annoA !== annoB) return annoB - annoA;

    return getMeseNumero(b.mese) - getMeseNumero(a.mese);
  });

  const energyAllMonthOptions = mesiOrdinati.map(
    (item) => item.mese
  );
  const energySecondaryMonthOptions =
    energyAllMonthOptions.filter(
      (month) =>
        isFixedCompetenceMonth(month) === energyFixedMode
    );

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [openSections, setOpenSections] = useState({
    dati: true,
    mesi: true,
    rete: !window.innerWidth || window.innerWidth >= 768,
    anteprima: true,
  });

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile) {
        setOpenSections({
          dati: true,
          mesi: true,
          rete: true,
          anteprima: true,
        });
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSection = (key: "dati" | "mesi" | "rete" | "anteprima") => {
    if (!isMobile) return;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sectionCard = (
    key: "dati" | "mesi" | "rete" | "anteprima",
    title: string,
    children: React.ReactNode
  ) => (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: isMobile ? 14 : 16,
      }}
    >
      <button
        type="button"
        onClick={() => toggleSection(key)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: !isMobile || openSections[key] ? 12 : 0,
          cursor: isMobile ? "pointer" : "default",
        }}
      >
        <h3 style={{ margin: 0, fontSize: isMobile ? 18 : 20 }}>{title}</h3>
        {isMobile && (
          <span style={{ fontSize: 18, color: "#475569", fontWeight: 700 }}>
            {openSections[key] ? "−" : "+"}
          </span>
        )}
      </button>

      {(!isMobile || openSections[key]) && children}
    </div>
  );

  useEffect(() => {
    if (!dispCpMonthOptions.length) return;

    setS((prev) => {
      let changed = false;
      let meseRifTabella1 = prev.meseRifTabella1;
      let meseRifTabella2 = prev.meseRifTabella2;

      if (!dispCpMonthOptions.includes(meseRifTabella1)) {
        meseRifTabella1 = dispCpMonthOptions[0];
        changed = true;
      }

      if (!dispCpMonthOptions.includes(meseRifTabella2)) {
        meseRifTabella2 = dispCpMonthOptions[0];
        changed = true;
      }

      return changed ? { ...prev, meseRifTabella1, meseRifTabella2 } : prev;
    });
  }, [dispCpRows]);

  const r = useMemo(
    () => calcEnergia(s, punPsvRows, energyOffers, dispCpRows),
    [s, punPsvRows, energyOffers, dispCpRows]
  );

  const energyReferenceRows = useMemo(() => {
    const isDomestic = ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(s.tipo);
    const actualFixedLabel = isDomestic ? "FISSO DOMESTICO" : "FISSO BUSINESS";
    const actualFixedRow =
      punPsvRows.find((row) => row.mese === actualFixedLabel) || punPsvRows[0];

    const buildRow = (selectedMonth: string, index: number) => {
      if (!selectedMonth) return null;

      if (selectedMonth === "FISSO DOMESTICO" || selectedMonth === "FISSO BUSINESS") {
        return {
          label: `Mese ${index} · ${actualFixedLabel}`,
          value: `FISSO · F1 ${referencePriceFormat(n(actualFixedRow?.f1))} · F2 ${referencePriceFormat(n(actualFixedRow?.f2))} · F3 ${referencePriceFormat(n(actualFixedRow?.f3))} · F0 ${referencePriceFormat(n(actualFixedRow?.mono))} €/kWh`,
        };
      }

      if (selectedMonth === "FISSO AD HOC") {
        return {
          label: `Mese ${index} · FISSO AD HOC`,
          value: `Prezzo fisso ${referencePriceFormat(r.spreadEff)} €/kWh`,
        };
      }

      const source = punPsvRows.find((row) => row.mese === selectedMonth);
      return {
        label: `Mese ${index} · ${selectedMonth}`,
        value: source
          ? `F1 ${referencePriceFormat(n(source.f1))} · F2 ${referencePriceFormat(n(source.f2))} · F3 ${referencePriceFormat(n(source.f3))} · F0 ${referencePriceFormat(n(source.mono))} €/kWh`
          : "-",
      };
    };

    const result = [buildRow(s.mese1, 1)];
    if (sLikeBimestrale(s.fatturazione) && s.mese2) {
      result.push(buildRow(s.mese2, 2));
    }

    return result.filter(Boolean) as Array<{ label: string; value: string }>;
  }, [s.mese1, s.mese2, s.fatturazione, s.tipo, punPsvRows, r.spreadEff]);

    useEffect(() => {
    if (!s.dispacciamentoCapacityMarket || s.dispacciamentoCapacityMarket === "0") {
      setS((prev) => ({
        ...prev,
        dispacciamentoCapacityMarket: String(r.dispCpBase),
      }));
    }
  }, [r.dispCpBase]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: string) => {
    setLastEnergyInputAt(Date.now());
    setS((prev) => {
      const newState = { ...prev, [k]: v };

      if (k === "tipo") {
        if (["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(v)) {
          newState.iva = "10";
        } else if (
          ["BTA1", "BTA2", "BTA3", "BTA4", "BTA5", "BTA6", "MTA1", "MTA2", "MTA3"].includes(v)
        ) {
          newState.iva = "22";
        }
      }

      if (k === "mese1") {
        const nextFixedMode =
          isFixedCompetenceMonth(v);

        if (
          newState.mese2 &&
          isFixedCompetenceMonth(newState.mese2) !==
            nextFixedMode
        ) {
          newState.mese2 = "";
        }
      }

      return newState;
    });
  };

  const consumoAnnuoEnergia =
    r.consumiTot *
    (s.fatturazione === "MENSILE" || s.fatturazione === "MULTI POD MENSILE" ? 12 : 6);
    const getPunByMonth = (mese: string, anno: number) => {
      const key = `${mese} ${anno}`;
      const row = punPsvRows.find((r) => r.mese === key);
      return row?.pun || 0;
    };
    const prezzoMedioEnergiaScheda =
    r.consumiTot > 0
      ? `${(r.H22 / r.consumiTot)
          .toFixed(6)
          .replace(".", ",")} €/kWh`
      : "-";

  const boxStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#f8fafc",
    minWidth: isMobile ? 0 : 170,
    textAlign: "right",
  };

  const printEnergyPdf = () => {
    const periodo = [s.mese1, s.mese2].filter(Boolean).join(" / ") || "-";
    const orange = "#f97316";
    const green = "#16a34a";

    const quotaConsumiTot = r.H22 + r.H25 + r.H24;
    const quotaFissaPotenzaTot = r.H28 + r.H29 + r.H30;

    const quantitaConsumi = `${r.consumiTot.toLocaleString("it-IT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} kWh`;

    const mesiTxt = `${energyMonths(s.fatturazione)} Mesi`;
    const quantitaPotenza = `${s.numeroPod || "1"} POD`;

    const prezzoMedioVendita =
      r.consumiTot > 0 ? `${(r.H22 / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh` : "-";
    const prezzoMedioRete =
      r.consumiTot > 0 ? `${(r.H25 / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh` : "-";
    const prezzoMedioTotale =
      r.consumiTot > 0 ? `${(quotaConsumiTot / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh` : "-";

    const altrePartiteRows = [
      r.H38 !== 0 ? `<tr><td>Ricalcoli/Sconti</td><td style="text-align:right">${money(r.H38)}</td></tr>` : "",
      r.H39 !== 0 ? `<tr><td>Bonus sociale</td><td style="text-align:right">- ${money(r.H39)}</td></tr>` : "",
      r.H40 !== 0 ? `<tr><td>Canone RAI</td><td style="text-align:right">${money(r.H40)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const altrePartiteTot = [r.H38, -r.H39, r.H40].reduce((a, b) => a + b, 0);

    const acciseIvaRows = [
      ,
      r.H35 !== 0 ? `<tr><td>Accise</td><td style="text-align:right">${money(r.H35)}</td></tr>` : "",
      r.H36 !== 0 ? `<tr><td>IVA</td><td style="text-align:right">${money(r.H36)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const acciseIvaTot = [r.H35, r.H36].reduce((a, b) => a + b, 0);

    const html = `
      <div class="page">
        <div class="topbar topbar-energy">
          <div>
            <div class="title">Preventivo Fornitura Energia</div>
          </div>
        </div>

        <div class="box box-energy">
          <div class="section-title">Dati cliente</div>
          <div class="grid">
            <div><div class="label">Cliente</div><div class="value">${s.nome || "-"}</div></div>
            <div><div class="label">POD</div><div class="value">${s.pod || "-"}</div></div>
            <div><div class="label">Offerta</div><div class="value">${s.offerta || "-"}</div></div>
            <div><div class="label">Tipologia</div><div class="value">${energyPdfTipologia(s.tipo)}</div></div>
            <div><div class="label">Fatturazione</div><div class="value">${s.fatturazione || "-"}</div></div>
            <div><div class="label">Periodo</div><div class="value">${periodo}</div></div>
          </div>
        </div>

        <div class="box box-energy">
          <div class="section-title">
            <span>QUOTA CONSUMI</span>
            <span>${money(quotaConsumiTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>QUANTITÀ</th>
                <th>PREZZO MEDIO</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="strong-row">
                <td>Quota consumi</td>
                <td>${quantitaConsumi}</td>
                <td>${prezzoMedioTotale}</td>
                <td>${money(quotaConsumiTot)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per vendita energia elettrica</td>
                <td></td>
                <td>${prezzoMedioVendita}</td>
                <td>${money(r.H22)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td>${prezzoMedioRete}</td>
                <td>${money(r.H25)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui reattiva</td>
                <td></td>
                <td>-</td>
                <td>${money(r.H24)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="box box-energy">
          <div class="section-title">
            <span>QUOTA FISSA E QUOTA POTENZA</span>
            <span>${money(quotaFissaPotenzaTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>QUANTITÀ</th>
                <th>PREZZO MEDIO</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="strong-row">
                <td>Quota fissa</td>
                <td>${mesiTxt}</td>
                <td>-</td>
                <td>${money(r.H28 + r.H29)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per vendita energia elettrica</td>
                <td></td>
                <td></td>
                <td>${money(r.H28)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td></td>
                <td>${money(r.H29)}</td>
              </tr>
              <tr class="strong-row">
                <td>Quota potenza</td>
                <td>${quantitaPotenza}</td>
                <td>-</td>
                <td>${money(r.H30)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td></td>
                <td>${money(r.H30)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${
          altrePartiteRows
            ? `
        <div class="box box-energy">
          <div class="section-title">
            <span>ALTRE PARTITE</span>
            <span>${money(altrePartiteTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <tbody>
              ${altrePartiteRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        ${
          acciseIvaTot !== 0
            ? `
            <div class="box box-energy">
  <div class="section-title">
    <span>TOTALE IMPONIBILE</span>
    <span>${money(
      r.H22 +
      r.H25 +
      r.H24 +
      r.H28 +
      r.H29 +
      r.H30
    )}</span>
  </div>
  <div class="bar" style="background:${orange}"></div>
  <table>
    <tbody>
      <tr class="strong-row">
        <td>Totale imponibile</td>
        <td style="text-align:right">${money(
          r.H22 +
          r.H25 +
          r.H24 +
          r.H28 +
          r.H29 +
          r.H30
        )}</td>
      </tr>
    </tbody>
  </table>
</div>
        <div class="box box-energy">
          <div class="section-title">
            <span>ACCISE E IVA</span>
            <span>${money(acciseIvaTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <tbody>
              ${acciseIvaRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        <div class="total" style="background:${orange}">
          <span>TOTALE PREVENTIVO</span>
          <span>${money(r.H41)}</span>
        </div>

        ${
          isSi(s.confrontoFlag)
            ? `
        <div class="savings">
          <div class="savings-row">
            <span>Risparmio mensile</span>
            <strong>${money(r.risparmioFattura / energyMonths(s.fatturazione))}</strong>
          </div>
          <div class="savings-row">
            <span>Risparmio annuale</span>
            <strong>${money(r.risparmioAnnuo)}</strong>
          </div>
        </div>`
            : ""
        }
      </div>
    `;

    const cleanName = sanitizeFileName(s.nome || "Cliente");
printHtmlDocument("Preventivo Energia", html, `${cleanName} - Energia`);
};

return (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
      gap: 16,
      alignItems: "start",
    }}
  >
    <div
      style={{
        gridColumn: "1 / -1",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
        Salvataggio temporaneo attivo · reset automatico dopo 15 minuti di inattività
      </div>
      <div
        style={{
          display: isMobile ? "grid" : "flex",
          gridTemplateColumns: isMobile
            ? "repeat(3,minmax(0,1fr))"
            : undefined,
          gap: isMobile ? 6 : 8,
          flexWrap: "nowrap",
          justifyContent: "flex-end",
          width: isMobile ? "100%" : "auto",
        }}
      >
        <button
          type="button"
          onClick={resetEnergySimulation}
          style={{
            border: "1px solid #ef4444",
            background: "#fff",
            color: "#b91c1c",
            borderRadius: 10,
            padding: isMobile ? "8px 4px" : "9px 13px",
            fontWeight: 900,
            fontSize: isMobile ? 11 : 13,
            lineHeight: isMobile ? 1.08 : 1.2,
            whiteSpace: isMobile ? "normal" : "nowrap",
            minWidth: 0,
            minHeight: isMobile ? 58 : undefined,
            width: isMobile ? "100%" : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {isMobile ? (
            <>
              NUOVA
              <br />
              SIMULAZIONE
            </>
          ) : (
            "NUOVA SIMULAZIONE"
          )}
        </button>
        <button
          type="button"
          onClick={() => setEnergySaveConfirmOpen(true)}
          style={{
            border: "1px solid #16a34a",
            background: "#16a34a",
            color: "white",
            borderRadius: 10,
            padding: isMobile ? "8px 4px" : "9px 13px",
            fontWeight: 900,
            fontSize: isMobile ? 11 : 13,
            lineHeight: isMobile ? 1.08 : 1.2,
            whiteSpace: isMobile ? "normal" : "nowrap",
            minWidth: 0,
            minHeight: isMobile ? 58 : undefined,
            width: isMobile ? "100%" : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {isMobile ? (
            <>
              SALVA
              <br />
              SIMULAZIONE
            </>
          ) : (
            "SALVA SIMULAZIONE"
          )}
        </button>
        <button
          type="button"
          onClick={() => setEnergySavedOpen(true)}
          style={{
            border: "1px solid #2563eb",
            background: "#fff",
            color: "#1d4ed8",
            borderRadius: 10,
            padding: isMobile ? "8px 4px" : "9px 13px",
            fontWeight: 900,
            fontSize: isMobile ? 11 : 13,
            lineHeight: isMobile ? 1.08 : 1.2,
            whiteSpace: isMobile ? "normal" : "nowrap",
            minWidth: 0,
            minHeight: isMobile ? 58 : undefined,
            width: isMobile ? "100%" : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {isMobile ? (
            <>
              APRI
              <br />
              SIMULAZIONE
            </>
          ) : (
            "APRI SIMULAZIONE"
          )}
        </button>
      </div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sectionCard(
        "dati",
        "Energia",
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {field("Nome", s.nome, (v) => set("nome", v))}
            {field("POD", s.pod, (v) => set("pod", v))}
            {field("IVA %", s.iva, (v) => set("iva", v), "number")}
            {field("Numero POD", s.numeroPod, (v) => set("numeroPod", v), "number")}
            {selectField("Fatturazione", s.fatturazione, (v) => set("fatturazione", v), energyBilling)}
            {selectField("Tipo", s.tipo, (v) => set("tipo", v), energyTypes)}
            {selectField(
              "Offerta",
              s.offerta,
              (v) => set("offerta", v),
              compatibleEnergyOffers.map((x) => x.nome)
            )}
            {field("Canone RAI già pagato", s.canoneRaiGiaPagato, (v) => set("canoneRaiGiaPagato", v), "number")}
          </div>

          {isDedicatedOffer(s.offerta) && (
            <>
              <div style={{ height: 12 }} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                {field(isFixedDedicatedOffer(s.offerta) ? "PREZZO FISSO AD HOC SENZA PERDITE" : "Spread (senza perdite)", s.dedicataSpread, (v) => set("dedicataSpread", v), "number")}
                {field(
                  "Maggiorazione Capacity Market (senza perdite)",
                  s.dedicataCapacityMarket,
                  (v) => set("dedicataCapacityMarket", v),
                  "number"
                )}
                {field("Quota Fissa", s.dedicataQuotaFissa, (v) => set("dedicataQuotaFissa", v), "number")}
              </div>
            </>
          )}
        </>
      )}

      {sectionCard(
        "mesi",
        "Mesi e consumi",
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto auto",
              alignItems: "stretch",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ minWidth: 0 }} />

            <div style={boxStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Prezzo medio</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{prezzoMedioEnergiaScheda}</div>
            </div>

            <div style={boxStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo annuo</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {r.consumiTot > 0
                  ? `${consumoAnnuoEnergia.toLocaleString("it-IT", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })} kWh`
                  : "-"}
              </div>
            </div>

            <div style={boxStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo totale fattura</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {r.consumiTot > 0
                  ? `${r.consumiTot.toLocaleString("it-IT", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })} kWh`
                  : "-"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
            }}
          >
            <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    gap: 18,
  }}
>
  <div
    style={{
      border: "1px solid #cbd5e1",
      borderRadius: 12,
      padding: 14,
      background: "#fff7ed",
      display: "grid",
      gap: 12,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          s.mese1 === "FISSO DOMESTICO" || s.mese1 === "FISSO BUSINESS" || s.mese1 === "FISSO AD HOC"
            ? isMobile
              ? "1fr"
              : "1fr 1fr"
            : "1fr",
        gap: 10,
      }}
    >
      {selectField(
        "Mese 1",
        s.mese1,
        (v) => set("mese1", v),
        energyAllMonthOptions
      )}

      {(s.mese1 === "FISSO DOMESTICO" || s.mese1 === "FISSO BUSINESS" || s.mese1 === "FISSO AD HOC") &&
        selectField(
          "Mese DISP + CP.Mrk",
          s.meseRifTabella1,
          (v) => set("meseRifTabella1", v),
          dispCpMonthOptions
        )}
    </div>

    {field("F1 mese 1", s.f1Mese1, (v) => set("f1Mese1", v), "number")}
    {field("F2 mese 1", s.f2Mese1, (v) => set("f2Mese1", v), "number")}
    {field("F3 mese 1", s.f3Mese1, (v) => set("f3Mese1", v), "number")}
    {field("Mono mese 1", s.monoMese1, (v) => set("monoMese1", v), "number")}
  </div>

  <div
    style={{
      border: "1px solid #cbd5e1",
      borderRadius: 12,
      padding: 14,
      background: "#fff7ed",
      display: "grid",
      gap: 12,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          s.mese2 === "FISSO DOMESTICO" || s.mese2 === "FISSO BUSINESS" || s.mese2 === "FISSO AD HOC"
            ? isMobile
              ? "1fr"
              : "1fr 1fr"
            : "1fr",
        gap: 10,
      }}
    >
      {selectField(
        "Mese 2",
        s.mese2,
        (v) => set("mese2", v),
        ["", ...energySecondaryMonthOptions]
      )}

      {(s.mese2 === "FISSO DOMESTICO" || s.mese2 === "FISSO BUSINESS" || s.mese2 === "FISSO AD HOC") &&
        selectField(
          "Mese DISP + CP.Mrk",
          s.meseRifTabella2,
          (v) => set("meseRifTabella2", v),
          dispCpMonthOptions
        )}
    </div>

    {field("F1 mese 2", s.f1Mese2, (v) => set("f1Mese2", v), "number")}
    {field("F2 mese 2", s.f2Mese2, (v) => set("f2Mese2", v), "number")}
    {field("F3 mese 2", s.f3Mese2, (v) => set("f3Mese2", v), "number")}
    {field("Mono mese 2", s.monoMese2, (v) => set("monoMese2", v), "number")}
  </div>
</div>

<div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 12,
                alignItems: isMobile ? "stretch" : "center",
                flexWrap: "wrap",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <div
 style={{
   background:"#fffbea",
   border:"2px solid #e8d98a",
   borderRadius:8,
   padding:8
 }}
>
{field(
  "DISP + CP. Mrk da Calcolare",
  String(s.dispacciamentoCapacityMarket ?? "").replace(".", ","),
  (v) => {
    const pulito = v.replace(",", ".");
    set("dispacciamentoCapacityMarket", pulito);
  },
  "text"
)}
</div>

              <div style={{ minWidth: isMobile ? 0 : 220, width: isMobile ? "100%" : undefined }}>
  <div
    style={{
      border:"1px solid #cbd5e1",
      borderRadius:8,
      padding:10,
      background:"#ffffff"
    }}
  >
    <div
 style={{
   fontSize:12,
   fontWeight:700,
   lineHeight:1.2,
   marginBottom:8
 }}
>
DISP + CP.Mrk<br />
Base suggerito
</div>

    <div
  style={{
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    gap:10
  }}
>
  <div
    style={{
      fontSize:18,
      fontWeight:700
    }}
  >
    {numFormat(r.dispCpBase,4 )}
  </div>

  <button
 type="button"
 onClick={() =>
   set(
     "dispacciamentoCapacityMarket",
     String(r.dispCpBase)
   )
 }
 style={{
   padding:"6px 10px",
   borderRadius:20,
   border:"1px solid #d97706",
   background:"#fff7ed",
   color:"#c96a00",
   fontWeight:700,
   fontSize:12,
   cursor:"pointer",
   whiteSpace:"nowrap"
 }}
>
↺ Applica
</button>
</div>
  </div>
</div>
            </div>
          </div>
        </>
      )}

      {sectionCard(
        "rete",
        "Rete, oneri, rettifiche",
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {field("Quota consumi rete", s.quotaConsumiRete, (v) => set("quotaConsumiRete", v), "number")}
            {field("Quota fissa rete", s.quotaFissaRete, (v) => set("quotaFissaRete", v), "number")}
            {field("Quota potenza rete", s.quotaPotenzaRete, (v) => set("quotaPotenzaRete", v), "number")}
          </div>

          <div style={{ height: 12 }} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {field("Reattiva immessa", s.reattivaImmessa, (v) => set("reattivaImmessa", v), "number")}
            {field("Reattiva prelevata", s.reattivaPrelevata, (v) => set("reattivaPrelevata", v), "number")}
          </div>

          <div style={{ height: 12 }} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(4,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {toggleAmount(
              "Confronto Fornitore Precedente",
              s.confrontoFlag,
              (v) => set("confrontoFlag", v),
              s.confrontoValore,
              (v) => set("confrontoValore", v)
            )}
            {toggleAmount(
              "Ricalcoli/Sconti",
              s.ricalcoloFlag,
              (v) => set("ricalcoloFlag", v),
              s.ricalcoloValore,
              (v) => set("ricalcoloValore", v)
            )}
            {toggleAmount(
              "Bonus sociale",
              s.bonusFlag,
              (v) => set("bonusFlag", v),
              s.bonusValore,
              (v) => set("bonusValore", v)
            )}
            {toggleAmount(
              "Accise manuali",
              s.acciseManualiFlag,
              (v) => set("acciseManualiFlag", v),
              s.acciseManualiValore,
              (v) => set("acciseManualiValore", v)
            )}
          </div>
        </>
      )}
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sectionCard(
        "anteprima",
        "Anteprima Energia",
        <>
          {energyReferenceRows.length > 0 &&
            previewBox(
              <>
                {energyReferenceRows.map((item) => (
                  <React.Fragment key={item.label}>
                    {row(item.label, item.value)}
                  </React.Fragment>
                ))}
              </>,
              "#cbd5e1"
            )}

          {previewBox(
            <>
              {row(isFixedDedicatedOffer(s.offerta) ? "Prezzo fisso ad hoc usato" : "Spread usato", numFormat(r.spreadEff, 3))}
              {row("Maggiorazione CP.Mrk", numFormat(r.cmEff, 3))}
              {row("Quota fissa usata", money(r.quotaFissaEff))}
            </>
          )}

          {previewBox(
            <>
              {row(
                isFixedDedicatedOffer(s.offerta) ? "Prezzo energia fisso" : "Pun+Spread",
                `${numFormat(r.H22_base, 3)} €`
              )}
              {row("Perdite di rete", `${numFormat(r.perditeEnergia, 3)} €`)}
              {row("DISP+CP.Mrk totale", `${numFormat(r.dispCpTotale, 3)} €`)}
              {row("Reattiva", `${numFormat(r.H24, 3)} €`)}
            </>
          )}

          {previewBox(
            <>
              {row("Vendita energia", money(r.H22), true, 16)}
              {row("Quota consumi rete", money(r.H25))}
              {row("Reattiva", money(r.H24))}
              {row("Quota consumi totale", money(r.H22 + r.H25 + r.H24))}
            </>,
            "#fed7aa"
          )}

          {previewBox(
            <>
              {row("Quota fissa offerta/dedicata", money(r.H28))}
              {row("Quota fissa rete", money(r.H29))}
            </>
          )}

{previewBox(<>{row("Quota potenza rete", money(r.H30))}</>)}

{previewBox(
  <>
    {row(
      "TOTALE IMPONIBILE",
      money(
        r.H22 +
        r.H25 +
        r.H24 +
        r.H28 +
        r.H29 +
        r.H30
      ),
      true,
      16
    )}
  </>,
  "#ffedd5"
)}

{previewBox(
  <>
    {row("Accise", money(r.H35))}
    {row("IVA", money(r.H36))}
    {row("Totale Imposte", money(r.H37))}
  </>
)}

          {(r.H39 !== 0 || r.H38 !== 0 || r.H40 !== 0) &&
            previewBox(
              <>
                {r.H39 !== 0 && row("Bonus sociale", `- ${money(r.H39)}`)}
                {r.H38 !== 0 && row("Ricalcoli/Sconti", money(r.H38))}
                {r.H40 !== 0 && row("Canone RAI", money(r.H40))}
              </>
            )}

          {previewBox(<>{row("Totale preventivo", money(r.H41), true, 16)}</>, "#fdba74")}

          {isSi(s.confrontoFlag) &&
            previewBox(
              <>
                {row("Risparmio in fattura", money(r.risparmioFattura))}
                {row("Risparmio annuo", money(r.risparmioAnnuo))}
              </>
            )}

          <button
            onClick={printEnergyPdf}
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 8,
              background: "#0f172a",
              color: "white",
              border: "none",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Crea PDF Energia
          </button>
        </>
      )}
    </div>

    <SaveSimulationModal
      open={energySaveConfirmOpen}
      type="energy"
      initialName={s.nome}
      showAgentAssociation={showAgentAssociation}
      onClose={() => setEnergySaveConfirmOpen(false)}
      onConfirm={confirmEnergySimulationSave}
    />

    <SavedSimulationsModal
      open={energySavedOpen}
      type="energy"
      title="Simulazioni Energia salvate"
      onClose={() => setEnergySavedOpen(false)}
      onOpenSimulation={openSavedEnergySimulation}
    />
  </div>
);
}

function Gas({
  punPsvRows,
  gasOffers,
  gasAcciseSettings,
  showAgentAssociation,
}: {
  punPsvRows: PunPsvRow[];
  gasOffers: GasOffer[];
  gasAcciseSettings: GasAcciseSettings;
  showAgentAssociation: boolean;
}) {
  const visibleGasOffers = gasOffers.filter((offer) => offer.visibile !== false);

  const buildGasInitialState = () => ({
    iva: "10",
    nome: "",
    pdr: "",
    uso: "DOMESTICO",
    fatturazione: "MENSILE",
    offerta: visibleGasOffers[0]?.nome || "",
    periodo1: "",
    periodo2: "",
    periodo3: "",
    periodo4: "",
    consumo1: "",
    consumo2: "",
    consumo3: "",
    consumo4: "",
    adeguamentoParametro: "",
    dedicataSpread: "",
    dedicataQuotaVariabile: "",
    dedicataQuotaFissa: "",
    quotaVariabileAggiuntiva: "",
    quotaFissaAggiuntiva: "",
    accisaAgevolata: "NO",
    accisaValore: String(gasAcciseSettings.nonAgevolata),
    overrideAcciseFlag: "NO",
    overrideAcciseValore: "",
    confrontoFlag: "NO",
    confrontoValore: "",
    bonusFlag: "NO",
    bonusValore: "",
    ricalcoloFlag: "NO",
    ricalcoloValore: "",
  });

  const gasDraftRef = useRef<{
    state: ReturnType<typeof buildGasInitialState>;
    updatedAt: number;
  } | null>(null);

  if (!gasDraftRef.current) {
    gasDraftRef.current = readSimulationDraft(
      GAS_SIMULATION_DRAFT_KEY,
      buildGasInitialState()
    );
  }

  const [s, setS] = useState(
    () => gasDraftRef.current!.state
  );
  const [lastGasInputAt, setLastGasInputAt] =
    useState(() => gasDraftRef.current!.updatedAt);

  useEffect(() => {
    writeSimulationDraft(
      GAS_SIMULATION_DRAFT_KEY,
      s,
      lastGasInputAt
    );
  }, [s, lastGasInputAt]);

  useEffect(() => {
    const remaining = Math.max(
      0,
      SIMULATION_DRAFT_IDLE_MS -
        (Date.now() - lastGasInputAt)
    );

    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(
        GAS_SIMULATION_DRAFT_KEY
      );
      setS(buildGasInitialState());
      setLastGasInputAt(Date.now());
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [lastGasInputAt]);

  const resetGasSimulation = () => {
    if (
      !window.confirm(
        "Vuoi iniziare una nuova simulazione Gas? Tutti i dati inseriti verranno cancellati."
      )
    ) return;

    sessionStorage.removeItem(
      GAS_SIMULATION_DRAFT_KEY
    );
    setS(buildGasInitialState());
    setLastGasInputAt(Date.now());
  };

  const [gasSavedOpen, setGasSavedOpen] =
    useState(false);
  const [gasSaveConfirmOpen, setGasSaveConfirmOpen] =
    useState(false);

  const confirmGasSimulationSave = async (
    customerName: string,
    agentName: string
  ) => {
    const stateToSave = {
      ...s,
      nome: customerName,
    };

    setS(stateToSave);
    setLastGasInputAt(Date.now());

    await saveSimulationArchive(
      "gas",
      customerName,
      stateToSave,
      agentName
    );
  };

  const openSavedGasSimulation = (
    simulation: SavedSimulation
  ) => {
    const restored = {
      ...buildGasInitialState(),
      ...(simulation.state || {}),
    };

    setS(restored);
    setLastGasInputAt(Date.now());
    setGasSavedOpen(false);
  };

  const gasFixedMode =
    isFixedCompetenceMonth(s.periodo1);

  const compatibleGasOffers = visibleGasOffers.filter(
    (offer) => isSicuraOffer(offer.nome) === gasFixedMode
  );

  useEffect(() => {
    if (!s.periodo1) return;
    if (
      compatibleGasOffers.some(
        (offer) => offer.nome === s.offerta
      )
    ) {
      return;
    }

    setS((prev) => ({
      ...prev,
      offerta: compatibleGasOffers[0]?.nome || "",
    }));
  }, [
    gasOffers,
    s.periodo1,
    s.offerta,
    gasFixedMode,
  ]);

  useEffect(() => {
    const validMonthOptions = [...punPsvRows]
      .filter((row) => {
        if (
          row.mese === "FISSO DOMESTICO" ||
          row.mese === "FISSO BUSINESS"
        ) {
          return false;
        }
  
        return (
          Number(row.mono || 0) !== 0 ||
          Number(row.f1 || 0) !== 0 ||
          Number(row.f2 || 0) !== 0 ||
          Number(row.f3 || 0) !== 0 ||
          Number(row.psv || 0) !== 0
        );
      })
      .sort((a, b) => {
        const mesi = [
          "GENNAIO",
          "FEBBRAIO",
          "MARZO",
          "APRILE",
          "MAGGIO",
          "GIUGNO",
          "LUGLIO",
          "AGOSTO",
          "SETTEMBRE",
          "OTTOBRE",
          "NOVEMBRE",
          "DICEMBRE",
        ];
  
        const score = (label: string) => {
          const parts = String(label).trim().split(" ");
          const mese = parts[0]?.toUpperCase() || "";
          const anno = parseInt(parts[1] || "0", 10);
          const meseIndex = mesi.indexOf(mese);
          return anno * 100 + meseIndex;
        };
  
        return score(b.mese) - score(a.mese);
      });
  
    if (validMonthOptions.length > 0 && !s.periodo1) {
      setS((prev) => ({
        ...prev,
        periodo1: validMonthOptions[0].mese,
      }));
    }
  }, [punPsvRows, s.periodo1]);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [openSections, setOpenSections] = useState({
    dati: true,
    mesi: true,
    rete: !window.innerWidth || window.innerWidth >= 768,
    anteprima: true,
  });

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile) {
        setOpenSections({
          dati: true,
          mesi: true,
          rete: true,
          anteprima: true,
        });
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSection = (key: "dati" | "mesi" | "rete" | "anteprima") => {
    if (!isMobile) return;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const mesiOrdinati = [...punPsvRows]
  .filter((m) => {
    if (m.mese === "FISSO DOMESTICO" || m.mese === "FISSO BUSINESS" || m.mese === "FISSO AD HOC") return true;
    return n(m.psv) !== 0;
  })
  .sort((a, b) => {
    if (a.mese === "FISSO DOMESTICO") return -1;
    if (b.mese === "FISSO DOMESTICO") return 1;
    if (a.mese === "FISSO BUSINESS") return -1;
    if (b.mese === "FISSO BUSINESS") return 1;
    if (a.mese === "FISSO AD HOC") return -1;
    if (b.mese === "FISSO AD HOC") return 1;

    const getAnno = (m: string) => Number(m.split(" ")[1] || 0);

    const getMeseNumero = (m: string) => {
      const mesi = [
        "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
        "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
      ];
      return mesi.findIndex(x => m.startsWith(x));
    };

    const annoA = getAnno(a.mese);
    const annoB = getAnno(b.mese);

    if (annoA !== annoB) return annoB - annoA;

    return getMeseNumero(b.mese) - getMeseNumero(a.mese);
  });

  const sectionCard = (
    key: "dati" | "mesi" | "rete" | "anteprima",
    title: string,
    children: React.ReactNode
  ) => (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: isMobile ? 14 : 16,
      }}
    >
      <button
        type="button"
        onClick={() => toggleSection(key)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: !isMobile || openSections[key] ? 12 : 0,
          cursor: isMobile ? "pointer" : "default",
        }}
      >
        <h3 style={{ margin: 0, fontSize: isMobile ? 18 : 20 }}>{title}</h3>
        {isMobile && (
          <span style={{ fontSize: 18, color: "#475569", fontWeight: 700 }}>
            {openSections[key] ? "−" : "+"}
          </span>
        )}
      </button>

      {(!isMobile || openSections[key]) && children}
    </div>
  );

  const r = useMemo(() => calcGas(s, punPsvRows, gasOffers), [s, punPsvRows, gasOffers]);

  const gasReferenceRows = useMemo(() => {
    const selectedPeriods = [s.periodo1, s.periodo2, s.periodo3, s.periodo4];
    const periodCount = gasMonths(s.fatturazione);

    return selectedPeriods
      .slice(0, periodCount)
      .map((selectedPeriod, index) => {
        if (!selectedPeriod) return null;

        if (selectedPeriod === "FISSO AD HOC") {
          return {
            label: `Mese ${index + 1} · FISSO AD HOC`,
            value: `Prezzo fisso ${referencePriceFormat(r.spreadEff)} €/Smc`,
          };
        }

        const source = punPsvRows.find((row) => row.mese === selectedPeriod);
        const isFixed =
          selectedPeriod === "FISSO DOMESTICO" ||
          selectedPeriod === "FISSO BUSINESS";

        return {
          label: `Mese ${index + 1} · ${selectedPeriod}`,
          value: source
            ? isFixed
              ? `Prezzo fisso ${referencePriceFormat(n(source.psv))} €/Smc`
              : `PSV ${referencePriceFormat(n(source.psv))} €/Smc`
            : "-",
        };
      })
      .filter(Boolean) as Array<{ label: string; value: string }>;
  }, [
    s.periodo1,
    s.periodo2,
    s.periodo3,
    s.periodo4,
    s.fatturazione,
    punPsvRows,
    r.spreadEff,
  ]);

  const gasMonthOptions = mesiOrdinati
  .filter((m) => {
    if (m.mese === "FISSO DOMESTICO" || m.mese === "FISSO BUSINESS" || m.mese === "FISSO AD HOC") return true;
    return m.psv && m.psv !== 0;
  })
  .map((m) => m.mese);

  const gasSecondaryMonthOptions =
    gasMonthOptions.filter(
      (month) =>
        isFixedCompetenceMonth(month) === gasFixedMode
    );

  const set = (k: string, v: string) => {
    setLastGasInputAt(Date.now());
    setS((prev) => {
      const newState = { ...prev, [k]: v };

      if (k === "uso") {
        newState.iva = v === "DOMESTICO" ? "10" : "22";
      }

      if (k === "accisaAgevolata") {
        newState.accisaValore =
          v === "SI"
            ? String(gasAcciseSettings.agevolata)
            : String(gasAcciseSettings.nonAgevolata);
      }

      if (k === "periodo1") {
        const nextFixedMode =
          isFixedCompetenceMonth(v);

        (
          ["periodo2", "periodo3", "periodo4"] as const
        ).forEach((key) => {
          if (
            newState[key] &&
            isFixedCompetenceMonth(newState[key]) !==
              nextFixedMode
          ) {
            newState[key] = "";
          }
        });
      }

      return newState;
    });
  };

  const consumoAnnuoGas =
    r.consumoTotale *
    (s.fatturazione === "MENSILE"
      ? 12
      : s.fatturazione === "BIMESTRALE"
      ? 6
      : s.fatturazione === "TRIMESTRALE"
      ? 4
      : 3);

      const prezzoMedioGasScheda =
      r.consumoTotale > 0
        ? `${(r.H22 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc`
        : "-";

  const boxStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#f8fafc",
    minWidth: isMobile ? 0 : 170,
    textAlign: "right",
  };

  const printGasPdf = () => {
    const periodo = [s.periodo1, s.periodo2, s.periodo3, s.periodo4].filter(Boolean).join(" / ") || "-";
    const blue = "#2563eb";
    const green = "#16a34a";

    const prezzoMedioVenditaGasNaturale =
      r.consumoTotale > 0 ? `${(r.H22 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc` : "-";
    const prezzoMedioRete =
      r.consumoTotale > 0 ? `${(r.H23 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc` : "-";
    const prezzoMedioTotale =
      r.consumoTotale > 0 ? `${(r.H24 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc` : "-";

    const altrePartiteRows = [
      r.H35 !== 0 ? `<tr><td>Ricalcoli/Sconti</td><td style="text-align:right">${money(r.H35)}</td></tr>` : "",
      r.H36 !== 0 ? `<tr><td>Bonus sociale</td><td style="text-align:right">- ${money(r.H36)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const altrePartiteTot = [r.H35, -r.H36].reduce((a, b) => a + b, 0);

    const acciseIvaRows = [
      r.H32 !== 0 ? `<tr><td>Accise</td><td style="text-align:right">${money(r.H32)}</td></tr>` : "",
      r.H33 !== 0 ? `<tr><td>IVA</td><td style="text-align:right">${money(r.H33)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const acciseIvaTot = [r.H32, r.H33].reduce((a, b) => a + b, 0);

    const html = `
      <div class="page">
        <div class="topbar topbar-gas">
          <div>
            <div class="title">Preventivo Fornitura Gas</div>
          </div>
        </div>

        <div class="box box-gas">
          <div class="section-title">Dati cliente</div>
          <div class="grid">
            <div><div class="label">Cliente</div><div class="value">${s.nome || "-"}</div></div>
            <div><div class="label">PDR</div><div class="value">${s.pdr || "-"}</div></div>
            <div><div class="label">Offerta</div><div class="value">${s.offerta || "-"}</div></div>
            <div><div class="label">Uso</div><div class="value">${s.uso || "-"}</div></div>
            <div><div class="label">Fatturazione</div><div class="value">${s.fatturazione || "-"}</div></div>
            <div><div class="label">Periodo</div><div class="value">${periodo}</div></div>
          </div>
        </div>

        <div class="box box-gas">
          <div class="section-title">
            <span>QUOTA CONSUMI</span>
            <span>${money(r.H24)}</span>
          </div>
          <div class="bar" style="background:${blue}"></div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>QUANTITÀ</th>
                <th>PREZZO MEDIO</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="strong-row">
                <td>Quota consumi</td>
                <td>${r.consumoTotale.toLocaleString("it-IT", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })} Smc</td>
                <td>${prezzoMedioTotale}</td>
                <td>${money(r.H24)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per vendita gas naturale</td>
                <td></td>
                <td>${prezzoMedioVenditaGasNaturale}</td>
                <td>${money(r.H22)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td>${prezzoMedioRete}</td>
                <td>${money(r.H23)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="box box-gas">
          <div class="section-title">
            <span>QUOTA FISSA</span>
            <span>${money(r.H29)}</span>
          </div>
          <div class="bar" style="background:${blue}"></div>
          <table>
            <tbody>
              <tr class="sub-row">
                <td>di cui spesa per vendita gas naturale</td>
                <td style="text-align:right">${money(r.H27)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td style="text-align:right">${money(r.H28)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${
          altrePartiteRows
            ? `
        <div class="box box-gas">
          <div class="section-title">
            <span>ALTRE PARTITE</span>
            <span>${money(altrePartiteTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <tbody>
              ${altrePartiteRows}
            </tbody>
          </table>
        </div>`
            : ""
        }
        <div class="box box-gas">
  <div class="section-title">
    <span>TOTALE IMPONIBILE</span>
    <span>${money(r.H24 + r.H29)}</span>
  </div>
  <div class="bar" style="background:${blue}"></div>
</div>

        ${
          acciseIvaTot !== 0
            ? `
        <div class="box box-gas">
          <div class="section-title">
            <span>ACCISE E IVA</span>
            <span>${money(acciseIvaTot)}</span>
          </div>
          <div class="bar" style="background:${blue}"></div>
          <table>
            <tbody>
              ${acciseIvaRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        <div class="total" style="background:${blue}">
          <span>TOTALE PREVENTIVO</span>
          <span>${money(r.H37)}</span>
        </div>

        ${
          isSi(s.confrontoFlag)
            ? `
        <div class="savings">
          <div class="savings-row">
            <span>Risparmio fattura</span>
            <strong>${money(r.risparmioFattura)}</strong>
          </div>
          <div class="savings-row">
            <span>Risparmio annuale</span>
            <strong>${money(r.risparmioAnnuo)}</strong>
          </div>
        </div>`
            : ""
        }
      </div>
    `;

    const cleanName = sanitizeFileName(s.nome || "Cliente");
    printHtmlDocument("Preventivo Gas", html, `${cleanName} - Gas`);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
        Salvataggio temporaneo attivo · reset automatico dopo 15 minuti di inattività
      </div>
      <div
        style={{
          display: isMobile ? "grid" : "flex",
          gridTemplateColumns: isMobile
            ? "repeat(3,minmax(0,1fr))"
            : undefined,
          gap: isMobile ? 6 : 8,
          flexWrap: "nowrap",
          justifyContent: "flex-end",
          width: isMobile ? "100%" : "auto",
        }}
      >
        <button
          type="button"
          onClick={resetGasSimulation}
          style={{
            border: "1px solid #ef4444",
            background: "#fff",
            color: "#b91c1c",
            borderRadius: 10,
            padding: isMobile ? "8px 4px" : "9px 13px",
            fontWeight: 900,
            fontSize: isMobile ? 11 : 13,
            lineHeight: isMobile ? 1.08 : 1.2,
            whiteSpace: isMobile ? "normal" : "nowrap",
            minWidth: 0,
            minHeight: isMobile ? 58 : undefined,
            width: isMobile ? "100%" : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {isMobile ? (
            <>
              NUOVA
              <br />
              SIMULAZIONE
            </>
          ) : (
            "NUOVA SIMULAZIONE"
          )}
        </button>
        <button
          type="button"
          onClick={() => setGasSaveConfirmOpen(true)}
          style={{
            border: "1px solid #16a34a",
            background: "#16a34a",
            color: "white",
            borderRadius: 10,
            padding: isMobile ? "8px 4px" : "9px 13px",
            fontWeight: 900,
            fontSize: isMobile ? 11 : 13,
            lineHeight: isMobile ? 1.08 : 1.2,
            whiteSpace: isMobile ? "normal" : "nowrap",
            minWidth: 0,
            minHeight: isMobile ? 58 : undefined,
            width: isMobile ? "100%" : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {isMobile ? (
            <>
              SALVA
              <br />
              SIMULAZIONE
            </>
          ) : (
            "SALVA SIMULAZIONE"
          )}
        </button>
        <button
          type="button"
          onClick={() => setGasSavedOpen(true)}
          style={{
            border: "1px solid #2563eb",
            background: "#fff",
            color: "#1d4ed8",
            borderRadius: 10,
            padding: isMobile ? "8px 4px" : "9px 13px",
            fontWeight: 900,
            fontSize: isMobile ? 11 : 13,
            lineHeight: isMobile ? 1.08 : 1.2,
            whiteSpace: isMobile ? "normal" : "nowrap",
            minWidth: 0,
            minHeight: isMobile ? 58 : undefined,
            width: isMobile ? "100%" : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {isMobile ? (
            <>
              APRI
              <br />
              SIMULAZIONE
            </>
          ) : (
            "APRI SIMULAZIONE"
          )}
        </button>
      </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sectionCard(
          "dati",
          "Gas",
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {field("Nome", s.nome, (v) => set("nome", v))}
              {field("PDR", s.pdr, (v) => set("pdr", v))}
              {selectField("Uso", s.uso, (v) => set("uso", v), ["DOMESTICO", "BUSINESS"])}
              {field("IVA %", s.iva, (v) => set("iva", v), "number")}
              {selectField("Fatturazione", s.fatturazione, (v) => set("fatturazione", v), gasBilling)}
              {selectField(
                "Offerta",
                s.offerta,
                (v) => set("offerta", v),
                compatibleGasOffers.map((x) => x.nome)
              )}
              {selectField("Accisa agevolata", s.accisaAgevolata, (v) => set("accisaAgevolata", v), ["NO", "SI"])}
              {field("Valore accisa", s.accisaValore, (v) => set("accisaValore", v), "number")}
              {field("Adeguamento parametro", s.adeguamentoParametro, (v) => set("adeguamentoParametro", v), "number")}
            </div>
  
            {isDedicatedOffer(s.offerta) && (
              <>
                <div style={{ height: 12 }} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
                    gap: 12,
                  }}
                >
                  {field(isFixedDedicatedOffer(s.offerta) ? "PREZZO FISSO AD HOC SENZA PERDITE" : "Spread", s.dedicataSpread, (v) => set("dedicataSpread", v), "number")}
                  {field("Quota variabile", s.dedicataQuotaVariabile, (v) => set("dedicataQuotaVariabile", v), "number")}
                  {field("Quota fissa", s.dedicataQuotaFissa, (v) => set("dedicataQuotaFissa", v), "number")}
                </div>
              </>
            )}
          </>
        )}
  
        {sectionCard(
          "mesi",
          "Mesi e consumi",
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto auto",
                alignItems: "stretch",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ minWidth: 0 }} />
  
              <div style={boxStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Prezzo medio</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{prezzoMedioGasScheda}</div>
              </div>
  
              <div style={boxStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo annuo</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {r.consumoTotale > 0
                    ? `${consumoAnnuoGas.toLocaleString("it-IT", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })} Smc`
                    : "-"}
                </div>
              </div>
  
              <div style={boxStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo totale fattura</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {r.consumoTotale > 0
                    ? `${r.consumoTotale.toLocaleString("it-IT", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })} Smc`
                    : "-"}
                </div>
              </div>
            </div>
  
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 12,
              }}
            >
              <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    gap: 16,
  }}
>
  <div
    style={{
      border: "1px solid #cbd5e1",
      borderRadius: 10,
      padding: 12,
      background: "#ffffff",
      background: "#eef6ff",   // azzurro chiaro
border: "1px solid #bfd8f6",
      display: "grid",
      gap: 12,
    }}
  >
    {selectField("Mese 1", s.periodo1, (v) => set("periodo1", v), ["", ...gasMonthOptions])}
    {field("Consumo 1", s.consumo1, (v) => set("consumo1", v), "number")}
  </div>

  <div
    style={{
      border: "1px solid #cbd5e1",
      borderRadius: 10,
      padding: 12,
      background: "#ffffff",
      background: "#eef6ff",   // azzurro chiaro
border: "1px solid #bfd8f6",
      display: "grid",
      gap: 12,
    }}
  >
    {selectField("Mese 2", s.periodo2, (v) => set("periodo2", v), ["", ...gasSecondaryMonthOptions])}
    {field("Consumo 2", s.consumo2, (v) => set("consumo2", v), "number")}
  </div>

  <div
    style={{
      border: "1px solid #cbd5e1",
      borderRadius: 10,
      padding: 12,
      background: "#ffffff",
      background: "#eef6ff",   // azzurro chiaro
border: "1px solid #bfd8f6",
      display: "grid",
      gap: 12,
    }}
  >
    {selectField("Mese 3", s.periodo3, (v) => set("periodo3", v), ["", ...gasSecondaryMonthOptions])}
    {field("Consumo 3", s.consumo3, (v) => set("consumo3", v), "number")}
  </div>

  <div
    style={{
      border: "1px solid #cbd5e1",
      borderRadius: 10,
      padding: 12,
      background: "#ffffff",
      background: "#eef6ff",   // azzurro chiaro
border: "1px solid #bfd8f6",
      display: "grid",
      gap: 12,
    }}
  >
    {selectField("Mese 4", s.periodo4, (v) => set("periodo4", v), ["", ...gasSecondaryMonthOptions])}
    {field("Consumo 4", s.consumo4, (v) => set("consumo4", v), "number")}
  </div>
</div>
            </div>
          </>
        )}
  
        {sectionCard(
          "rete",
          "Rete e corrispettivi",
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {field("Quota consumi rete", s.quotaVariabileAggiuntiva, (v) => set("quotaVariabileAggiuntiva", v), "number")}
              {field("Quota fissa rete", s.quotaFissaAggiuntiva, (v) => set("quotaFissaAggiuntiva", v), "number")}
            </div>
  
            <div style={{ height: 12 }} />
  
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {toggleAmount(
                "Accise manuali",
                s.overrideAcciseFlag,
                (v) => set("overrideAcciseFlag", v),
                s.overrideAcciseValore,
                (v) => set("overrideAcciseValore", v)
              )}
              {toggleAmount(
                "Confronto fornitore precedente",
                s.confrontoFlag,
                (v) => set("confrontoFlag", v),
                s.confrontoValore,
                (v) => set("confrontoValore", v)
              )}
              {toggleAmount(
                "Bonus sociale",
                s.bonusFlag,
                (v) => set("bonusFlag", v),
                s.bonusValore,
                (v) => set("bonusValore", v)
              )}
              {toggleAmount(
                "Ricalcoli/Sconti",
                s.ricalcoloFlag,
                (v) => set("ricalcoloFlag", v),
                s.ricalcoloValore,
                (v) => set("ricalcoloValore", v)
              )}
            </div>
          </>
        )}
      </div>
  
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sectionCard(
          "anteprima",
          "Anteprima Gas",
          <>
            {gasReferenceRows.length > 0 &&
              previewBox(
                <>
                  {gasReferenceRows.map((item) => (
                    <React.Fragment key={item.label}>
                      {row(item.label, item.value)}
                    </React.Fragment>
                  ))}
                </>,
                "#cbd5e1"
              )}

            {previewBox(
              <>
                {row(isFixedDedicatedOffer(s.offerta) ? "Prezzo fisso ad hoc usato" : "Spread usato", numFormat(r.spreadEff, 3))}
                {row("Quota variabile usata", numFormat(r.quotaVarEff, 3))}
                {row("Quota fissa usata", money(r.quotaFissaEff))}
              </>
            )}
  
            {previewBox(
              <>
                {row(isFixedDedicatedOffer(s.offerta) ? "Prezzo gas fisso" : "PSV+Spread", `${numFormat(r.X55, 3)} €`)}
                {row("Quota variabile offerta", `${numFormat(r.X56, 3)} €`)}
              </>
            )}
  
            {previewBox(
              <>
                {row("Vendita materia + Adeguamento Parametro", money(r.H22), true, 16)}
                {row("Quota consumi rete", money(r.H23))}
                {row("Quota consumi totale", money(r.H24))}
              </>,
              "#bfdbfe"
            )}
  
            {previewBox(
              <>
                {row("Quota fissa vendita", money(r.H27))}
                {row("Quota fissa rete", money(r.H28))}
                {row("Quota fissa totale", money(r.H29))}
              </>
            )}
  
            {previewBox(
              <>
                {row("TOTALE IMPONIBILE", money(r.H24 + r.H29), true, 16)}
              </>,
              "#dbeafe"
            )}
  
            {previewBox(
              <>
                {row("Accise", money(r.H32))}
                {row("IVA", money(r.H33))}
                {row("Totale Imposte", money(r.H34))}
              </>
            )}
  
            {(r.H35 !== 0 || r.H36 !== 0) &&
              previewBox(
                <>
                  {r.H35 !== 0 && row("Ricalcoli/Sconti", money(r.H35))}
                  {r.H36 !== 0 && row("Bonus sociale", `- ${money(r.H36)}`)}
                </>
              )}
  
            {previewBox(<>{row("Totale preventivo", money(r.H37), true, 16)}</>, "#93c5fd")}
  
            {isSi(s.confrontoFlag) &&
              previewBox(
                <>
                  {row("Risparmio fattura", money(r.risparmioFattura))}
                  {row("Risparmio annuo", money(r.risparmioAnnuo))}
                </>
              )}
  
            <button
              onClick={printGasPdf}
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 8,
                background: "#0f172a",
                color: "white",
                border: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Crea PDF Gas
            </button>
          </>
        )}
      </div>

      <SaveSimulationModal
        open={gasSaveConfirmOpen}
        type="gas"
        initialName={s.nome}
        showAgentAssociation={showAgentAssociation}
        onClose={() => setGasSaveConfirmOpen(false)}
        onConfirm={confirmGasSimulationSave}
      />

      <SavedSimulationsModal
        open={gasSavedOpen}
        type="gas"
        title="Simulazioni Gas salvate"
        onClose={() => setGasSavedOpen(false)}
        onOpenSimulation={openSavedGasSimulation}
      />
    </div>
  );
}

function Listini({
  dispCpRows,
  setDispCpRows,
  energyOffers,
  setEnergyOffers,
  gasOffers,
  setGasOffers,
  gasAcciseSettings,
  setGasAcciseSettings,
}: {
  dispCpRows: DispCpRow[];
  setDispCpRows: React.Dispatch<React.SetStateAction<DispCpRow[]>>;
  energyOffers: EnergyOffer[];
  setEnergyOffers: React.Dispatch<React.SetStateAction<EnergyOffer[]>>;
  gasOffers: GasOffer[];
  setGasOffers: React.Dispatch<React.SetStateAction<GasOffer[]>>;
  gasAcciseSettings: GasAcciseSettings;
  setGasAcciseSettings: React.Dispatch<React.SetStateAction<GasAcciseSettings>>;
}) {
  const cloneDispCpRows = (rows: DispCpRow[]) => rows.map((row) => ({ ...row }));
  const cloneEnergyOffers = (rows: EnergyOffer[]) => rows.map((row) => ({ ...row }));
  const cloneGasOffers = (rows: GasOffer[]) => rows.map((row) => ({ ...row }));

  const [draftDispCpRows, setDraftDispCpRows] = useState<DispCpRow[]>(() => cloneDispCpRows(dispCpRows));
  const [draftEnergyOffers, setDraftEnergyOffers] = useState<EnergyOffer[]>(() => cloneEnergyOffers(energyOffers));
  const [draftGasOffers, setDraftGasOffers] = useState<GasOffer[]>(() => cloneGasOffers(gasOffers));
  const [draftGasAcciseSettings, setDraftGasAcciseSettings] = useState<GasAcciseSettings>(() => ({ ...gasAcciseSettings }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingEnergyIndex, setDraggingEnergyIndex] = useState<number | null>(null);
  const [draggingGasIndex, setDraggingGasIndex] = useState<number | null>(null);

  useEffect(() => {
    if (dirty) return;
    setDraftDispCpRows(cloneDispCpRows(dispCpRows));
    setDraftEnergyOffers(cloneEnergyOffers(energyOffers));
    setDraftGasOffers(cloneGasOffers(gasOffers));
    setDraftGasAcciseSettings({ ...gasAcciseSettings });
  }, [dispCpRows, energyOffers, gasOffers, gasAcciseSettings, dirty]);

  const markDirty = () => setDirty(true);

  const reorderEnergyOffer = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setDraftEnergyOffers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    markDirty();
  };

  const reorderGasOffer = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setDraftGasOffers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    markDirty();
  };

  const updateDispCp = (index: number, key: keyof DispCpRow, value: string) => {
    setDraftDispCpRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "mese" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const updateEnergyOffer = (index: number, key: keyof EnergyOffer, value: string) => {
    setDraftEnergyOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const updateEnergyOfferVisibility = (index: number, visibile: boolean) => {
    setDraftEnergyOffers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, visibile } : row))
    );
    markDirty();
  };

  const updateGasOfferVisibility = (index: number, visibile: boolean) => {
    setDraftGasOffers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, visibile } : row))
    );
    markDirty();
  };

  const updateGasOffer = (index: number, key: keyof GasOffer, value: string) => {
    setDraftGasOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const saveListini = async () => {
    setSaving(true);

    const payload = [
      { key: "dispCpRows", value_json: draftDispCpRows },
      { key: "energyOffers", value_json: draftEnergyOffers },
      { key: "gasOffers", value_json: draftGasOffers },
      { key: "gasAcciseSettings", value_json: draftGasAcciseSettings },
    ];

    try {
      await adminUpsertSettings(payload);
    } catch (error) {
      setSaving(false);
      console.error("SAVE LISTINI ERROR:", error);
      alert("Errore nel salvataggio dei listini");
      return;
    }
    setSaving(false);

    setDispCpRows(cloneDispCpRows(draftDispCpRows));
    setEnergyOffers(cloneEnergyOffers(draftEnergyOffers));
    setGasOffers(cloneGasOffers(draftGasOffers));
    setGasAcciseSettings({ ...draftGasAcciseSettings });
    setDirty(false);
    alert("Listini salvati online");
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #e2e8f0",
  };

  const tdStyle: React.CSSProperties = {
    padding: 10,
    borderBottom: "1px solid #f1f5f9",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 6,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {dirty && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>
            Modifiche non salvate
          </span>
        )}
        <button
          type="button"
          onClick={saveListini}
          disabled={saving || !dirty}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: saving || !dirty ? "#cbd5e1" : "#2563eb",
            color: "white",
            fontWeight: 800,
            cursor: saving || !dirty ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Salvataggio..." : "Salva listini"}
        </button>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Dispacciamento + CP Market Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Mese", "Dispacciam", "CP Market", "Tot"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftDispCpRows.map((row, i) => {
                const tot = n(row.dispacciamento) + n(row.cpMarket);
                return (
                  <tr key={row.mese}>
                    <td style={tdStyle}>{row.mese}</td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={inputStyle}
                        value={row.dispacciamento}
                        onChange={(e) => updateDispCp(i, "dispacciamento", e.target.value)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={inputStyle}
                        value={row.cpMarket}
                        onChange={(e) => updateDispCp(i, "cpMarket", e.target.value)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={{ ...inputStyle, background: "#f8fafc" }}
                        value={tot}
                        readOnly
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ marginTop: 0 }}>Accise gas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Accisa agevolata</div>
              <input
                type="number"
                step="0.000001"
                style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
                value={draftGasAcciseSettings.agevolata}
                onChange={(e) => {
                  setDraftGasAcciseSettings((prev) => ({ ...prev, agevolata: n(e.target.value) }));
                  markDirty();
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Accisa non agevolata</div>
              <input
                type="number"
                step="0.000001"
                style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
                value={draftGasAcciseSettings.nonAgevolata}
                onChange={(e) => {
                  setDraftGasAcciseSettings((prev) => ({ ...prev, nonAgevolata: n(e.target.value) }));
                  markDirty();
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Offerte Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Ordina", "Visibile", "Nome offerta", "Spread", "Maggiorazione Capacity Market", "Quota fissa"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftEnergyOffers.map((row, i) => (
                <tr
                  key={row.nome + i}
                  onDragOver={(e) => {
                    if (draggingEnergyIndex !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingEnergyIndex === null) return;
                    reorderEnergyOffer(draggingEnergyIndex, i);
                    setDraggingEnergyIndex(null);
                  }}
                  style={{
                    opacity: draggingEnergyIndex === i ? 0.55 : 1,
                  }}
                >
                  <td style={{ ...tdStyle, textAlign: "center", width: 64 }}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDraggingEnergyIndex(i);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragEnd={() => setDraggingEnergyIndex(null)}
                      title="Tieni premuto e trascina per spostare il listino"
                      aria-label={"Sposta il listino " + row.nome}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        fontSize: 20,
                        lineHeight: 1,
                        fontWeight: 900,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                    >
                      ☰
                    </button>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.visibile !== false}
                      onChange={(e) => updateEnergyOfferVisibility(i, e.target.checked)}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                      aria-label={"Mostra " + row.nome + " nei menu Offerta Energia"}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: 180 }}
                      value={row.nome}
                      onChange={(e) => updateEnergyOffer(i, "nome", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.spread}
                      onChange={(e) => updateEnergyOffer(i, "spread", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 120 }}
                      value={row.maggiorazioneCapacityMarket}
                      onChange={(e) => updateEnergyOffer(i, "maggiorazioneCapacityMarket", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.canone}
                      onChange={(e) => updateEnergyOffer(i, "canone", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Offerte Gas</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Ordina", "Visibile", "Nome offerta", "Spread", "Quota variabile", "Quota fissa"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftGasOffers.map((row, i) => (
                <tr
                  key={row.nome + i}
                  onDragOver={(e) => {
                    if (draggingGasIndex !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingGasIndex === null) return;
                    reorderGasOffer(draggingGasIndex, i);
                    setDraggingGasIndex(null);
                  }}
                  style={{
                    opacity: draggingGasIndex === i ? 0.55 : 1,
                  }}
                >
                  <td style={{ ...tdStyle, textAlign: "center", width: 64 }}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDraggingGasIndex(i);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragEnd={() => setDraggingGasIndex(null)}
                      title="Tieni premuto e trascina per spostare il listino"
                      aria-label={"Sposta il listino " + row.nome}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        fontSize: 20,
                        lineHeight: 1,
                        fontWeight: 900,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                    >
                      ☰
                    </button>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.visibile !== false}
                      onChange={(e) => updateGasOfferVisibility(i, e.target.checked)}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                      aria-label={"Mostra " + row.nome + " nei menu Offerta Gas"}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: 180 }}
                      value={row.nome}
                      onChange={(e) => updateGasOffer(i, "nome", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.spread}
                      onChange={(e) => updateGasOffer(i, "spread", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 120 }}
                      value={row.quotaVariabile}
                      onChange={(e) => updateGasOffer(i, "quotaVariabile", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.canone}
                      onChange={(e) => updateGasOffer(i, "canone", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AgentsAdmin({
  adminProfile,
}: {
  adminProfile: AdminProfile | null;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedOwnerAdminId, setSelectedOwnerAdminId] = useState<number | "">("");

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editOwnerAdminId, setEditOwnerAdminId] = useState<number | "">("");
  const [ownerFilter,setOwnerFilter] = useState("ALL");

  const loadAdmins = async () => {
    if (adminProfile?.role !== "super_admin") return;

    try {
      const data = await adminListUsers();
      setAdmins((data as AdminProfile[]) || []);
    } catch (error) {
      console.error("LOAD ADMINS ERROR:", error);
      setAdmins([]);
    }
  };

  const loadAgents = async () => {
    setLoading(true);

    let query = supabase
      .from("agents")
      .select("*")
      .order("nome", { ascending: true });

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("LOAD AGENTS ERROR:", error);
      setAgents([]);
    } else {
      setAgents((data as Agent[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAgents();
    loadAdmins();

    if (adminProfile?.role === "super_admin") {
      setSelectedOwnerAdminId(adminProfile?.id || "");
    } else {
      setSelectedOwnerAdminId("");
    }
  }, [adminProfile?.id, adminProfile?.role]);

  const getOwnerAdminLabel = (ownerAdminId?: number) => {
    if (!ownerAdminId) return "-";
    const found = admins.find((a) => a.id === ownerAdminId);
    if (!found) return `ID ${ownerAdminId}`;
    return `${found.nome || found.username} (${found.username})`;
  };
  const filteredAgents =
  ownerFilter === "ALL"
    ? agents
    : ownerFilter === "MINE"
    ? agents.filter(a => a.owner_admin_id === adminProfile?.id)
    : agents.filter(
        a => String(a.owner_admin_id) === ownerFilter
      );

  const saveAgent = async () => {
    if (!nome.trim() || !cognome.trim() || !username.trim() || !password.trim()) {
      alert("Inserisci nome, cognome, username e password");
      return;
    }

    if (!adminProfile?.id) {
      alert("Sessione admin non valida");
      return;
    }

    let ownerAdminIdToSave: number | undefined;

    if (adminProfile.role === "super_admin") {
      if (!selectedOwnerAdminId) {
        alert("Seleziona l'admin proprietario dell'agente");
        return;
      }
      ownerAdminIdToSave = Number(selectedOwnerAdminId);
    } else {
      ownerAdminIdToSave = adminProfile.id;
    }

    setSaving(true);

    const { error } = await supabase.from("agents").insert([
      {
        nome: nome.trim(),
        cognome: cognome.trim(),
        username: username.trim(),
        password: password.trim(),
        owner_admin_id: ownerAdminIdToSave,
      },
    ]);

    setSaving(false);

    if (error) {
      console.error("SAVE AGENT ERROR:", error);
      alert("Errore salvataggio agente: " + (error.message || JSON.stringify(error)));
      return;
    }

    alert("Agente salvato");
    setNome("");
    setCognome("");
    setUsername("");
    setPassword("");

    if (adminProfile.role === "super_admin") {
      setSelectedOwnerAdminId(adminProfile?.id || "");
    }

    await loadAgents();
  };

  const deleteAgent = async (agentId?: number) => {
    if (!agentId) return;

    const ok = window.confirm("Vuoi eliminare questo agente?");
    if (!ok) return;

    let query = supabase.from("agents").delete().eq("id", agentId);

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    }

    const { error } = await query;

    if (error) {
      alert("Errore eliminazione agente: " + error.message);
      return;
    }

    await loadAgents();
  };

  const updateAgent = async () => {
    if (!editingAgent?.id) return;
  
    if (!editUsername.trim() || !editPassword.trim()) {
      alert("Inserisci username e password");
      return;
    }
  
    const updatePayload: any = {
      username: editUsername.trim(),
      password: editPassword.trim(),
    };
  
    if (adminProfile?.role === "super_admin") {
      if (!editOwnerAdminId) {
        alert("Seleziona l'admin proprietario");
        return;
      }
  
      updatePayload.owner_admin_id = Number(editOwnerAdminId);
    }
  
    let query = supabase
      .from("agents")
      .update(updatePayload)
      .eq("id", editingAgent.id);
  
    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    }
  
    const { error } = await query;
  
    if (error) {
      alert("Errore modifica: " + error.message);
      return;
    }
  
    alert("Agente aggiornato");
  
    setEditingAgent(null);
    setEditUsername("");
    setEditPassword("");
    setEditOwnerAdminId("");
  
    await loadAgents();
  };
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Agent Admin</h2>
  
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2,minmax(0,1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Nome
            </div>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxSizing: "border-box",
              }}
            />
          </div>
  
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Cognome
            </div>
            <input
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxSizing: "border-box",
              }}
            />
          </div>
  
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Username
            </div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxSizing: "border-box",
              }}
            />
          </div>
  
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Password
            </div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxSizing: "border-box",
              }}
            />
          </div>
  
          {adminProfile?.role === "super_admin" && (
            <div style={{ gridColumn: "1 / span 2" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Admin proprietario
              </div>
              <select
                value={selectedOwnerAdminId}
                onChange={(e) =>
                  setSelectedOwnerAdminId(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  background: "white",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Seleziona admin</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.nome || a.username) + " (" + a.username + ")"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
  
        <div style={{ height: 12 }} />
  
        <button
          type="button"
          onClick={saveAgent}
          disabled={saving}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#0f172a",
            color: "white",
            cursor: "pointer",
          }}
        >
          {saving ? "Salvataggio..." : "Salva agente"}
        </button>
      </div>
  
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Elenco agenti</h2>
        <div style={{ marginBottom:16 }}>
  <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>
    Filtro agenti
  </div>

  <select
    value={ownerFilter}
    onChange={(e)=>setOwnerFilter(e.target.value)}
    style={{
      padding:8,
      borderRadius:8,
      border:"1px solid #cbd5e1",
      background:"white"
    }}
  >
    <option value="ALL">Tutti gli agenti</option>
    <option value="MINE">Solo miei agenti</option>

    {admins.map((a)=>(
      <option key={a.id} value={String(a.id)}>
        {a.nome || a.username}
      </option>
    ))}
  </select>
</div>
  
        {loading ? (
          <div>Caricamento...</div>
        ) : (
          <div className="ge-table-shell">
            <table className="ge-list-table">
              <thead>
                <tr>
                  {[
                    "Nome",
                    "Cognome",
                    "Username",
                    "Password",
                    ...(adminProfile?.role === "super_admin" ? ["Admin"] : []),
                    "Azioni",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
              {filteredAgents.map((a, i) => (
                  <tr key={a.id || i}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.nome?.toUpperCase()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.cognome?.toUpperCase()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.username}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.password}
                    </td>
  
                    {adminProfile?.role === "super_admin" && (
  <td
    style={{
      padding: 8,
      borderBottom: "1px solid #f1f5f9",
      fontWeight: 700,
background:
  a.owner_admin_id === adminProfile?.id
    ? "#f0fdf4"
    : "#eff6ff",
borderRadius:8,
    }}
  >
    {getOwnerAdminLabel(a.owner_admin_id as number)}
  </td>
)}
  
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAgent(a);
                            setEditUsername(a.username || "");
                            setEditPassword(a.password || "");
                            setEditOwnerAdminId(a.owner_admin_id || "");
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #2563eb",
                            background: "white",
                            color: "#2563eb",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                          title="Modifica agente"
                        >
                          Modifica
                        </button>
  
                        <button
                          type="button"
                          onClick={() => deleteAgent(a.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #dc2626",
                            background: "white",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                          title="Elimina agente"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  
      {editingAgent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 14,
              width: 420,
              maxWidth: "calc(100vw - 32px)",
              boxSizing: "border-box",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>
              Modifica credenziali agente
            </h3>
  
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Username
              </div>
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
  
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Password
              </div>
              <input
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
  
            {adminProfile?.role === "super_admin" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Admin proprietario
                </div>
                <select
                  value={editOwnerAdminId}
                  onChange={(e) =>
                    setEditOwnerAdminId(e.target.value ? Number(e.target.value) : "")
                  }
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    background: "white",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">Seleziona admin</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.nome || a.username) + " (" + a.username + ")"}
                    </option>
                  ))}
                </select>
              </div>
            )}
  
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setEditingAgent(null);
                  setEditUsername("");
                  setEditPassword("");
                  setEditOwnerAdminId("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #94a3b8",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
  
              <button
                type="button"
                onClick={updateAgent}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0f172a",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function LoginView({
  setSession,
  setAdminProfile,
  setAgentSession,
  onLoginSuccess,
}: {
  setSession: React.Dispatch<React.SetStateAction<any>>;
  setAdminProfile: React.Dispatch<React.SetStateAction<AdminProfile | null>>;
  setAgentSession: React.Dispatch<React.SetStateAction<any>>;
  onLoginSuccess: () => void;
}) {
  const [mode, setMode] = useState<"agent" | "admin">("agent");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const user = username.trim().toLowerCase();
      const pass = password.trim();

      if (!user || !pass) {
        setErrorMsg("Inserisci username e password");
        setLoading(false);
        return;
      }

      if (mode === "admin") {
        const data = await adminLogin(user, pass);

        if (!data) {
          setErrorMsg("Credenziali admin non valide");
          setLoading(false);
          return;
        }

        setSession(data);
        setAdminProfile(data);
        setAgentSession(null);
        onLoginSuccess();
      } else {
        const { data, error } = await supabase
          .from("agents")
          .select("*")
          .ilike("username", user)
          .eq("password", pass)
          .maybeSingle();

        if (error || !data) {
          setErrorMsg("Credenziali agente non valide");
          setLoading(false);
          return;
        }

        localStorage.setItem("agent_session", JSON.stringify(data));
        setAgentSession(data);
        setSession(null);
        setAdminProfile(null);
        localStorage.setItem("agent_session", JSON.stringify(data));
        onLoginSuccess();
      }
    } catch (err) {
      setErrorMsg("Errore durante il login");
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginTop: 40,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0 }}>
          {mode === "admin" ? "Accesso Admin" : "Accesso Agente"}
        </h2>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setMode("agent");
              setErrorMsg("");
            }}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: mode === "agent" ? "1px solid #0f172a" : "1px solid #cbd5e1",
              background: mode === "agent" ? "#0f172a" : "white",
              color: mode === "agent" ? "white" : "#0f172a",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Agente
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("admin");
              setErrorMsg("");
            }}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: mode === "admin" ? "1px solid #0f172a" : "1px solid #cbd5e1",
              background: mode === "admin" ? "#0f172a" : "white",
              color: mode === "admin" ? "white" : "#0f172a",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Admin
          </button>
        </div>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
          }}
        />

        {errorMsg && (
          <div style={{ color: "red", fontSize: 13 }}>{errorMsg}</div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            marginTop: 6,
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: "#0f172a",
            color: "white",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {loading ? "Accesso..." : "Entra"}
        </button>
      </div>
    </div>
  );
}

function ReportAgent({ agentSession }: { agentSession: any }) {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    report_date: "",
    agent_id: agentSession?.id || 0,
    contracts_energia: "",
    consumi_energia: "",
    contracts_gas: "",
    consumi_gas: "",
    notes: "",
  });

  const loadReportsByAgent = async (agentId: number) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("agent_id", agentId)
      .order("report_date", { ascending: false });

    if (error) {
      console.error("LOAD REPORTS BY AGENT ERROR:", error);
      setReports([]);
    } else {
      setReports(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (agentSession?.id) {
      setForm((prev: any) => ({ ...prev, agent_id: agentSession.id }));
      loadReportsByAgent(agentSession.id);
    }
  }, [agentSession]);

  const saveReport = async () => {
    if (!agentSession) {
      alert("Non autenticato");
      return;
    }

    if (!form.report_date) {
      alert("Seleziona la data report");
      return;
    }

    setSaving(true);

    const payload = {
      report_date: form.report_date,
      agent_id: agentSession.id,
      owner_admin_id: agentSession.owner_admin_id,
      contracts_energia: Number(form.contracts_energia || 0),
      consumi_energia: Number(form.consumi_energia || 0),
      contracts_gas: Number(form.contracts_gas || 0),
      consumi_gas: Number(form.consumi_gas || 0),
      notes: form.notes || "",
    };

    const { error } = await supabase
      .from("reports")
      .upsert(payload, { onConflict: "agent_id,report_date" });

    setSaving(false);

    if (error) {
      alert("Errore salvataggio report: " + error.message);
      return;
    }

    alert("Report salvato");
    await loadReportsByAgent(agentSession.id || 0);
  };

  const deleteReport = async (reportId: number) => {
    if (!agentSession) return;

    const ok = window.confirm("Vuoi davvero cancellare questo report?");
    if (!ok) return;

    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", reportId)
      .eq("agent_id", agentSession.id);

    if (error) {
      alert("Errore cancellazione report: " + error.message);
      return;
    }

    alert("Report cancellato");
    await loadReportsByAgent(agentSession.id || 0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Report</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <strong>Agente:</strong> {agentSession?.nome} {agentSession?.cognome}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Data report
              </div>
              <input
                type="date"
                value={form.report_date}
                onChange={(e) =>
                  setForm((prev: any) => ({ ...prev, report_date: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Contratti energia
              </div>
              <input
                type="number"
                value={form.contracts_energia}
                onChange={(e) =>
                  setForm((prev: any) => ({
                    ...prev,
                    contracts_energia: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Consumi energia
              </div>
              <input
                type="number"
                value={form.consumi_energia}
                onChange={(e) =>
                  setForm((prev: any) => ({
                    ...prev,
                    consumi_energia: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Contratti gas
              </div>
              <input
                type="number"
                value={form.contracts_gas}
                onChange={(e) =>
                  setForm((prev: any) => ({
                    ...prev,
                    contracts_gas: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Consumi gas
              </div>
              <input
                type="number"
                value={form.consumi_gas}
                onChange={(e) =>
                  setForm((prev: any) => ({
                    ...prev,
                    consumi_gas: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Note
              </div>
              <input
                type="text"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev: any) => ({ ...prev, notes: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={saveReport}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "#0f172a",
                color: "white",
                cursor: "pointer",
              }}
            >
              {saving ? "Salvataggio..." : "Salva report"}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>I miei report</h2>

        {loading ? (
          <div>Caricamento...</div>
        ) : reports.length === 0 ? (
          <div>Nessun report</div>
        ) : (
          <div className="ge-table-shell">
            <table className="ge-list-table ge-report-table">
              <thead>
                <tr>
                  {[
                    "Data",
                    "Contratti energia",
                    "Consumi energia",
                    "Contratti gas",
                    "Consumi gas",
                    "Note",
                    "Azioni",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr key={r.id || i}>
                    <td data-label="Data" className="ge-date-cell">
                      {formatReportDate(r.report_date)}
                    </td>
                    <td data-label="Contratti energia" className="ge-number-cell">
                      {r.contracts_energia}
                    </td>
                    <td data-label="Consumi energia" className="ge-number-cell">
                      {numFormat(r.consumi_energia, 2)}
                    </td>
                    <td data-label="Contratti gas" className="ge-number-cell">
                      {r.contracts_gas}
                    </td>
                    <td data-label="Consumi gas" className="ge-number-cell">
                      {numFormat(r.consumi_gas, 2)}
                    </td>
                    <td data-label="Note" className="ge-note-cell">
                      {r.notes || "-"}
                    </td>
                    <td data-label="Azioni" className="ge-action-cell">
                      <button
                        onClick={() => deleteReport(r.id)}
                        className="ge-icon-danger"
                        title="Cancella report"
                        aria-label="Cancella report"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportAdmin({
  adminProfile,
}: {
  adminProfile: AdminProfile | null;
}) {
  const [agents, setAgents] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"ALL" | "PERIODO">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"ALL" | "MINE" | "OTHERS">("ALL");

  const loadAgents = async () => {
    let query = supabase
      .from("agents")
      .select("*")
      .order("nome", { ascending: true });

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    } else {
      if (ownerFilter === "MINE") {
        query = query.eq("owner_admin_id", adminProfile?.id);
      } else if (ownerFilter === "OTHERS") {
        query = query.neq("owner_admin_id", adminProfile?.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("LOAD AGENTS ERROR:", error);
      setAgents([]);
      return;
    }

    setAgents(data || []);
  };

  const loadReports = async (agentId?: number | null) => {
    setLoading(true);

    let query = supabase
      .from("reports")
      .select("*")
      .order("report_date", { ascending: false });

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    } else {
      if (ownerFilter === "MINE") {
        query = query.eq("owner_admin_id", adminProfile?.id);
      } else if (ownerFilter === "OTHERS") {
        query = query.neq("owner_admin_id", adminProfile?.id);
      }
    }

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("LOAD REPORTS ERROR:", error);
      setReports([]);
    } else {
      setReports(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    setSelectedAgentId(null);
    loadAgents();
    loadReports(null);
  }, [ownerFilter, adminProfile?.id, adminProfile?.role]);

  const deleteReportAdmin = async (reportId: number) => {
    const ok = window.confirm("Vuoi davvero cancellare questo report?");
    if (!ok) return;

    let query = supabase.from("reports").delete().eq("id", reportId);

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    } else {
      if (ownerFilter === "MINE") {
        query = query.eq("owner_admin_id", adminProfile?.id);
      } else if (ownerFilter === "OTHERS") {
        query = query.neq("owner_admin_id", adminProfile?.id);
      }
    }

    const { error } = await query;

    if (error) {
      alert("Errore cancellazione report: " + error.message);
      return;
    }

    alert("Report cancellato");
    await loadReports(selectedAgentId);
  };

  const filteredReports =
    mode === "ALL"
      ? reports
      : reports.filter((r) => {
          if (!r.report_date) return false;

          const d = r.report_date;

          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;

          return true;
        });

  const totals = filteredReports.reduce(
    (acc, r) => {
      acc.contracts_energia += Number(r.contracts_energia || 0);
      acc.consumi_energia += Number(r.consumi_energia || 0);
      acc.contracts_gas += Number(r.contracts_gas || 0);
      acc.consumi_gas += Number(r.consumi_gas || 0);
      return acc;
    },
    {
      contracts_energia: 0,
      consumi_energia: 0,
      contracts_gas: 0,
      consumi_gas: 0,
    }
  );

  const getAgentName = (agentId: number) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent
      ? `${agent.nome} ${agent.cognome}`.toUpperCase()
      : `ID ${agentId}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Report Admin</h2>

        {adminProfile?.role === "super_admin" && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Filtro agenti
            </div>
            <select
              value={ownerFilter}
              onChange={(e) =>
                setOwnerFilter(e.target.value as "ALL" | "MINE" | "OTHERS")
              }
              style={{
                padding: 8,
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "white",
              }}
            >
              <option value="ALL">Tutti gli agenti</option>
              <option value="MINE">I miei agenti</option>
              <option value="OTHERS">Agenti degli altri admin</option>
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={async () => {
              setSelectedAgentId(null);
              await loadReports(null);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: selectedAgentId === null ? "#0f172a" : "white",
              color: selectedAgentId === null ? "white" : "#0f172a",
              cursor: "pointer",
            }}
          >
            Tutti
          </button>

          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={async () => {
                setSelectedAgentId(a.id);
                await loadReports(a.id);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: selectedAgentId === a.id ? "#0f172a" : "white",
                color: selectedAgentId === a.id ? "white" : "#0f172a",
                cursor: "pointer",
              }}
            >
              {(a.nome + " " + a.cognome).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Modalità
            </div>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              style={{
                padding: 8,
                borderRadius: 8,
                border: "1px solid #cbd5e1",
              }}
            >
              <option value="ALL">TOTALE</option>
              <option value="PERIODO">PERIODO SCELTO</option>
            </select>
          </div>

          {mode === "PERIODO" && (
            <div style={{ display: "flex", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Da
                </div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  A
                </div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <h3 style={{ marginTop: 0 }}>Riepilogo totali</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 12,
          }}
        >
          {previewBox(
            <>{row("Contratti energia", String(totals.contracts_energia), true)}</>
          )}
          {previewBox(
            <>{row("Consumi energia", numFormat(totals.consumi_energia, 2), true)}</>
          )}
          {previewBox(
            <>{row("Contratti gas", String(totals.contracts_gas), true)}</>
          )}
          {previewBox(
            <>{row("Consumi gas", numFormat(totals.consumi_gas, 2), true)}</>
          )}
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Storico report</h3>

        {loading ? (
          <div>Caricamento...</div>
        ) : reports.length === 0 ? (
          <div>Nessun report</div>
        ) : (
          <div className="ge-table-shell">
            <table className="ge-list-table ge-report-table">
              <thead>
                <tr>
                  {[
                    "Agente",
                    "Data",
                    "Contratti energia",
                    "Consumi energia",
                    "Contratti gas",
                    "Consumi gas",
                    "Note",
                    "Azioni",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((r, i) => (
                  <tr key={r.id || i}>
                    <td data-label="Agente" className="ge-agent-cell">
                      {getAgentName(r.agent_id)?.toUpperCase()}
                    </td>
                    <td data-label="Data" className="ge-date-cell">
                      {formatReportDate(r.report_date)}
                    </td>
                    <td data-label="Contratti energia" className="ge-number-cell">
                      {r.contracts_energia}
                    </td>
                    <td data-label="Consumi energia" className="ge-number-cell">
                      {numFormat(r.consumi_energia, 2)}
                    </td>
                    <td data-label="Contratti gas" className="ge-number-cell">
                      {r.contracts_gas}
                    </td>
                    <td data-label="Consumi gas" className="ge-number-cell">
                      {numFormat(r.consumi_gas, 2)}
                    </td>
                    <td data-label="Note" className="ge-note-cell">
                      {r.notes || "-"}
                    </td>
                    <td data-label="Azioni" className="ge-action-cell">
                      <button
                        type="button"
                        onClick={() => deleteReportAdmin(r.id)}
                        className="ge-icon-danger"
                        title="Cancella report"
                        aria-label="Cancella report"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminUsersManager({
  adminProfile,
}: {
  adminProfile: any;
}) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [newNome, setNewNome] = useState("");
  const [newCognome, setNewCognome] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [editingAdmin, setEditingAdmin] = useState<any>(null);
  const [editAdminNome, setEditAdminNome] = useState("");
  const [editAdminCognome, setEditAdminCognome] = useState("");
  const [editAdminUsername, setEditAdminUsername] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");

  const loadAdmins = async () => {
    if (adminProfile?.role !== "super_admin") return;

    setLoading(true);

    try {
      const data = await adminListUsers();
      setAdmins(data || []);
    } catch (error) {
      console.error("LOAD ADMINS ERROR:", error);
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const createAdmin = async () => {
    if (
      !newNome.trim() ||
      !newCognome.trim() ||
      !newUsername.trim() ||
      !newPassword.trim()
    ) {
      alert("Inserisci nome, cognome, username e password");
      return;
    }

    try {
      await adminCreateUser({
        nome: newNome.trim(),
        cognome: newCognome.trim(),
        username: newUsername.trim(),
        password: newPassword.trim(),
      });
    } catch (error: any) {
      alert("Errore creazione admin: " + (error?.message || error));
      return;
    }

    alert("Admin creato");

    setNewNome("");
    setNewCognome("");
    setNewUsername("");
    setNewPassword("");

    await loadAdmins();
  };

  const updateAdmin = async () => {
    if (!editingAdmin?.id) return;

    if (
      !editAdminNome.trim() ||
      !editAdminCognome.trim() ||
      !editAdminUsername.trim()
    ) {
      alert("Inserisci nome, cognome e username");
      return;
    }

    try {
      await adminUpdateUser({
        id: Number(editingAdmin.id),
        nome: editAdminNome.trim(),
        cognome: editAdminCognome.trim(),
        username: editAdminUsername.trim(),
        password: editAdminPassword.trim() || undefined,
      });
    } catch (error: any) {
      alert("Errore modifica admin: " + (error?.message || error));
      return;
    }

    alert("Admin aggiornato");

    setEditingAdmin(null);
    setEditAdminNome("");
    setEditAdminCognome("");
    setEditAdminUsername("");
    setEditAdminPassword("");

    await loadAdmins();
  };

  const deleteAdmin = async (adminId?: number) => {
    if (!adminId) return;

    const ok = window.confirm("Vuoi eliminare questo admin?");
    if (!ok) return;

    try {
      await adminDeleteUser(adminId);
    } catch (error: any) {
      alert("Errore eliminazione admin: " + (error?.message || error));
      return;
    }

    alert("Admin eliminato");
    await loadAdmins();
  };

  const setFullAccess = async (
    adminId: number,
    fullAccess: boolean
  ) => {
    try {
      await adminSetFullAccess(adminId, fullAccess);
      await loadAdmins();
    } catch (error: any) {
      alert("Errore aggiornamento permessi: " + (error?.message || error));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
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
          <h2 style={{ margin: 0 }}>Admin web app</h2>
          <div style={{ color: "#64748b", fontSize: 14 }}>
            Gestione amministratori della web app
          </div>
        </div>

        <div style={{ height: 16 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 12,
          }}
        >
          <input
            value={newNome}
            onChange={(e) => setNewNome(e.target.value)}
            placeholder="Nome"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          />

          <input
            value={newCognome}
            onChange={(e) => setNewCognome(e.target.value)}
            placeholder="Cognome"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          />

          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Username"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          />

          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ height: 12 }} />

        <button
          type="button"
          onClick={createAdmin}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#0f172a",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Crea admin
        </button>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Elenco admin</h2>

        {loading ? (
          <div>Caricamento...</div>
        ) : admins.length === 0 ? (
          <div>Nessun admin trovato</div>
        ) : (
          <div className="ge-table-shell">
            <table className="ge-list-table">
              <thead>
                <tr>
                  {["Nome", "Cognome", "Username", "Password", "Ruolo", "Tutte le schede", "Azioni"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 8px",
                          borderBottom: "1px solid #e2e8f0",
                          fontSize: 13,
                          color: "#475569",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {a.nome?.toUpperCase() || "-"}
                    </td>

                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {a.cognome?.toUpperCase() || "-"}
                    </td>

                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {a.username}
                    </td>

                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {a.password}
                    </td>

                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background:
                            a.role === "super_admin" ? "#dbeafe" : "#f1f5f9",
                          color:
                            a.role === "super_admin" ? "#1d4ed8" : "#334155",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {a.role}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                        textAlign: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={a.role === "super_admin" || a.full_access !== false}
                        disabled={a.role === "super_admin"}
                        onChange={(event) => void setFullAccess(Number(a.id), event.target.checked)}
                        title={a.role === "super_admin" ? "Il Super Admin ha sempre accesso completo" : "Se disattivato vede le stesse schede degli agenti più Report Admin"}
                        style={{ width: 20, height: 20, cursor: a.role === "super_admin" ? "default" : "pointer" }}
                      />
                    </td>

                    <td
                      style={{
                        padding: "12px 8px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            setEditingAdmin(a);
                            setEditAdminNome(a.nome || "");
                            setEditAdminCognome(a.cognome || "");
                            setEditAdminUsername(a.username || "");
                            setEditAdminPassword("");
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid #2563eb",
                            background: "white",
                            color: "#2563eb",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Modifica
                        </button>

                        <button
                          onClick={() => deleteAdmin(a.id)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid #dc2626",
                            background: "white",
                            color: "#dc2626",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingAdmin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 14,
              width: 440,
              maxWidth: "calc(100vw - 32px)",
              boxSizing: "border-box",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Modifica Admin</h3>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Nome
              </div>
              <input
                value={editAdminNome}
                onChange={(e) => setEditAdminNome(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Cognome
              </div>
              <input
                value={editAdminCognome}
                onChange={(e) => setEditAdminCognome(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Username
              </div>
              <input
                value={editAdminUsername}
                onChange={(e) => setEditAdminUsername(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Password
              </div>
              <input
                type="password"
                value={editAdminPassword}
                onChange={(e) => setEditAdminPassword(e.target.value)}
                placeholder="Lascia vuoto per mantenere la password attuale"
                autoComplete="new-password"
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                onClick={() => {
                  setEditingAdmin(null);
                  setEditAdminNome("");
                  setEditAdminCognome("");
                  setEditAdminUsername("");
                  setEditAdminPassword("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #94a3b8",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>

              <button
                onClick={updateAdmin}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0f172a",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



type DashboardNavigate = (tab: string) => void;

function DashboardCard({
  title,
  description,
  icon,
  className,
  onClick,
  compact = false,
  spanMobile = false,
  notificationCount,
  incomingCount,
  outgoingCount,
}: {
  title: string;
  description: string;
  icon: string;
  className: string;
  onClick: () => void;
  compact?: boolean;
  spanMobile?: boolean;
  notificationCount?: number;
  incomingCount?: number;
  outgoingCount?: number;
}) {
  return (
    <button
      type="button"
      className={[
        "ge-dashboard-card",
        compact ? "ge-dashboard-card--compact" : "",
        spanMobile ? "ge-dashboard-card--span-mobile" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {typeof notificationCount === "number" && (
        <div
          className={[
            "ge-dashboard-card__badge",
            notificationCount > 0
              ? "ge-dashboard-card__badge--active"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`${notificationCount} notifiche da lavorare`}
        >
          {notificationCount}
        </div>
      )}

      {(typeof incomingCount === "number" ||
        typeof outgoingCount === "number") && (
        <div className="ge-waiting-badges">
          <div
            className={[
              "ge-waiting-badge",
              "ge-waiting-badge--incoming",
              Number(incomingCount || 0) > 0
                ? "ge-waiting-badge--has-value"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`${Number(
              incomingCount || 0
            )} attività in entrata`}
            title="IN ENTRATA"
          >
            {Number(incomingCount || 0)}
          </div>
          <div
            className={[
              "ge-waiting-badge",
              "ge-waiting-badge--outgoing",
              Number(outgoingCount || 0) > 0
                ? "ge-waiting-badge--has-value"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`${Number(
              outgoingCount || 0
            )} attività in uscita`}
            title="IN USCITA"
          >
            {Number(outgoingCount || 0)}
          </div>
        </div>
      )}

      <div className="ge-dashboard-card__icon">{icon}</div>
      <div className="ge-dashboard-card__body">
        <div className="ge-dashboard-card__title">{title}</div>
        <div className="ge-dashboard-card__description">
          {description}
        </div>
        <div className="ge-dashboard-card__link">
          Vai alla sezione <span>→</span>
        </div>
      </div>
      <div className="ge-dashboard-card__arrow">›</div>
    </button>
  );
}

function SectionHero({
  title,
  subtitle,
  icon,
  variant,
}: {
  title: string;
  subtitle: string;
  icon: string;
  variant: string;
}) {
  return (
    <div
      className={`ge-section-hero ge-section-hero--${variant}`}
    >
      <div className="ge-section-hero__icon">{icon}</div>
      <div>
        <div className="ge-section-hero__title">{title}</div>
        <div className="ge-section-hero__subtitle">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({
  navigate,
  openEmail,
  openDatabase,
  waitingIncomingCount,
  waitingOutgoingCount,
  fullAccess,
}: {
  navigate: DashboardNavigate;
  openEmail: () => void;
  openDatabase: () => void;
  waitingIncomingCount: number;
  waitingOutgoingCount: number;
  fullAccess: boolean;
}) {
  return (
    <div className="ge-dashboard">
      <div className="ge-dashboard-primary ge-dashboard-primary--admin">
        <DashboardCard title="ENERGIA" description="Simula una fattura di energia elettrica." icon="⚡" className="ge-card-energy" spanMobile onClick={() => navigate("energia")} />
        <DashboardCard title="GAS" description="Simula una fattura di gas metano." icon="🔥" className="ge-card-gas" spanMobile onClick={() => navigate("gas")} />
        <DashboardCard title="PUN" description="Analizza e monitora i dati PUN." icon="📈" className="ge-card-pun" onClick={() => navigate("punpsvPublic")} />
        <DashboardCard title="ATECO" description="Analizza i dati ATECO." icon="🧾" className="ge-card-ateco" onClick={() => navigate("ateco")} />
      </div>
      <div className="ge-dashboard-secondary ge-dashboard-secondary--admin">
        {!fullAccess && <DashboardCard title="REPORT" description="Inserisci e consulta i report personali." icon="▤" className="ge-card-agent-report" compact onClick={() => navigate("report")} />}
        {fullAccess && <>
          <DashboardCard title="CALENDARIO" description="Gestisci il tuo calendario e le attività." icon="📅" className="ge-card-calendar" compact onClick={() => navigate("calendarAdmin")} />
          <DashboardCard title="RECRUITING" description="Gestisci candidati e nuove risorse." icon="●●" className="ge-card-recruiting" compact onClick={() => navigate("recruiting")} />
          <DashboardCard title="APPUNTAMENTI" description="Organizza e monitora gli appuntamenti." icon="✓" className="ge-card-appointments" compact onClick={() => navigate("appointments")} />
          <DashboardCard title="DATI PRODUZIONE" description="Monitora i dati di produzione." icon="🧮" className="ge-card-production" compact onClick={() => navigate("archive")} />
          <DashboardCard title="INVIO EMAIL" description="Invia comunicazioni e allegati." icon="✉" className="ge-card-email" compact onClick={openEmail} />
        </>}
        <DashboardCard title="REPORT AGENTI" description="Consulta i report degli agenti." icon="▤" className="ge-card-agent-report" compact onClick={() => navigate("reportAdmin")} />
        {fullAccess && (
          <DashboardCard
            title="IMPOSTAZIONI E DATABASE"
            description="Apri configurazioni, database e strumenti amministrativi."
            icon="⚙"
            className="ge-card-settings"
            compact
            onClick={openDatabase}
          />
        )}
        {fullAccess && <DashboardCard title="SALA D'ATTESA HR" description="Gestisci nominativi in arrivo e sincronizzazioni HR." icon="⌛" className="ge-card-waiting" compact incomingCount={waitingIncomingCount} outgoingCount={waitingOutgoingCount} onClick={() => navigate("recruitingWaiting")} />}
      </div>
    </div>
  );
}

function AgentDashboard({
  navigate,
}: {
  navigate: DashboardNavigate;
}) {
  return (
    <div className="ge-dashboard ge-dashboard--agent">
      <div className="ge-dashboard-primary ge-dashboard-primary--agent">
        <DashboardCard
          title="ENERGIA"
          description="Simula una fattura di energia elettrica."
          icon="⚡"
          className="ge-card-energy"
          spanMobile
          onClick={() => navigate("energia")}
        />
        <DashboardCard
          title="GAS"
          description="Simula una fattura di gas metano."
          icon="🔥"
          className="ge-card-gas"
          spanMobile
          onClick={() => navigate("gas")}
        />
      </div>

      <div className="ge-dashboard-secondary ge-dashboard-secondary--agent">
        <DashboardCard
          title="PUN"
          description="Analizza i dati del mercato PUN."
          icon="📈"
          className="ge-card-pun"
          compact
          onClick={() => navigate("punpsvPublic")}
        />
        <DashboardCard
          title="ATECO"
          description="Analizza i dati ATECO."
          icon="🧾"
          className="ge-card-ateco"
          compact
          onClick={() => navigate("ateco")}
        />
        <DashboardCard
          title="REPORT"
          description="Accedi ai tuoi report personali e alle tue attività."
          icon="▤"
          className="ge-card-agent-dashboard-report"
          compact
          spanMobile
          onClick={() => navigate("report")}
        />
      </div>
    </div>
  );
}

export default function App() {
  const baseBtn = {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.2s ease",
  };
  
  const activeBtn = {
    background: "#0f172a",
    color: "white",
    border: "1px solid #0f172a",
  };
  const [adminSession, setAdminSession] = useState<AdminProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [agentSession, setAgentSession] = useState<any>(null);
  const [waitingRoomIncomingCount, setWaitingRoomIncomingCount] =
    useState(0);
  const [waitingRoomOutgoingCount, setWaitingRoomOutgoingCount] =
    useState(0);

  const [punPsvRows, setPunPsvRows] = useState<PunPsvRow[]>(INITIAL_PUN_PSV_ROWS);
  const [selectedPunPsvMonth, setSelectedPunPsvMonth] = useState<string>("DICEMBRE 2026");

  const updatePunPsvValue = (
    mese: string,
    field: "mono" | "f1" | "f2" | "f3" | "psv",
    value: string
  ) => {
    const parsed = Number(String(value).replace(",", "."));
  
    setPunPsvRows((prev) =>
      prev.map((row) =>
        row.mese === mese
          ? {
              ...row,
              [field]: Number.isFinite(parsed) ? parsed : 0,
            }
          : row
      )
    );
  };
  
  const [tab, setTab] = useState(() => {
    const requestedTab =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tab")
        : "";

    if (requestedTab === "recruitingWaiting") {
      return "recruitingWaiting";
    }

    return localStorage.getItem("app_tab") || "dashboard";
  });
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const navigateTo = (nextTab: string) => {
    setAdminMenuOpen(false);
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openDatabaseSettings = () => {
    setAdminMenuOpen(false);
    setTab("agents");
    localStorage.setItem("app_tab", "agents");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleAdminMenu = () => {
    setAdminMenuOpen((current) => !current);
  };

  useEffect(() => {
    if (tab === "adminMenu") {
      setTab("dashboard");
      setAdminMenuOpen(false);
    }
  }, [tab]);

  const openOutlookEmail = () => {
    setAdminMenuOpen(false);
    window.dispatchEvent(new CustomEvent("open-outlook-email"));
  };

  useEffect(() => {
    const clearExpiredDrafts = () => {
      clearExpiredSimulationDraft(
        ENERGY_SIMULATION_DRAFT_KEY
      );
      clearExpiredSimulationDraft(
        GAS_SIMULATION_DRAFT_KEY
      );
    };

    clearExpiredDrafts();
    const timer = window.setInterval(
      clearExpiredDrafts,
      30000
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void (async () => {
      const admin = await ensureAdminSession();
      if (admin) {
        setAdminSession(admin);
        setAdminProfile(admin);
      } else {
        setAdminSession(null);
        setAdminProfile(null);
      }

      const agentSaved = localStorage.getItem("agent_session");
      if (agentSaved) {
        try {
          const agent = JSON.parse(agentSaved);
          setAgentSession(agent);
        } catch {
          localStorage.removeItem("agent_session");
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!adminSession || !adminProfile) {
      setWaitingRoomIncomingCount(0);
      setWaitingRoomOutgoingCount(0);
      return;
    }

    let cancelled = false;

    const loadWaitingRoomCount = async () => {
      try {
        const ctx = await getRecruitingContext();

        const [
          incomingResult,
          notesResult,
          statusResult,
        ] = await Promise.all([
          ctx.client
            .from("recruiting_hr_incoming_candidates")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          ctx.client
            .from("recruiting_notes")
            .select("id", { count: "exact", head: true })
            .eq("hr_sync_pending", true),
          ctx.client
            .from("recruiting_hr_status_sync_queue")
            .select("id", { count: "exact", head: true }),
        ]);

        const firstError =
          incomingResult.error ||
          notesResult.error ||
          statusResult.error;

        if (firstError) throw firstError;

        const incomingCount = Number(
          incomingResult.count || 0
        );
        const outgoingCount =
          Number(notesResult.count || 0) +
          Number(statusResult.count || 0);

        if (!cancelled) {
          setWaitingRoomIncomingCount(incomingCount);
          setWaitingRoomOutgoingCount(outgoingCount);
        }
      } catch (error) {
        console.error("WAITING ROOM COUNT ERROR:", error);
      }
    };

    void loadWaitingRoomCount();
    const timer = window.setInterval(
      () => void loadWaitingRoomCount(),
      60000
    );

    const onFocus = () => void loadWaitingRoomCount();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [adminSession, adminProfile]);
  
  const punPsvRef = useRef<HTMLDivElement>(null);
  const punChartRef = useRef<HTMLDivElement>(null);
  const psvChartRef = useRef<HTMLDivElement>(null);
  const punPsvTableRef = useRef<HTMLDivElement>(null);
  const exportPunPsvPdf = async () => {
    if (!punPsvRef.current) return;
  
    try {
      const root = punPsvRef.current;

const punCard = punChartRef.current;
const psvCard = psvChartRef.current;
const tableWrap = punPsvTableRef.current;

if (!punCard || !psvCard || !tableWrap) {
  alert("Blocco PDF non trovato");
  return;
}
  
      
  
      const commonOptions = {
        scale: 1.2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollY: -window.scrollY,
      };
  
      const captureWideCard = async (
        element: HTMLElement,
        widthPx: number,
        svgHeightPx: number
      ) => {
        const clone = element.cloneNode(true) as HTMLElement;
        clone.style.position = "fixed";
        clone.style.left = "-10000px";
        clone.style.top = "0";
        clone.style.width = `${widthPx}px`;
        clone.style.maxWidth = `${widthPx}px`;
        clone.style.display = "block";
        clone.style.background = "#ffffff";
        clone.style.boxSizing = "border-box";
        clone.style.padding = "10px";
        clone.style.margin = "0";
      
        const svg = clone.querySelector("svg") as SVGElement | null;
if (svg) {
  svg.setAttribute("viewBox", "0 0 760 220");
  svg.setAttribute("preserveAspectRatio", "none");
  (svg as unknown as HTMLElement).style.width = "100%";
  (svg as unknown as HTMLElement).style.height = `${svgHeightPx}px`;
  (svg as unknown as HTMLElement).style.display = "block";
}
      
        document.body.appendChild(clone);
        const canvas = await html2canvas(clone, commonOptions);
        document.body.removeChild(clone);
        return canvas;
      };
      const punCanvas = await captureWideCard(punCard, 1200, 280);
      const tableCanvas = await captureWideCard(tableWrap, 1200, 0);
const psvCanvas = await captureWideCard(psvCard, 1200, 280);

  
      const punImg = punCanvas.toDataURL("image/jpeg",1);
      const tableImg = tableCanvas.toDataURL("image/jpeg",1);
      const psvImg = psvCanvas.toDataURL("image/jpeg",1);

  
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
  
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
  
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
  
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("REPORT PUN / PSV TEST", pageWidth / 2, 12, { align: "center" });
      pdf.setDrawColor(210);
      pdf.line(margin, 17, pageWidth - margin, 17);
  
      let y = 21;
  
      const drawBlock = (
        imgData: string,
        canvas: HTMLCanvasElement,
        targetHeight: number
      ) => {
        const ratio = canvas.width / canvas.height;
        let w = usableWidth;
        let h = w / ratio;
  
        if (h > targetHeight) {
          h = targetHeight;
          w = h * ratio;
        }
  
        const x = (pageWidth - w) / 2;
        pdf.addImage(imgData, "JPEG", x, y, w, h);
        y += h + 5;
      };
  
      // PUN grande quasi tutta larghezza
      drawBlock(punImg, punCanvas, 53);
  
      // tabella leggibile
      drawBlock(tableImg, tableCanvas, 175);
  
      // PSV sotto
      drawBlock(psvImg, psvCanvas, 53);
  
      const meseNome = activePunPsvMonth.replace(/\s+/g,"-").toUpperCase();

      pdf.save(`Report-PUN-PSV-${meseNome}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Errore esportazione PDF");
    }
  };
  
  
  
  const [selectedMonthPUN, setSelectedMonthPUN] = useState("");
  const [appliedMonthPUN, setAppliedMonthPUN] = useState("");
  const activePunPsvMonth = appliedMonthPUN || selectedMonthPUN;

  
  const [punPsvView, setPunPsvView] = useState<"both" | "pun" | "psv">("both");
  
  function normalizeMonthLabel(value: string) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }
  
  function getLast12PunPsvRows(rows: any[], selectedMonth: string) {
    const normalizedSelected = normalizeMonthLabel(selectedMonth);
  
    const index = rows.findIndex(
      (r) => normalizeMonthLabel(r.mese) === normalizedSelected
    );
  
    if (index === -1) return [];
  
    return rows.slice(
      Math.max(0, index - 11),
      index + 1
    );
  }
  
  const visiblePunPsvRows =
  getLast12PunPsvRows(
    punPsvRows,
    appliedMonthPUN || selectedMonthPUN
  );
  console.log("selectedMonthPUN:", selectedMonthPUN);
console.log("punPsvRows:", punPsvRows);
console.log("visiblePunPsvRows:", visiblePunPsvRows);
const tablePunPsvRows = getLast12PunPsvRows(
  punPsvRows,
  activePunPsvMonth
).reverse();
  const validMonthOptions = [...punPsvRows]
  .filter((row) => {
    if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS" || row.mese === "FISSO AD HOC") {
      return false;
    }

    return (
      Number(row.mono || 0) !== 0 ||
      Number(row.f1 || 0) !== 0 ||
      Number(row.f2 || 0) !== 0 ||
      Number(row.f3 || 0) !== 0 ||
      Number(row.psv || 0) !== 0
    );
  })
  .sort((a, b) => {
    const mesi = [
      "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
      "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
    ];

    const score = (label: string) => {
      const parts = String(label).trim().split(" ");
      const mese = parts[0]?.toUpperCase() || "";
      const anno = parseInt(parts[1] || "0", 10);
      const meseIndex = mesi.indexOf(mese);
      return anno * 100 + meseIndex;
    };

    return score(b.mese) - score(a.mese);
  });
  const chartPunPsvRows = [...tablePunPsvRows];

const punValues = chartPunPsvRows.map(r => Number(r.mono || 0));
const psvValues = chartPunPsvRows.map(r => Number(r.psv || 0));
const punPolyline = getSvgPoints(punValues, 760, 220);
const psvPolyline = getSvgPoints(psvValues, 760, 220);
const punCoords = getChartCoords(punValues, 760, 220);
const psvCoords = getChartCoords(psvValues, 760, 220);
const monthLabels = chartPunPsvRows.map((row) => {
  const mese = String(row.mese || "").split(" ")[0]?.toUpperCase() || "";

  const shortMap: Record<string, string> = {
    GENNAIO: "Gen",
    FEBBRAIO: "Feb",
    MARZO: "Mar",
    APRILE: "Apr",
    MAGGIO: "Mag",
    GIUGNO: "Giu",
    LUGLIO: "Lug",
    AGOSTO: "Ago",
    SETTEMBRE: "Set",
    OTTOBRE: "Ott",
    NOVEMBRE: "Nov",
    DICEMBRE: "Dic",
  };

  return shortMap[mese] || mese;
});
const latestPun =
tablePunPsvRows.length > 0
 ? Number(tablePunPsvRows[0].mono || 0).toFixed(6)
 : "-";

const latestPsv =
tablePunPsvRows.length > 0
 ? Number(tablePunPsvRows[0].psv || 0).toFixed(6)
 : "-";
       
    function getRowMonthScore(row: any) {
      const mesi = [
        "GENNAIO",
        "FEBBRAIO",
        "MARZO",
        "APRILE",
        "MAGGIO",
        "GIUGNO",
        "LUGLIO",
        "AGOSTO",
        "SETTEMBRE",
        "OTTOBRE",
        "NOVEMBRE",
        "DICEMBRE",
      ];
    
      const anno = Number(row.anno || 0);
      const meseIndex = mesi.indexOf(String(row.mese).toUpperCase());
    
      if (!anno || meseIndex === -1) return -1;
    
      return anno * 100 + meseIndex;
    }
    
    const publicPunPsvOptions = [...punPsvRows]
  .filter((row) => {
    const mese = String(row.mese || "").trim().toUpperCase();

    if (!mese) return false;
    if (mese === "FISSO DOMESTICO" || mese === "FISSO BUSINESS" || mese === "FISSO AD HOC") return false;

    return (
      Number(row.mono || 0) !== 0 ||
      Number(row.f1 || 0) !== 0 ||
      Number(row.f2 || 0) !== 0 ||
      Number(row.f3 || 0) !== 0 ||
      Number(row.psv || 0) !== 0
    );
  })
  .sort((a, b) => {
    const mesi = [
      "GENNAIO",
      "FEBBRAIO",
      "MARZO",
      "APRILE",
      "MAGGIO",
      "GIUGNO",
      "LUGLIO",
      "AGOSTO",
      "SETTEMBRE",
      "OTTOBRE",
      "NOVEMBRE",
      "DICEMBRE",
    ];

    const score = (label: string) => {
      const parts = String(label).trim().split(" ");
      const mese = parts[0]?.toUpperCase() || "";
      const anno = parseInt(parts[1] || "0", 10);
      const meseIndex = mesi.indexOf(mese);

      if (!anno || meseIndex === -1) return -1;

      return anno * 100 + meseIndex;
    };

    return score(String(b.mese)) - score(String(a.mese));
  });

  useEffect(() => {
    if (!appliedMonthPUN && publicPunPsvOptions.length > 0) {
      const defaultMonth = publicPunPsvOptions[0].mese;
      setSelectedMonthPUN(defaultMonth);
      setAppliedMonthPUN(defaultMonth);
    }
  }, [appliedMonthPUN, publicPunPsvOptions]);

useEffect(() => {
}, [tab, validMonthOptions[0]?.mese]);


const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>(INITIAL_MONTHLY);
const [dispCpRows, setDispCpRows] = useState<DispCpRow[]>(INITIAL_DISP_CP_ROWS);
const [energyOffers, setEnergyOffers] = useState<EnergyOffer[]>(INITIAL_ENERGY_OFFERS);

const updateMonthlyRow = (
  index: number,
  field: keyof MonthlyRow,
  value: string
) => {
  setMonthlyRows((prev) =>
    prev.map((row, i) =>
      i === index
        ? {
            ...row,
            [field]:
              field === "mese"
                ? value.toUpperCase()
                : Number(String(value).replace(",", ".")) || 0,
          }
        : row
    )
  );
};
  
  const [gasOffers, setGasOffers] = useState<GasOffer[]>(INITIAL_GAS_OFFERS);
  const [gasAcciseSettings, setGasAcciseSettings] = useState<GasAcciseSettings>({
    agevolata: 0.012498,
    nonAgevolata: 0.18,
  });

  const [session, setSession] = useState<any>(null);
const [loadingSettings, setLoadingSettings] = useState(true);
const [savingSettings, setSavingSettings] = useState(false);

// ✅ STEP 3 QUI
const [selectedYear, setSelectedYear] = useState(() => {
  const currentYear = new Date().getFullYear();
  const availableYears = ANNI.filter((anno) => anno <= currentYear);
  return availableYears.length
    ? Math.max(...availableYears)
    : Math.max(...ANNI);
});

// STEP 4
const fixedRows = monthlyRows.filter(r => r.anno === 0);
const yearRows = monthlyRows.filter(r => r.anno === selectedYear);

useEffect(() => {
  localStorage.setItem("app_tab", tab);
}, [tab]);

useEffect(() => {
  if (!adminSession || !adminProfile) return;
  const fullAccess =
    adminProfile.role === "super_admin" ||
    adminProfile.full_access !== false;
  if (fullAccess) return;

  const allowedTabs = new Set([
    "dashboard",
    "energia",
    "gas",
    "report",
    "punpsvPublic",
    "ateco",
    "reportAdmin",
  ]);

  if (!allowedTabs.has(tab)) {
    setTab("dashboard");
    localStorage.setItem("app_tab", "dashboard");
  }
}, [adminSession, adminProfile?.role, adminProfile?.full_access, tab]);

useEffect(() => {
  if (!adminSession || tab !== "recruitingWaiting") return;

  const url = new URL(window.location.href);
  if (url.searchParams.get("tab") !== "recruitingWaiting") return;

  url.searchParams.delete("tab");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}, [adminSession, tab]);

  const databaseAdminTabs = ["agents", "listini", "punpsvAdmin", "recruitingZones", "recruitingManagement", "recruitingCrm"];

  useEffect(() => {
    if (
      databaseAdminTabs.includes(tab) &&
      adminMenuOpen
    ) {
      setAdminMenuOpen(false);
    }
  }, [tab, adminMenuOpen]);
  const adminTabs = ["dashboard", "calendarAdmin", "reportAdmin", "archive", "recruiting", "recruitingWaiting", "appointments", ...databaseAdminTabs, "adminUsers"];

  const adminSectionMeta: Record<
    string,
    { title: string; subtitle: string; icon: string; variant: string }
  > = {
    calendarAdmin: {
      title: "CALENDARIO",
      subtitle: "Gestisci attività, appuntamenti e sincronizzazioni.",
      icon: "📅",
      variant: "calendar",
    },
    archive: {
      title: "DATI PRODUZIONE",
      subtitle: "Consulta produzione, recessi e copertura territoriale.",
      icon: "🧮",
      variant: "production",
    },
    recruiting: {
      title: "RECRUITING",
      subtitle: "Gestisci contatti, candidati e attività di recruiting.",
      icon: "●●",
      variant: "recruiting",
    },
    recruitingWaiting: {
      title: "SALA D'ATTESA HR",
      subtitle: "Gestisci le attività HR in arrivo e in uscita.",
      icon: "⌛",
      variant: "waiting",
    },
    appointments: {
      title: "APPUNTAMENTI",
      subtitle: "Consulta e riprogramma gli appuntamenti in ordine cronologico.",
      icon: "✓",
      variant: "appointments",
    },
    reportAdmin: {
      title: "REPORT AGENTI",
      subtitle: "Analizza risultati, attività e performance della rete.",
      icon: "▤",
      variant: "agent-report",
    },
    agents: {
      title: "DATABASE",
      subtitle: "Gestisci agenti, utenti e configurazioni amministrative.",
      icon: "⚙",
      variant: "database",
    },
    listini: {
      title: "DATABASE · LISTINI",
      subtitle: "Gestisci listini, offerte e parametri commerciali.",
      icon: "⚙",
      variant: "database",
    },
    punpsvAdmin: {
      title: "DATABASE · PUN / PSV",
      subtitle: "Aggiorna i valori PUN, PSV e i riferimenti di mercato.",
      icon: "⚙",
      variant: "database",
    },
    recruitingZones: {
      title: "AGENTI / ZONE",
      subtitle: "Gestisci macroaree, agenti attivi e zone della mappa Recruiting.",
      icon: "⚙",
      variant: "database",
    },
    recruitingManagement: {
      title: "GESTIONE RECRUITING",
      subtitle: "Configura stati, colori e impostazioni del recruiting.",
      icon: "⚙",
      variant: "database",
    },
    recruitingCrm: {
      title: "GESTIONE CRM",
      subtitle: "Configura e sincronizza il CRM aziendale.",
      icon: "⚙",
      variant: "database",
    },
    adminUsers: {
      title: "DATABASE · ADMIN",
      subtitle: "Gestisci gli amministratori della web app.",
      icon: "⚙",
      variant: "database",
    },
  };

  const currentAdminSection = adminSectionMeta[tab];
  const isAdminTab = adminTabs.includes(tab);
  const isSuperAdmin = true;
  const hasFullAdminAccess =
    adminProfile?.role === "super_admin" ||
    adminProfile?.full_access !== false;

  const thStyle = {
    padding: "12px",
    fontSize: "17px",
    fontWeight: 800,
    textAlign: "center"
  };
  
  const tdStyle = {
    padding: "10px",
    borderBottom: "1px solid #eee",
  };
  
  
  const inputStyle = {
    width: "100%",
    padding: "6px",
    borderRadius: 6,
    border: "1px solid #ccc",
  };
  
  const punPolylinePoints = getSvgPoints(punValues, 760, 220);
const psvPolylinePoints = getSvgPoints(psvValues, 760, 220);

useEffect(() => {
  const loadSettings = async () => {
    setLoadingSettings(true);

    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value_json");

    if (!error && data) {
      const map = Object.fromEntries(
        data.map((row: any) => [row.key, row.value_json])
      );

      if (Array.isArray(map.monthlyRows)) {
        const normalizedSavedRows: MonthlyRow[] = map.monthlyRows.map((row: any) => {
          if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS" || row.mese === "FISSO AD HOC") {
            return {
              mese: row.mese,
              anno: 0,
              mono: Number(row.mono || 0),
              f1: Number(row.f1 || 0),
              f2: Number(row.f2 || 0),
              f3: Number(row.f3 || 0),
              psv: Number(row.psv || 0),
            };
          }
      
          return {
            mese: row.mese,
            anno: Number(row.anno || 2025),
            mono: Number(row.mono || 0),
            f1: Number(row.f1 || 0),
            f2: Number(row.f2 || 0),
            f3: Number(row.f3 || 0),
            psv: Number(row.psv || 0),
          };
        });
      
        const mergedMonthlyRows: MonthlyRow[] = INITIAL_MONTHLY.map((baseRow) => {
          const savedRow = normalizedSavedRows.find(
            (r) => r.mese === baseRow.mese && r.anno === baseRow.anno
          );
      
          return savedRow ? savedRow : baseRow;
        });
      
        setMonthlyRows(mergedMonthlyRows);
      }

      if (Array.isArray(map.dispCpRows)) {
        setDispCpRows(map.dispCpRows);
      }

      if (Array.isArray(map.energyOffers)) {
        const obsoleteEnergyOfferNames = new Set(["CASA", "CASASPECIAL", "CASAUNICA", "CONDOMINI 10", "CONDOMINI 15", "CONDOMINI 5", "IMPRESA", "IMPRESASPECIAL", "IMPRESAUNICA", "SCELTA", "SCELTASPECIAL", "SCELTAUNICA", "SICURABUSINESS", "SICURADOMESTICO", "VALORE", "VALORESPECIAL", "VALOREUNICA"]);
        const savedEnergyOffers = (map.energyOffers as EnergyOffer[])
          .map((offer) => ({ ...offer, visibile: offer.visibile !== false }))
          .map((offer) =>
            ["+FISSO DEDICATA", "FISSO DEDICATA", "+SICURADEDICATA", "SICURADEDICATA", "+SICURA DEDICATA", "SICURA DEDICATA"].includes(offer.nome)
              ? { ...offer, nome: "+SICURA DEDICATA" }
              : offer
          )
          .filter((offer) => !obsoleteEnergyOfferNames.has(offer.nome))
          .filter((offer, index, arr) => arr.findIndex((item) => item.nome === offer.nome) === index);
        const mergedEnergyOffers = [...savedEnergyOffers];
        INITIAL_ENERGY_OFFERS.forEach((baseOffer) => {
          if (!mergedEnergyOffers.some((x) => x.nome === baseOffer.nome)) {
            mergedEnergyOffers.push(baseOffer);
          }
        });
        setEnergyOffers(mergedEnergyOffers);
      }

      if (Array.isArray(map.gasOffers)) {
        const obsoleteGasOfferNames = new Set(["CASA", "CASAUNICA", "CONDOMINI 10", "CONDOMINI 15", "CONDOMINI 5", "IMPRESA", "IMPRESAUNICA", "SCELTA", "SCELTAUNICA", "SICURABUSINESS", "SICURADOMESTICO", "VALORE", "VALOREUNICA"]);
        const savedGasOffers = (map.gasOffers as GasOffer[])
          .map((offer) => ({ ...offer, visibile: offer.visibile !== false }))
          .map((offer) =>
            ["+FISSO DEDICATA", "FISSO DEDICATA", "+SICURADEDICATA", "SICURADEDICATA", "+SICURA DEDICATA", "SICURA DEDICATA"].includes(offer.nome)
              ? { ...offer, nome: "+SICURA DEDICATA" }
              : offer
          )
          .filter((offer) => !obsoleteGasOfferNames.has(offer.nome))
          .filter((offer, index, arr) => arr.findIndex((item) => item.nome === offer.nome) === index);
        const mergedGasOffers = [...savedGasOffers];
        INITIAL_GAS_OFFERS.forEach((baseOffer) => {
          if (!mergedGasOffers.some((x) => x.nome === baseOffer.nome)) {
            mergedGasOffers.push(baseOffer);
          }
        });
        setGasOffers(mergedGasOffers);
      }

      if (map.gasAcciseSettings) {
        setGasAcciseSettings(map.gasAcciseSettings);
      }

      if (Array.isArray(map.punPsvRows)) {
        const savedPunPsvRows = map.punPsvRows as PunPsvRow[];
        const mergedPunPsvRows = INITIAL_PUN_PSV_ROWS.map((baseRow) =>
          savedPunPsvRows.find((row) => row.mese === baseRow.mese) || baseRow
        );
        const extraSavedRows = savedPunPsvRows.filter(
          (row) => !mergedPunPsvRows.some((merged) => merged.mese === row.mese)
        );
        setPunPsvRows([...mergedPunPsvRows, ...extraSavedRows]);
      }
    }

    setLoadingSettings(false);
  };

  loadSettings();
}, []);

const saveSettings = async () => {
  setSavingSettings(true);

  const payload = [
    { key: "monthlyRows", value_json: monthlyRows },
    { key: "dispCpRows", value_json: dispCpRows },
    { key: "energyOffers", value_json: energyOffers },
    { key: "gasOffers", value_json: gasOffers },
    { key: "gasAcciseSettings", value_json: gasAcciseSettings },
    { key: "punPsvRows", value_json: punPsvRows },
    
  ];

  try {
    await adminUpsertSettings(payload);
  } catch (error) {
    setSavingSettings(false);
    console.error("SAVE PUN PSV ERROR:", error);
    alert("Errore nel salvataggio online");
    return;
  }

  setSavingSettings(false);

  alert("Listini salvati online");
};

const renderAdminContent = () => {
  if (!adminSession || !adminProfile) {
    return (
      <LoginView
        setSession={setAdminSession}
        setAdminProfile={setAdminProfile}
        setAgentSession={setAgentSession}
        onLoginSuccess={() => {
          const requestedTab =
            new URLSearchParams(window.location.search).get("tab");
          const nextTab =
            requestedTab === "recruitingWaiting"
              ? "recruitingWaiting"
              : "dashboard";

          setTab(nextTab);
          localStorage.setItem("app_tab", nextTab);
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 12,
        width: "100%",
        minWidth: 0,
      }}
    >
      {adminMenuOpen && !databaseAdminTabs.includes(tab) && (
      <div
        className="ge-admin-nav"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (tab === "dashboard") {
              setAdminMenuOpen(false);
            } else {
              navigateTo("dashboard");
            }
          }}
          style={{
            border: 0,
            background: "transparent",
            padding: 0,
            color: "#0f2d69",
            fontWeight: 900,
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ⚙ Area Admin
          {tab === "dashboard" && adminMenuOpen ? "⌃" : ""}
        </button>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hasFullAdminAccess && (
            <>
              <button onClick={() => setTab("calendarAdmin")} style={{ ...baseBtn, ...(tab === "calendarAdmin" ? activeBtn : {}) }}>CALENDARIO</button>
              <button onClick={() => setTab("archive")} style={{ ...baseBtn, ...(tab === "archive" ? activeBtn : {}) }}>DATI PRODUZIONE</button>
              <button onClick={() => setTab("recruiting")} style={{ ...baseBtn, ...(tab === "recruiting" ? activeBtn : {}) }}>RECRUITING</button>
              <button onClick={() => setTab("appointments")} style={{ ...baseBtn, ...(tab === "appointments" ? activeBtn : {}) }}>APPUNTAMENTI</button>
            </>
          )}
          <button onClick={() => setTab("reportAdmin")} style={{ ...baseBtn, ...(tab === "reportAdmin" ? activeBtn : {}) }}>REPORT ADMIN</button>
          {hasFullAdminAccess && <button onClick={() => setTab("agents")} style={{ ...baseBtn, ...(databaseAdminTabs.includes(tab) ? activeBtn : {}) }}>DATABASE</button>}

{(agentSession || adminSession) && (
  <button
    onClick={() => {
      void adminLogout();
      localStorage.removeItem("agent_session");
      clearAllSimulationDrafts();

      setAdminSession(null);
      setAdminProfile(null);
      setAgentSession(null);

      setTab("energia");
      localStorage.removeItem("app_tab");
    }}
    style={{
      ...baseBtn,
      background: "#ef4444",
      color: "white",
      border: "1px solid #ef4444",
    }}
  >
    ESCI
  </button>
)}
      </div>
      </div>
      )}

      {hasFullAdminAccess && databaseAdminTabs.includes(tab) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 10,
          }}
        >
          <button
            onClick={() => setTab("agents")}
            style={{
              ...baseBtn,
              padding: "9px 14px",
              ...(tab === "agents" ? activeBtn : {}),
            }}
          >
            Agent Admin
          </button>

          {adminProfile?.role === "super_admin" && (
            <button
              onClick={() => setTab("listini")}
              style={{
                ...baseBtn,
                padding: "9px 14px",
                ...(tab === "listini" ? activeBtn : {}),
              }}
            >
              Listini
            </button>
          )}

          {adminProfile?.role === "super_admin" && (
            <button
              onClick={() => setTab("punpsvAdmin")}
              style={{
                ...baseBtn,
                padding: "9px 14px",
                ...(tab === "punpsvAdmin" ? activeBtn : {}),
              }}
            >
              PUN / PSV Admin
            </button>
          )}

          <button
            onClick={() => setTab("recruitingZones")}
            style={{
              ...baseBtn,
              padding: "9px 14px",
              ...(tab === "recruitingZones" ? activeBtn : {}),
            }}
          >
            AGENTI / ZONE
          </button>

          <button
            onClick={() => setTab("recruitingManagement")}
            style={{
              ...baseBtn,
              padding: "9px 14px",
              ...(tab === "recruitingManagement" ? activeBtn : {}),
            }}
          >
            GESTIONE RECRUITING
          </button>

          <button
            onClick={() => setTab("recruitingCrm")}
            style={{
              ...baseBtn,
              padding: "9px 14px",
              ...(tab === "recruitingCrm" ? activeBtn : {}),
            }}
          >
            GESTIONE CRM
          </button>
        </div>
      )}

      {tab !== "dashboard" && currentAdminSection && (
        <SectionHero
          title={currentAdminSection.title}
          subtitle={currentAdminSection.subtitle}
          icon={currentAdminSection.icon}
          variant={currentAdminSection.variant}
        />
      )}

      {tab === "dashboard" && (
        <AdminDashboard
          navigate={navigateTo}
          openEmail={openOutlookEmail}
          waitingIncomingCount={waitingRoomIncomingCount}
          waitingOutgoingCount={waitingRoomOutgoingCount}
          fullAccess={hasFullAdminAccess}
          openDatabase={openDatabaseSettings}
        />
      )}

      {tab === "calendarAdmin" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Recruiting initialSection="calendar" hideNavigation />
        </div>
      )}

      {tab === "appointments" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Appointments />
        </div>
      )}

      {tab === "reportAdmin" && <ReportAdmin adminProfile={adminProfile} />}

      {tab === "archive" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Archive />
        </div>
      )}

      {tab === "recruiting" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Recruiting />
        </div>
      )}

      {tab === "recruitingWaiting" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Recruiting initialSection="hr_notes" />
        </div>
      )}

      {tab === "agents" && (
        <>
          <AgentsAdmin adminProfile={adminProfile} />
          {adminProfile?.role === "super_admin" && (
            <AdminUsersManager adminProfile={adminProfile} />
          )}
        </>
      )}

      {tab === "recruitingZones" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <RecruitingManagement />
        </div>
      )}

      {tab === "recruitingManagement" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <RecruitingManagement />
        </div>
      )}

      {tab === "recruitingCrm" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Recruiting initialSection="crm_management" hideNavigation />
        </div>
      )}

      {tab === "listini" && (
        <Listini
          dispCpRows={dispCpRows}
          setDispCpRows={setDispCpRows}
          energyOffers={energyOffers}
          setEnergyOffers={setEnergyOffers}
          gasOffers={gasOffers}
          setGasOffers={setGasOffers}
          gasAcciseSettings={gasAcciseSettings}
          setGasAcciseSettings={setGasAcciseSettings}
        />
      )}

      {tab === "punpsvAdmin" && (
        
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>PUN / PSV Admin</h2>

          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "white",
              }}
            >
              {ANNI.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
  <button
    type="button"
    onClick={saveSettings}
    disabled={savingSettings}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "none",
      background: "#0f172a",
      color: "white",
      cursor: "pointer",
      fontWeight: 700,
    }}
  >
    {savingSettings ? "Salvataggio..." : "Salva PUN / PSV"}
  </button>
</div>

          <div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={thStyle}>Mese</th>
        <th style={thStyle}>Mono</th>
        <th style={thStyle}>F1</th>
        <th style={thStyle}>F2</th>
        <th style={thStyle}>F3</th>
        <th style={thStyle}>PSV</th>
      </tr>
    </thead>
    <tbody>
      {punPsvRows
        .filter((row) => {
          if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS" || row.mese === "FISSO AD HOC") return true;
          return row.mese.endsWith(String(selectedYear));
        })
        .map((row) => (
          <tr key={row.mese}>
            <td style={tdStyle}>{row.mese}</td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.mono}
                onChange={(e) => updatePunPsvValue(row.mese, "mono", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.f1}
                onChange={(e) => updatePunPsvValue(row.mese, "f1", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.f2}
                onChange={(e) => updatePunPsvValue(row.mese, "f2", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.f3}
                onChange={(e) => updatePunPsvValue(row.mese, "f3", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.psv}
                onChange={(e) => updatePunPsvValue(row.mese, "psv", e.target.value)}
                style={inputStyle}
              />
            </td>
          </tr>
        ))}
    </tbody>
  </table>
</div>
        </div>
      )}
    </div>
  );
};
if (!agentSession && !adminSession) {
  return (
    <LoginView
      setSession={setAdminSession}
      setAdminProfile={setAdminProfile}
      setAgentSession={setAgentSession}
        onLoginSuccess={() => {
          setTab("dashboard");
          localStorage.setItem("app_tab", "dashboard");
        }}
      />
  );
}
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 20 }}>
      <div className="ge-brand-shell">
        <button
          type="button"
          className="ge-brand"
          onClick={() => {
            setAdminMenuOpen(false);
            navigateTo("dashboard");
          }}
          aria-label="Torna alla dashboard"
        >
          <span className="ge-brand__bolt">⚡</span>
          <span>
            <span className="ge-brand__title">GESTIONE ENERGIA</span>
            <span className="ge-brand__subtitle">
              PIÙ ENERGIA AL TUO LAVORO
            </span>
          </span>
        </button>

        {adminProfile?.role === "super_admin" && (
          <button
            type="button"
            className="ge-brand-waiting"
            onClick={() => navigateTo("recruitingWaiting")}
            aria-label={`Apri Sala d'attesa: ${waitingRoomIncomingCount} in entrata, ${waitingRoomOutgoingCount} in uscita`}
            title="Apri Sala d'attesa"
          >
            <span className="ge-brand-waiting__incoming">
              {waitingRoomIncomingCount}
            </span>
            <span className="ge-brand-waiting__outgoing">
              {waitingRoomOutgoingCount}
            </span>
          </button>
        )}
      </div>
  
      <div
  className="ge-main-nav"
  style={{
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  }}
>
  <button
    onClick={() => setTab("energia")}
    style={{
      ...baseBtn,
      ...(tab === "energia" ? activeBtn : {}),
    }}
  >
    Energia
  </button>

  <button
    onClick={() => setTab("gas")}
    style={{
      ...baseBtn,
      ...(tab === "gas" ? activeBtn : {}),
    }}
  >
    Gas
  </button>

  <button
    onClick={() => setTab("report")}
    style={{
      ...baseBtn,
      ...(tab === "report" ? activeBtn : {}),
    }}
  >
    Report
  </button>

  <button
    onClick={() => setTab("punpsvPublic")}
    style={{
      ...baseBtn,
      ...(tab === "punpsvPublic" ? activeBtn : {}),
    }}
  >
    PUN / PSV
  </button>

  <button
    onClick={() => setTab("ateco")}
    style={{
      ...baseBtn,
      ...(tab === "ateco" ? activeBtn : {}),
    }}
  >
    ATECO
  </button>

  {adminSession && (
    <button
      onClick={toggleAdminMenu}
      style={{
        ...baseBtn,
        ...(adminMenuOpen ? activeBtn : {}),
      }}
    >
      Area Admin
    </button>
  )}

  {(agentSession || adminSession) && (
    <button
      onClick={() => {
        localStorage.removeItem("admin_session");
        localStorage.removeItem("agent_session");
        setAdminSession(null);
        setAdminProfile(null);
        setAgentSession(null);
        setTab("energia");
        localStorage.removeItem("app_tab");
      }}
      style={{
        ...baseBtn,
        background: "#ef4444",
        color: "white",
        border: "1px solid #ef4444",
      }}
    >
    ESCI
  </button>
  )}

  {adminSession && hasFullAdminAccess && (
    <button
      type="button"
      title="IMPOSTAZIONI E DATABASE"
      aria-label="Apri Impostazioni e Database"
      onClick={openDatabaseSettings}
      style={{
        ...baseBtn,
        padding: "8px 12px",
        fontSize: 22,
        lineHeight: 1,
        color: "#64748b",
        background: "#e2e8f0",
        border: "1px solid #cbd5e1",
        fontFamily: "Arial, 'Segoe UI Symbol', sans-serif",
        fontWeight: 900,
      }}
    >
      ⚙
    </button>
  )}
</div>
  
{tab === "dashboard" ? (
  adminSession ? (
    renderAdminContent()
  ) : (
    <AgentDashboard navigate={navigateTo} />
  )
) : tab === "energia" ? (
  <>
    <SectionHero
      title="ENERGIA"
      subtitle="Simula una fattura di energia elettrica."
      icon="⚡"
      variant="energy"
    />
    <Energia
      punPsvRows={punPsvRows}
      energyOffers={energyOffers}
      dispCpRows={dispCpRows}
      showAgentAssociation={Boolean(adminSession)}
    />
  </>
) : tab === "gas" ? (
  <>
    <SectionHero
      title="GAS"
      subtitle="Simula una fattura di gas metano."
      icon="🔥"
      variant="gas"
    />
    <Gas
      punPsvRows={punPsvRows}
      gasOffers={gasOffers}
      gasAcciseSettings={gasAcciseSettings}
      showAgentAssociation={Boolean(adminSession)}
    />
  </>
) : tab === "report" ? (
  <>
    <SectionHero
      title="REPORT"
      subtitle="Inserisci e consulta i tuoi report personali."
      icon="▤"
      variant="report"
    />
    <ReportAgent agentSession={agentSession} />
  </>
        ) : tab === "ateco" ? (
          <>
            <SectionHero
              title="ATECO"
              subtitle="Ricerca codici e verifica le principali agevolazioni fiscali."
              icon="🧾"
              variant="ateco"
            />
            <Ateco />
          </>
        ) : tab === "punpsvPublic" ? (
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <SectionHero
              title="PUN / PSV"
              subtitle="Andamento dei principali indici del mercato energetico."
              icon="📈"
              variant="pun"
            />
        
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 24,
                maxWidth: 420,
              }}
            >
              <label
                style={{
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                Mese selezionato
              </label>
        
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <select
  value={selectedMonthPUN}
  onChange={(e)=>{
    setSelectedMonthPUN(e.target.value);
    setAppliedMonthPUN(e.target.value);
  }}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    minWidth: 240,
                  }}
                >
                  {publicPunPsvOptions.map((row) => (
                    <option key={row.mese} value={row.mese}>
                      {row.mese}
                    </option>
                  ))}
                </select>
        
                       
                <button
                  type="button"
                  onClick={exportPunPsvPdf}
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 18px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  PDF
                </button>
              </div>
            </div>
        
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <button
                onClick={() => setPunPsvView("both")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: punPsvView === "both" ? "#0f172a" : "white",
                  color: punPsvView === "both" ? "white" : "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                PUN-PSV
              </button>
        
              <button
                onClick={() => setPunPsvView("pun")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: punPsvView === "pun" ? "#2563eb" : "white",
                  color: punPsvView === "pun" ? "white" : "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                PUN
              </button>
        
              <button
                onClick={() => setPunPsvView("psv")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: punPsvView === "psv" ? "#16a34a" : "white",
                  color: punPsvView === "psv" ? "white" : "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                PSV
              </button>
            </div>
        
            <div
  ref={punPsvRef}
  style={{
    paddingBottom: "200px"
  }}
>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: punPsvView === "both" ? "1fr 1fr" : "1fr",
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                {(punPsvView === "both" || punPsvView === "pun") && (
                  <div
                  ref={punChartRef}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 16,
                    padding: 20,
                  }}
                >
                    <h3 style={{ marginTop: 0 }}>Andamento PUN</h3>
        
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 12,
                        fontWeight: 700,
                      }}
                    >
                      <span>Ultimo:</span>
                      <span>{latestPun}</span>
                    </div>
        
                    <svg viewBox="0 0 760 300" style={{ width:"100%", height:340 }}>
                      {[40, 80, 120, 160].map((y) => (
                        <line
                          key={y}
                          x1="0"
                          x2="760"
                          y1={y}
                          y2={y}
                          stroke="#dbe3ea"
                        />
                      ))}
        
                      <polyline
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={punPolyline}
                      />
        
                      {punCoords.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="8" fill="#f59e0b" />
                      ))}
        
                      {punCoords.map((p, i) => (
                        <text
                        key={"m" + i}
                        x={p.x}
                        y="195"
                        textAnchor="middle"
                        fontSize="15"
                        fill="#64748b"
                        >
                        <>
                          <tspan x={p.x} dy="0">
                            {(monthLabels[i] || "").toUpperCase()}
                          </tspan>
                      
                          <tspan x={p.x} dy="16">
                          {selectedPunPsvMonth.split(" ")[1]}
                          </tspan>
                        </>
                      </text>
                      ))}
        
                      {punCoords.map((p, i) => (
                        <text
                          key={"v" + i}
                          x={p.x}
                          y={p.y - 12}
                          textAnchor="middle"
                          fontSize="13"
                          fill="#111111"
                          fontWeight="700"
                        >
                          {punValues[i].toFixed(3)}
                        </text>
                      ))}
                    </svg>
                  </div>
                )}
        
                {(punPsvView === "both" || punPsvView === "psv") && (
                  <div
                  ref={psvChartRef}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 16,
                    padding: 20,
                  }}
                >
                    <h3 style={{ marginTop: 0 }}>Andamento PSV</h3>
        
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 12,
                        fontWeight: 700,
                      }}
                    >
                      <span>Ultimo:</span>
                      <span>{latestPsv}</span>
                    </div>
        
                    <svg viewBox="0 0 760 220" style={{ width: "100%", height: 240 }}>
                      {[40, 80, 120, 160].map((y) => (
                        <line
                          key={y}
                          x1="0"
                          x2="760"
                          y1={y}
                          y2={y}
                          stroke="#dbe3ea"
                        />
                      ))}
        
                      <polyline
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={psvPolyline}
                      />
        
                      {psvCoords.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="6" fill="#2563eb" />
                      ))}
        
                      {psvCoords.map((p, i) => (
                        <text
                        key={"psv" + i}
                        x={p.x}
                        y="190"
                        textAnchor="middle"
                        fontSize="15"
                        fill="#64748b"
                      >
                        <>
                          <tspan x={p.x} dy="0">
                            {(monthLabels[i] || "").toUpperCase()}
                          </tspan>
                      
                          <tspan x={p.x} dy="16">
                          {selectedPunPsvMonth.split(" ")[1]}
                          </tspan>
                        </>
                      </text>
                      ))}
        
                      {psvCoords.map((p, i) => (
                        <text
                          key={"psv-v" + i}
                          x={p.x}
                          y={p.y - 12}
                          textAnchor="middle"
                          fontSize="13"
                          fill="#111111"
                          fontWeight="700"
                        >
                          {psvValues[i].toFixed(3)}
                        </text>
                      ))}
                    </svg>
                  </div>
                )}
              </div>
</div>


{/* RIQUADRO ULTIMO MESE + TABELLA */}
<div
 ref={punPsvTableRef}
 style={{
   background:"#fff",
   borderRadius:16,
   padding:20,
   width:"100%",
   maxWidth:"100%",
   margin:"0 auto"
 }}
>
 <div
   style={{
      display:"grid",
      gridTemplateColumns:"1.5fr 1fr 1fr",
      gap:18,
      alignItems:"center"
   }}
 >
   <div>
      <div style={{fontSize:12,fontWeight:700,color:"#64748b"}}>
        ULTIMO MESE
      </div>
      <div style={{fontSize:24,fontWeight:800}}>
        {tablePunPsvRows[0]?.mese}
      </div>
   </div>

   <div>
      <div style={{fontSize:12,fontWeight:700,color:"#64748b"}}>
        PUN
      </div>
      <div style={{
        fontSize:24,
        fontWeight:800,
        color:"#d97706"
      }}>
       {Number(tablePunPsvRows[0]?.mono||0).toFixed(6)}
      </div>
   </div>

   <div>
      <div style={{fontSize:12,fontWeight:700,color:"#64748b"}}>
        PSV
      </div>
      <div style={{
         fontSize:24,
         fontWeight:800,
         color:"#2563eb"
      }}>
       {Number(tablePunPsvRows[0]?.psv||0).toFixed(6)}
      </div>
   </div>

 </div>



<div style={{ overflowX:"auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                    background: "white",
                  }}
                >
                  <thead>
                    {punPsvView === "both" && (
                      <tr style={{ background: "#fff7ed" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "14px 16px",
                            width: "38%",
                          }}
                        >
                          Mese
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            width: "20%",
                            color: "#f59e0b",
                          }}
                        >
                          PUN
                        </th>
                        <th
                          style={{
                            width: "18%",
                            padding: 0,
                          }}
                        >
                          <span style={{ visibility: "hidden" }}>spazio</span>
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            width: "28%",
                            color: "#2563eb",
                          }}
                        >
                          PSV
                        </th>
                      </tr>
                    )}
        
                    {punPsvView === "pun" && (
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: "14px 16px" }}>Mese</th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            background: "#ffedd5",
                            color: "#c2410c",
                            fontWeight: 800,
                          }}
                        >
                          Mono
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            background: "#fff7ed",
                            color: "#d97706",
                            fontWeight: 700,
                          }}
                        >
                          F1
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            background: "#fffbeb",
                            color: "#ea580c",
                            fontWeight: 700,
                          }}
                        >
                          F2
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            background: "#fef9c3",
                            color: "#ca8a04",
                            fontWeight: 700,
                          }}
                        >
                          F3
                        </th>
                      </tr>
                    )}
        
                    {punPsvView === "psv" && (
                      <tr style={{ background: "#eff6ff" }}>
                        <th style={{ textAlign: "left", padding: "14px 16px" }}>Mese</th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "14px 16px",
                            color: "#2563eb",
                          }}
                        >
                          PSV
                        </th>
                      </tr>
                    )}
                  </thead>
        
                  <tbody>
                  {tablePunPsvRows.slice(0,12).map((row,index)=>(
                      <tr
                        key={row.mese}
                        style={{
                          background:
                            punPsvView === "pun"
                              ? index % 2 === 0
                                ? "#fffaf0"
                                : "#fff7ed"
                              : punPsvView === "psv"
                              ? index % 2 === 0
                                ? "#f8fbff"
                                : "#eff6ff"
                              : index % 2 === 0
                              ? "white"
                              : "#fcfdff",
                        }}
                      >
                        <td
                          style={{
                            padding: "14px 16px",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {row.mese}
                        </td>
        
                        {punPsvView === "both" && (
                          <>
                            <td
                              style={{
                                textAlign: "right",
                                padding: "14px 16px",
                                borderBottom: "1px solid #e2e8f0",
                                color: "#d97706",
                                fontWeight: 600,
                                width: "16%",
                              }}
                            >
                              {Number(row.mono).toFixed(6)}
                            </td>
        
                            <td
                              style={{
                                width: "18%",
                                padding: 0,
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              <span style={{ visibility: "hidden" }}>spazio</span>
                            </td>
        
                            <td
                              style={{
                                textAlign: "right",
                                padding: "14px 16px",
                                borderBottom: "1px solid #e2e8f0",
                                color: "#2563eb",
                                fontWeight: 600,
                                width: "28%",
                              }}
                            >
                              {Number(row.psv).toFixed(6)}
                            </td>
                          </>
                        )}
        
                        {punPsvView === "pun" && (
                          <>
                            <td
                              style={{
                                textAlign: "right",
                                padding: "14px 16px",
                                borderBottom: "1px solid #e2e8f0",
                                color: "#c2410c",
                                fontWeight: 700,
                                background: "#ffedd5",
                              }}
                            >
                              {Number(row.mono).toFixed(6)}
                            </td>
        
                            <td
                              style={{
                                textAlign: "right",
                                padding: "14px 16px",
                                borderBottom: "1px solid #e2e8f0",
                                color: "#d97706",
                                fontWeight: 600,
                              }}
                            >
                              {Number(row.f1).toFixed(6)}
                            </td>
        
                            <td
                              style={{
                                textAlign: "right",
                                padding: "14px 16px",
                                borderBottom: "1px solid #e2e8f0",
                                color: "#ea580c",
                                fontWeight: 600,
                              }}
                            >
                              {Number(row.f2).toFixed(6)}
                            </td>
        
                            <td
                              style={{
                                textAlign: "right",
                                padding: "14px 16px",
                                borderBottom: "1px solid #e2e8f0",
                                color: "#ca8a04",
                                fontWeight: 600,
                              }}
                            >
                              {Number(row.f3).toFixed(6)}
                            </td>
                          </>
                        )}
        
                        {punPsvView === "psv" && (
                          <td
                            style={{
                              textAlign: "right",
                              padding: "14px 16px",
                              borderBottom: "1px solid #e2e8f0",
                              color: "#2563eb",
                              fontWeight: 600,
                            }}
                          >
                            {Number(row.psv).toFixed(6)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          renderAdminContent()
        )}
</div>
);
}
