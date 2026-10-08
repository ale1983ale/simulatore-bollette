import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import Ateco from "./Ateco";
import Archive from "./Archive";
import { adminCreateUser, adminDeleteUser, adminListUsers, adminLogin, adminLogout, adminSetFullAccess, adminSetDashboardTabs, adminUpdateUser, adminUpsertSettings, ensureAdminSession } from "./adminSecurity";
import {
  agentLogin,
  ensureAgentSession,
  agentLogout,
  adminAgentList,
  adminAgentCreate,
  adminAgentUpdate,
  adminAgentDelete,
  adminAgentSetProvvigioniVisibility,
  getAgentPasswordResetProfile,
  completeAgentPasswordReset,
} from "./agentSecurity";
import Recruiting from "./Recruiting";
import Appointments from "./Appointments";
import RecruitingManagement from "./RecruitingManagement";
import UnifiedAgentManagement from "./UnifiedAgentManagement";
import Provvigioni, { type ProvvigioniPrefill } from "./Provvigioni";
import Personale from "./Personale";
import DriveArchive from "./DriveArchive";
import ReportNotificationPanel from "./ReportNotificationPanel";
import { getRecruitingContext } from "./recruitingClient";
import TariffAuditPanel from "./TariffAuditPanel";
import {
  INITIAL_AUTO_DISP_CP_ROWS,
  dispCapacityRate,
  fetchDispCapacityRows,
  isDomesticEnergyType,
  normalizeDispMonthLabel,
  type DispCapacityMeta,
  type DispCpRow,
} from "./dispCapacity";
import {
  INITIAL_NETWORK_TARIFF_ROWS,
  fetchNetworkTariffRows,
  findNetworkTariff,
  isEDistributionPod,
  isNonEnergivoreDefaultType,
  monthProration,
  type NetworkTariffMeta,
  type NetworkTariffRow,
} from "./networkTariffs";
import {
  GAS_REGIONS,
  INITIAL_GAS_NETWORK_TARIFF_ROWS,
  calculateGasNetworkCharges,
  fetchGasNetworkTariffRows,
  gasRegionToAmbito,
  type GasMeterClass,
  type GasNetworkTariffMeta,
  type GasNetworkTariffRow,
} from "./gasNetworkTariffs";
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

type EnergyCustomerGroup = "DOMESTICI" | "BTA" | "MT";
type ProvvigioniOfferType = "STANDARD" | "UNICA" | "SPECIAL";

type EnergyOffer = {
  nome: string;
  canone: number;
  spread: number;
  maggiorazioneCapacityMarket: number;
  visibile?: boolean;
  allowedCustomerGroups?: EnergyCustomerGroup[];
  provvigioneTipo?: ProvvigioniOfferType;
};

type GasCustomerGroup = "DOMESTICO" | "BUSINESS";

type GasOffer = {
  nome: string;
  canone: number;
  spread: number;
  quotaVariabile: number;
  visibile?: boolean;
  allowedCustomerGroups?: GasCustomerGroup[];
  provvigioneTipo?: ProvvigioniOfferType;
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
  password?: string;
  password_configured?: boolean;
  password_changed_at?: string | null;
  owner_auth_id?: string;
  owner_admin_id?: number;
  provvigioni_visible?: boolean;
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
  dashboard_tabs?: string[] | null;
  password_configured?: boolean;
  password_changed_at?: string | null;
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

const INITIAL_ENERGY_OFFERS: EnergyOffer[] = [
  {
    nome: "DEDICATA",
    canone: 0,
    spread: 0,
    maggiorazioneCapacityMarket: 0,
    visibile: true,
    allowedCustomerGroups: ["DOMESTICI", "BTA", "MT"],
    provvigioneTipo: "SPECIAL",
  },
  {
    nome: "+SICURA DEDICATA",
    canone: 0,
    spread: 0,
    maggiorazioneCapacityMarket: 0,
    visibile: true,
    allowedCustomerGroups: ["DOMESTICI", "BTA", "MT"],
    provvigioneTipo: "SPECIAL",
  },
  {
    nome: "BILANCIATA",
    canone: 18.5,
    spread: 0,
    maggiorazioneCapacityMarket: 0,
    visibile: true,
    allowedCustomerGroups: ["DOMESTICI", "BTA", "MT"],
    provvigioneTipo: "STANDARD",
  },
];

const INITIAL_GAS_OFFERS: GasOffer[] = [
  {
    nome: "DEDICATA",
    canone: 0,
    spread: 0,
    quotaVariabile: 0,
    visibile: true,
    allowedCustomerGroups: ["DOMESTICO", "BUSINESS"],
    provvigioneTipo: "SPECIAL",
  },
  {
    nome: "+SICURA DEDICATA",
    canone: 0,
    spread: 0,
    quotaVariabile: 0,
    visibile: true,
    allowedCustomerGroups: ["DOMESTICO", "BUSINESS"],
    provvigioneTipo: "SPECIAL",
  },
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

function energyTypeOptionLabel(tipo: string) {
  const labels: Record<string, string> = {
    "RESIDENTE": "RESIDENTE · domestico",
    "NON RESIDENTE": "NON RESIDENTE · domestico",
    "RESIDENTE CANONE ESENTE": "RESIDENTE CANONE ESENTE · domestico",
    "BTA1": "BTA1 · ≤ 1,5 kW",
    "BTA2": "BTA2 · > 1,5 fino a 3 kW",
    "BTA3": "BTA3 · > 3 fino a 6 kW",
    "BTA4": "BTA4 · > 6 fino a 10 kW",
    "BTA5": "BTA5 · > 10 kW (pot. disponibile ≤ 16,5 kW)",
    "BTA6": "BTA6 · potenza disponibile > 16,5 kW",
    "MTA1": "MTA1 · potenza disponibile ≤ 100 kW",
    "MTA2": "MTA2 · > 100 fino a 500 kW",
    "MTA3": "MTA3 · potenza disponibile > 500 kW",
  };

  return labels[tipo] || tipo;
}

const ENERGY_CUSTOMER_GROUPS: Array<{
  key: EnergyCustomerGroup;
  label: string;
}> = [
  { key: "DOMESTICI", label: "Domestici" },
  { key: "BTA", label: "BTA1/6" },
  { key: "MT", label: "MT1/3" },
];

const ALL_ENERGY_CUSTOMER_GROUPS: EnergyCustomerGroup[] =
  ENERGY_CUSTOMER_GROUPS.map((item) => item.key);

function energyTypeToGroup(tipo: string): EnergyCustomerGroup | null {
  const value = String(tipo || "").toUpperCase();
  if (
    ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(value)
  ) {
    return "DOMESTICI";
  }
  if (/^BTA[1-6]$/.test(value)) return "BTA";
  if (/^MTA[1-3]$/.test(value)) return "MT";
  return null;
}

function normalizedEnergyOfferGroups(
  offer: EnergyOffer
): EnergyCustomerGroup[] {
  const groups = Array.isArray(offer.allowedCustomerGroups)
    ? offer.allowedCustomerGroups.filter((group) =>
        ALL_ENERGY_CUSTOMER_GROUPS.includes(group)
      )
    : [];

  return groups.length ? groups : ALL_ENERGY_CUSTOMER_GROUPS;
}

function energyOfferAllowsType(offer: EnergyOffer, tipo: string) {
  const group = energyTypeToGroup(tipo);
  if (!group) return true;
  return normalizedEnergyOfferGroups(offer).includes(group);
}

const GAS_CUSTOMER_GROUPS: Array<{
  key: GasCustomerGroup;
  label: string;
}> = [
  { key: "DOMESTICO", label: "Domestico" },
  { key: "BUSINESS", label: "Business" },
];

const ALL_GAS_CUSTOMER_GROUPS: GasCustomerGroup[] = [
  "DOMESTICO",
  "BUSINESS",
];

function normalizedGasOfferGroups(
  offer: GasOffer
): GasCustomerGroup[] {
  const groups = Array.isArray(offer.allowedCustomerGroups)
    ? offer.allowedCustomerGroups.filter((group) =>
        ALL_GAS_CUSTOMER_GROUPS.includes(group)
      )
    : [];

  return groups.length ? groups : ALL_GAS_CUSTOMER_GROUPS;
}

function gasOfferAllowsUse(offer: GasOffer, uso: string) {
  const normalizedUse = String(uso || "").toUpperCase() as GasCustomerGroup;
  if (!ALL_GAS_CUSTOMER_GROUPS.includes(normalizedUse)) return true;
  return normalizedGasOfferGroups(offer).includes(normalizedUse);
}

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

function getProvvigioniOfferType(offer: string): ProvvigioniOfferType {
  const normalized = normalizeOfferName(offer);

  if (normalized.includes("CONDOMIN")) return "STANDARD";
  if (isDedicatedOffer(normalized)) return "SPECIAL";
  if (normalized.includes("SPECIAL")) return "SPECIAL";
  if (normalized.includes("UNICA")) return "UNICA";
  return "STANDARD";
}

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
              padding: "8px 10px",
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
                padding: "8px 10px",
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
                padding: "8px 10px",
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
              padding: "8px 10px",
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
  const [customerFilter, setCustomerFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");

  const agentFilterOptions = useMemo(
    () =>
      uniqueAgentOptions(
        items.map((item) => String(item.agent_name || ""))
      ),
    [items]
  );

  const filteredItems = useMemo(() => {
    const customerNeedle = customerFilter
      .trim()
      .toLocaleLowerCase("it-IT");

    return items.filter((item) => {
      const customerMatches =
        !customerNeedle ||
        String(item.name || "")
          .toLocaleLowerCase("it-IT")
          .includes(customerNeedle);

      const itemAgent = String(item.agent_name || "").trim();
      const agentMatches =
        !agentFilter ||
        (agentFilter === "__NO_AGENT__"
          ? !itemAgent
          : itemAgent.localeCompare(agentFilter, "it", {
              sensitivity: "base",
            }) === 0);

      return customerMatches && agentMatches;
    });
  }, [items, customerFilter, agentFilter]);

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
    setCustomerFilter("");
    setAgentFilter("");
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

        {!loading && !error && items.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 8,
              alignItems: "end",
              marginBottom: 12,
              padding: 10,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              background: "#f8fafc",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: 5,
                fontWeight: 800,
                color: "#334155",
                fontSize: 12,
              }}
            >
              Nome cliente
              <input
                value={customerFilter}
                onChange={(event) =>
                  setCustomerFilter(event.target.value)
                }
                placeholder="Cerca per nome cliente..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #cbd5e1",
                  borderRadius: 9,
                  padding: "8px 10px",
                  background: "white",
                  fontSize: 14,
                }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: 5,
                fontWeight: 800,
                color: "#334155",
                fontSize: 12,
              }}
            >
              Agente associato
              <select
                value={agentFilter}
                onChange={(event) =>
                  setAgentFilter(event.target.value)
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #cbd5e1",
                  borderRadius: 9,
                  padding: "8px 10px",
                  background: "white",
                  fontSize: 14,
                }}
              >
                <option value="">TUTTI GLI AGENTI</option>
                <option value="__NO_AGENT__">SENZA AGENTE</option>
                {agentFilterOptions.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={!customerFilter && !agentFilter}
              onClick={() => {
                setCustomerFilter("");
                setAgentFilter("");
              }}
              style={{
                border: "1px solid #dc2626",
                background: "white",
                color: "#b91c1c",
                borderRadius: 9,
                padding: "8px 11px",
                minHeight: 37,
                fontWeight: 900,
                cursor:
                  !customerFilter && !agentFilter
                    ? "default"
                    : "pointer",
                opacity:
                  !customerFilter && !agentFilter ? 0.45 : 1,
                whiteSpace: "nowrap",
              }}
            >
              AZZERA FILTRI
            </button>

            <div
              style={{
                gridColumn: "1 / -1",
                fontSize: 11,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              Visualizzate {filteredItems.length} di {items.length} simulazioni
            </div>
          </div>
        )}

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
        ) : filteredItems.length === 0 ? (
          <div
            style={{
              padding: 22,
              color: "#64748b",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            Nessuna simulazione corrisponde ai filtri selezionati.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filteredItems.map((item) => (
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
                  padding: "9px 10px",
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
  const androidFiles = (window as any).AndroidFiles;
  const useNativePdf =
    Boolean(androidFiles && typeof androidFiles.savePdf === "function");

  let renderFrame: HTMLIFrameElement | null = null;
  let win: Window | null = null;

  if (useNativePdf) {
    renderFrame = document.createElement("iframe");
    renderFrame.setAttribute("aria-hidden", "true");
    renderFrame.style.position = "fixed";
    renderFrame.style.left = "-12000px";
    renderFrame.style.top = "0";
    renderFrame.style.width = "700px";
    renderFrame.style.height = "1000px";
    renderFrame.style.border = "0";
    renderFrame.style.opacity = "0";
    renderFrame.style.pointerEvents = "none";
    document.body.appendChild(renderFrame);
    win = renderFrame.contentWindow;
  } else {
    win = window.open("", "_blank", "width=1000,height=900");
  }

  if (!win) {
    renderFrame?.remove();
    return;
  }

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
          .offer-pair {
            grid-column: 1 / -1;
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
  if (!useNativePdf) {
    win.focus();
  }

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

      if (useNativePdf) {
        const reader = new FileReader();

        reader.onloadend = () => {
          try {
            const dataUrl = String(reader.result || "");
            const base64 = dataUrl.includes(",")
              ? dataUrl.slice(dataUrl.indexOf(",") + 1)
              : dataUrl;

            androidFiles.savePdf(
              base64,
              `${finalFileName}.pdf`
            );
          } catch (nativeError) {
            console.error("ANDROID PDF SAVE ERROR:", nativeError);
          } finally {
            renderFrame?.remove();
          }
        };

        reader.onerror = () => {
          console.error("ANDROID PDF BASE64 ERROR");
          renderFrame?.remove();
        };

        reader.readAsDataURL(blob);
        return;
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

      if (useNativePdf) {
        renderFrame?.remove();
      } else {
        win.print();
      }
    }
  }, 450);
}

function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isDesktopPointer = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 5,
      }}
      onMouseEnter={() => {
        if (isDesktopPointer()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (isDesktopPointer()) setOpen(false);
      }}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label="Apri guida"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isDesktopPointer()) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen((current) => !current);
          }
        }}
        style={{
          width: 17,
          height: 17,
          borderRadius: 999,
          border: "1px solid #94a3b8",
          background: "#f8fafc",
          color: "#475569",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 900,
          lineHeight: 1,
          cursor: "help",
          userSelect: "none",
        }}
      >
        ?
      </span>

      {open && (
        <span
          role="dialog"
          aria-label="Guida campo"
          style={{
            position: "absolute",
            zIndex: 1000,
            top: "calc(100% + 7px)",
            left: 0,
            width: "min(320px, 78vw)",
            padding: 10,
            borderRadius: 9,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 10px 26px rgba(15,23,42,.18)",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.45,
            textAlign: "left",
          }}
        >
          <span style={{ display: "block" }}>{text}</span>
          {!isDesktopPointer() && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }}
              style={{
                marginTop: 9,
                border: 0,
                borderRadius: 7,
                padding: "6px 9px",
                background: "#e2e8f0",
                color: "#0f172a",
                fontSize: 11,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              CHIUDI
            </button>
          )}
        </span>
      )}
    </span>
  );
}

function FieldLabel({
  label,
  helpText,
}: {
  label: string;
  helpText?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 700,
        marginBottom: 4,
      }}
    >
      <span>{label}</span>
      {helpText ? <HelpHint text={helpText} /> : null}
    </div>
  );
}

function field(
  label: string,
  value: string,
  setValue: (v: string) => void,
  type = "text",
  helpText?: string
) {
  const inputType = type === "number" ? "text" : type;

  return (
    <div>
      <FieldLabel label={label} helpText={helpText} />
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
  options: string[],
  optionLabel?: (option: string) => string,
  helpText?: string
) {
  return (
    <div>
      <FieldLabel label={label} helpText={helpText} />

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
            {optionLabel ? optionLabel(o) : (o || "-")}
          </option>
        ))}
      </select>
    </div>
  );
}

function highlightedSelectField(
  label: string,
  value: string,
  setValue: (v: string) => void,
  options: string[],
  optionLabel?: (option: string) => string,
  helpText?: string
) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          fontWeight: 900,
          lineHeight: "18px",
          minHeight: 18,
          marginBottom: 4,
          color: "#b91c1c",
        }}
      >
        <span>{label.toUpperCase()}</span>
        {helpText ? <HelpHint text={helpText} /> : null}
      </div>

      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "100%",
          height: 38,
          padding: "0 8px",
          border: "2px solid #ef4444",
          background: "#fff",
          color: "#0f172a",
          fontWeight: 800,
          borderRadius: 8,
          boxSizing: "border-box",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel ? optionLabel(o) : (o || "-")}
          </option>
        ))}
      </select>
    </div>
  );
}

function offerTypeField(
  value: string,
  setValue: (v: string) => void
) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 12,
          fontWeight: 900,
          lineHeight: "18px",
          minHeight: 18,
          marginBottom: 4,
          color: "#b91c1c",
        }}
      >
        Tipologia offerta
      </div>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "100%",
          height: 38,
          padding: "0 8px",
          border: "2px solid #ef4444",
          background: "#fff",
          color: "#0f172a",
          fontWeight: 800,
          borderRadius: 8,
          boxSizing: "border-box",
          outline: "none",
        }}
      >
        <option value="FISSO">Prezzo fisso</option>
        <option value="VARIABILE">Prezzo variabile</option>
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
  dispCpRows: DispCpRow[],
  networkTariffRows: NetworkTariffRow[]
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

  const meseTabella1 = normalizeDispMonthLabel(
    mese1UsaMeseDisp ? d.meseRifTabella1 : d.mese1
  );

  const meseTabella2 = normalizeDispMonthLabel(
    mese2UsaMeseDisp ? d.meseRifTabella2 : d.mese2
  );

  const dispRow1 = dispCpRows.find((x) => x.mese === meseTabella1);
  const dispRow2 = dispCpRows.find((x) => x.mese === meseTabella2);

  const isDomestico = isDomesticEnergyType(d.tipo);
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

  const totDispCp1 = dispCapacityRate(dispRow1, d.tipo);
  const totDispCp2 = dispCapacityRate(dispRow2, d.tipo);

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
  const dispCpQuantity = isDomestico ? consumiTot : consumiTotConPerdite;
  const dispCpTotale =
    dispCpQuantity * n(d.dispacciamentoCapacityMarket) +
    consumiTotConPerdite * cmEff;

  const H22 = H22_base + perditeEnergia + dispCpTotale;
  const H24 = n(d.reattivaImmessa) + n(d.reattivaPrelevata);

  const networkRow1 = findNetworkTariff(
    networkTariffRows,
    d.tipo,
    meseTabella1
  );
  const networkRow2 =
    sLikeBimestrale(d.fatturazione) && d.mese2
      ? findNetworkTariff(networkTariffRows, d.tipo, meseTabella2)
      : undefined;

  const networkAutoAvailable =
    Boolean(networkRow1) &&
    (!sLikeBimestrale(d.fatturazione) || !d.mese2 || Boolean(networkRow2));

  const podCount = Math.max(1, n(d.numeroPod) || 1);
  const potenzaImpegnata = Math.max(0, n(d.potenzaImpegnata));

  const networkRowsForCalculation = [
    networkRow1
      ? { row: networkRow1, consumo: consumiMese1 }
      : null,
    networkRow2
      ? { row: networkRow2, consumo: consumiMese2 }
      : null,
  ].filter(Boolean) as Array<{
    row: NetworkTariffRow;
    consumo: number;
  }>;

  const autoQuotaConsumiRete = networkAutoAvailable
    ? networkRowsForCalculation.reduce(
        (sum, item) => sum + item.consumo * n(item.row.quotaEnergia),
        0
      )
    : 0;

  const autoQuotaFissaRete = networkAutoAvailable
    ? networkRowsForCalculation.reduce(
        (sum, item) =>
          sum +
          podCount *
            n(item.row.quotaFissaAnnua) *
            monthProration(item.row),
        0
      )
    : 0;

  const autoQuotaPotenzaRete = networkAutoAvailable
    ? networkRowsForCalculation.reduce(
        (sum, item) =>
          sum +
          potenzaImpegnata *
            n(item.row.quotaPotenzaAnnua) *
            monthProration(item.row),
        0
      )
    : 0;

  const networkAutoMode = String(d.reteMode || "AUTO") !== "MANUALE";
  const H25 = networkAutoMode
    ? autoQuotaConsumiRete
    : n(d.quotaConsumiRete);
  const H28 = n(d.numeroPod) * quotaFissaEff * mesi;
  const H29 = networkAutoMode
    ? autoQuotaFissaRete
    : n(d.quotaFissaRete);
  const H30 = networkAutoMode
    ? autoQuotaPotenzaRete
    : n(d.quotaPotenzaRete);

  const H35 = isSi(d.acciseManualiFlag) ? n(d.acciseManualiValore) : consumiTot * 0.0125;
  const H38 = isSi(d.ricalcoloFlag) ? n(d.ricalcoloValore) : 0;
  const H39 =
    isDomesticEnergyType(d.tipo) && isSi(d.bonusFlag)
      ? n(d.bonusValore)
      : 0;
  const H40 =
    isDomesticEnergyType(d.tipo) && d.tipo === "RESIDENTE"
      ? 9 * mesi - n(d.canoneRaiGiaPagato)
      : 0;

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
    networkAutoAvailable,
    networkAutoMode,
    autoQuotaConsumiRete,
    autoQuotaFissaRete,
    autoQuotaPotenzaRete,
    networkRow1,
    networkRow2,
    networkMonth1: meseTabella1,
    networkMonth2: meseTabella2,
  };
}

function calcGas(
  d: any,
  punPsvRows: PunPsvRow[],
  gasOffers: GasOffer[],
  gasNetworkTariffRows: GasNetworkTariffRow[]
) {
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

  const gasFixedMode =
    String(d.tipologiaOfferta || "VARIABILE") === "FISSO";

  const fixedGasRow =
    punPsvRows.find(
      (x) =>
        x.mese ===
        (String(d.uso || "").toUpperCase() === "DOMESTICO"
          ? "FISSO DOMESTICO"
          : "FISSO BUSINESS")
    ) || { psv: 0 };

  const periodPrice = (period: string) => {
    if (isFixedDedicatedOffer(d.offerta)) return 0;
    if (gasFixedMode) return n(fixedGasRow.psv);
    return n(
      (punPsvRows.find((x) => x.mese === period) || { psv: 0 }).psv
    );
  };

  const p1 = periodPrice(d.periodo1);
  const p2 = periodPrice(d.periodo2);
  const p3 = periodPrice(d.periodo3);
  const p4 = periodPrice(d.periodo4);

  const consumi = [
    n(d.consumo1),
    n(d.consumo2),
    n(d.consumo3),
    n(d.consumo4),
  ];

  const selectedPeriods = [
    d.periodo1,
    d.periodo2,
    d.periodo3,
    d.periodo4,
  ]
    .slice(0, mesi)
    .map((mese, index) => ({
      mese: String(mese || ""),
      consumo: consumi[index] || 0,
    }));

  const consumoTotale = consumi
    .slice(0, mesi)
    .reduce((sum, value) => sum + value, 0);

  const consumoAnnuoStimato =
    mesi > 0 ? (consumoTotale * 12) / mesi : 0;

  const consumoAnnuoRiferimento =
    n(d.consumoAnnuoRete) > 0
      ? n(d.consumoAnnuoRete)
      : consumoAnnuoStimato;

  const gasNetworkAuto = calculateGasNetworkCharges({
    rows: gasNetworkTariffRows,
    regione: d.regione || "UMBRIA",
    classeContatore: (d.classeContatore || "G4-G6") as GasMeterClass,
    uso: d.uso || "DOMESTICO",
    annualConsumption: consumoAnnuoRiferimento,
    periods: selectedPeriods,
  });

  const X55 =
    p1 * consumi[0] +
    p2 * consumi[1] +
    p3 * consumi[2] +
    p4 * consumi[3] +
    consumoTotale * spreadEff;

  const X56 = consumoTotale * quotaVarEff;
  const X57 = consumoTotale * n(d.adeguamentoParametro);
  const H22 = X55 + X56 + X57;

  const networkAutoMode =
    String(d.reteMode || "AUTO") !== "MANUALE";

  const H23 =
    networkAutoMode && gasNetworkAuto.available
      ? gasNetworkAuto.quotaConsumiRete
      : n(d.quotaVariabileAggiuntiva);

  const H24 = H22 + H23;
  const H27 = quotaFissaEff * mesi;

  const H28 =
    networkAutoMode && gasNetworkAuto.available
      ? gasNetworkAuto.quotaFissaRete
      : n(d.quotaFissaAggiuntiva);

  const H29 = H27 + H28;
  const accisaCoeff = n(d.accisaValore);
  const H32 = isSi(d.overrideAcciseFlag)
    ? n(d.overrideAcciseValore)
    : consumoTotale * accisaCoeff;
  const H35 = isSi(d.ricalcoloFlag) ? n(d.ricalcoloValore) : 0;
  const H33 = ((H24 + H29 + H32 + H35) / 100) * n(d.iva);
  const H34 = H32 + H33;
  const H36 =
    d.uso === "DOMESTICO" && isSi(d.bonusFlag)
      ? n(d.bonusValore)
      : 0;
  const H37 = H24 + H29 + H34 + H35 - H36;
  const risparmioFattura = isSi(d.confrontoFlag)
    ? H37 - n(d.confrontoValore)
    : 0;
  const risparmioAnnuo = isSi(d.confrontoFlag)
    ? (risparmioFattura / mesi) * 12
    : 0;

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
    consumoAnnuoStimato,
    consumoAnnuoRiferimento,
    consumoAnnuoReteManuale: n(d.consumoAnnuoRete) > 0,
    accisaCoeff,
    p1,
    p2,
    p3,
    p4,
    networkAutoMode,
    gasNetworkAuto,
    networkAutoAvailable: gasNetworkAuto.available,
    networkAmbito: gasNetworkAuto.ambito,
    networkPeriods: selectedPeriods,
  };
}

function Energia({
  punPsvRows,
  energyOffers,
  dispCpRows,
  networkTariffRows,
  showAgentAssociation,
  canUseProvvigioni,
  onOpenProvvigioni,
}: {
  punPsvRows: PunPsvRow[];
  energyOffers: EnergyOffer[];
  dispCpRows: DispCpRow[];
  networkTariffRows: NetworkTariffRow[];
  showAgentAssociation: boolean;
  canUseProvvigioni: boolean;
  onOpenProvvigioni: (prefill: ProvvigioniPrefill) => void;
}) {
  const visibleEnergyOffers = energyOffers.filter((offer) => offer.visibile !== false);

  const buildEnergyInitialState = () => ({
    iva: "22",
    nome: "",
    pod: "",
    fatturazione: "MENSILE",
    numeroPod: "1",
    tipo: "BTA2",
    tipologiaOfferta: "VARIABILE",
    offerta:
      visibleEnergyOffers.find((offer) => !isSicuraOffer(offer.nome))?.nome ||
      "",
    mese1: "",
    mese2: "",
    meseRifTabella1: "SETTEMBRE 2026",
    meseRifTabella2: "SETTEMBRE 2026",
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
    reteMode: "AUTO",
    potenzaImpegnata: "",
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
  const [energyCompatibilityDriver, setEnergyCompatibilityDriver] =
    useState<"tipo" | "offerta">("tipo");
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
    const storedState = simulation.state || {};
    const restored = {
      ...buildEnergyInitialState(),
      ...storedState,
      tipologiaOfferta:
        storedState.tipologiaOfferta ||
        (isSicuraOffer(String(storedState.offerta || "")) ||
        isFixedCompetenceMonth(String(storedState.mese1 || ""))
          ? "FISSO"
          : "VARIABILE"),
    };

    setS(restored);
    setLastEnergyInputAt(Date.now());
    setEnergySavedOpen(false);
  };

  const energyFixedMode =
    String(s.tipologiaOfferta || "VARIABILE") === "FISSO";

  const fixedModeEnergyOffers = visibleEnergyOffers.filter(
    (offer) => isSicuraOffer(offer.nome) === energyFixedMode
  );

  const selectedEnergyOffer =
    fixedModeEnergyOffers.find((offer) => offer.nome === s.offerta) ||
    visibleEnergyOffers.find((offer) => offer.nome === s.offerta);

  const compatibleEnergyTypeOptions =
    energyCompatibilityDriver === "offerta" && selectedEnergyOffer
      ? energyTypes.filter((tipo) =>
          energyOfferAllowsType(selectedEnergyOffer, tipo)
        )
      : energyTypes;

  const compatibleEnergyOfferOptions =
    energyCompatibilityDriver === "tipo"
      ? fixedModeEnergyOffers.filter((offer) =>
          energyOfferAllowsType(offer, s.tipo)
        )
      : fixedModeEnergyOffers;

  useEffect(() => {
    const currentOffer = fixedModeEnergyOffers.find(
      (offer) => offer.nome === s.offerta
    );

    if (
      currentOffer &&
      energyOfferAllowsType(currentOffer, s.tipo)
    ) {
      return;
    }

    const nextOffer =
      fixedModeEnergyOffers.find((offer) =>
        energyOfferAllowsType(offer, s.tipo)
      ) || fixedModeEnergyOffers[0];

    if (!nextOffer) {
      setS((prev) => ({ ...prev, offerta: "" }));
      return;
    }

    let nextType = s.tipo;
    if (!energyOfferAllowsType(nextOffer, nextType)) {
      nextType =
        energyTypes.find((tipo) =>
          energyOfferAllowsType(nextOffer, tipo)
        ) || nextType;
    }

    setS((prev) => ({
      ...prev,
      offerta: nextOffer.nome,
      tipo: nextType,
      iva: ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(
        nextType
      )
        ? "10"
        : "22",
    }));
  }, [
    energyOffers,
    s.offerta,
    s.tipo,
    s.tipologiaOfferta,
    energyFixedMode,
  ]);

  useEffect(() => {
    const isFixed =
      String(s.tipologiaOfferta || "VARIABILE") === "FISSO";
    const isDomestic = [
      "RESIDENTE",
      "NON RESIDENTE",
      "RESIDENTE CANONE ESENTE",
    ].includes(s.tipo);

    const variableRows = [...punPsvRows]
      .filter(
        (row) =>
          !isFixedCompetenceMonth(row.mese) &&
          (
            Number(row.mono || 0) !== 0 ||
            Number(row.f1 || 0) !== 0 ||
            Number(row.f2 || 0) !== 0 ||
            Number(row.f3 || 0) !== 0
          )
      )
      .sort(
        (a, b) =>
          getMonthYearSortValue(b.mese) -
          getMonthYearSortValue(a.mese)
      );

    const fixedLabels = [
      isDomestic ? "FISSO DOMESTICO" : "FISSO BUSINESS",
      "FISSO AD HOC",
    ];

    const validMonthOptions = isFixed
      ? fixedLabels
      : variableRows.map((row) => row.mese);

    if (!validMonthOptions.includes(s.mese1)) {
      setS((prev) => ({
        ...prev,
        mese1: validMonthOptions[0] || "",
        mese2: "",
      }));
    }
  }, [
    punPsvRows,
    s.mese1,
    s.tipo,
    s.tipologiaOfferta,
  ]);
  
  
  const dispCpMonthOptions = [...dispCpRows]
    .sort(
      (a, b) =>
        b.anno - a.anno || b.meseNumero - a.meseNumero
    )
    .map((row) => row.mese);

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

  const energyIsDomestic = [
    "RESIDENTE",
    "NON RESIDENTE",
    "RESIDENTE CANONE ESENTE",
  ].includes(s.tipo);

  const energyAllMonthOptions = energyFixedMode
    ? [
        energyIsDomestic
          ? "FISSO DOMESTICO"
          : "FISSO BUSINESS",
        "FISSO AD HOC",
      ]
    : mesiOrdinati
        .map((item) => item.mese)
        .filter((month) => !isFixedCompetenceMonth(month));

  const energySecondaryMonthOptions =
    energyAllMonthOptions;

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
    title: React.ReactNode,
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
    () =>
      calcEnergia(
        s,
        punPsvRows,
        energyOffers,
        dispCpRows,
        networkTariffRows
      ),
    [s, punPsvRows, energyOffers, dispCpRows, networkTariffRows]
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

  const [dispCpAutoMode, setDispCpAutoMode] = useState(true);

  useEffect(() => {
    if (!dispCpAutoMode) return;
    setS((prev) => ({
      ...prev,
      dispacciamentoCapacityMarket: String(r.dispCpBase || 0),
    }));
  }, [r.dispCpBase, dispCpAutoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: string) => {
    setLastEnergyInputAt(Date.now());

    if (
      ["tipo", "mese1", "mese2", "meseRifTabella1", "meseRifTabella2"].includes(k)
    ) {
      setDispCpAutoMode(true);
    }

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

        if (!isDomesticEnergyType(v)) {
          newState.canoneRaiGiaPagato = "0";
          newState.bonusFlag = "NO";
          newState.bonusValore = "";
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

  const handleEnergyOfferTypeChange = (tipologia: string) => {
    setEnergyCompatibilityDriver("tipo");
    setLastEnergyInputAt(Date.now());
    setDispCpAutoMode(true);

    const fixed = tipologia === "FISSO";
    const candidateOffers = visibleEnergyOffers.filter(
      (offer) =>
        isSicuraOffer(offer.nome) === fixed &&
        energyOfferAllowsType(offer, s.tipo)
    );

    setS((prev) => ({
      ...prev,
      tipologiaOfferta: tipologia,
      offerta: candidateOffers[0]?.nome || "",
      mese1: "",
      mese2: "",
    }));
  };

  const handleEnergyTypeChange = (tipo: string) => {
    setEnergyCompatibilityDriver("tipo");
    setLastEnergyInputAt(Date.now());
    setDispCpAutoMode(true);

    const currentOffer = fixedModeEnergyOffers.find(
      (offer) => offer.nome === s.offerta
    );
    const nextOffer =
      currentOffer && energyOfferAllowsType(currentOffer, tipo)
        ? currentOffer
        : fixedModeEnergyOffers.find((offer) =>
            energyOfferAllowsType(offer, tipo)
          );

    setS((prev) => ({
      ...prev,
      tipo,
      iva: ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(
        tipo
      )
        ? "10"
        : "22",
      offerta: nextOffer?.nome || "",
      ...(!isDomesticEnergyType(tipo)
        ? {
            canoneRaiGiaPagato: "0",
            bonusFlag: "NO",
            bonusValore: "",
          }
        : {}),
    }));
  };

  const handleEnergyOfferChange = (offerName: string) => {
    setEnergyCompatibilityDriver("offerta");
    setLastEnergyInputAt(Date.now());

    const nextOffer = fixedModeEnergyOffers.find(
      (offer) => offer.nome === offerName
    );

    if (!nextOffer) {
      setS((prev) => ({ ...prev, offerta: offerName }));
      return;
    }

    const nextType = energyOfferAllowsType(nextOffer, s.tipo)
      ? s.tipo
      : energyTypes.find((tipo) =>
          energyOfferAllowsType(nextOffer, tipo)
        ) || s.tipo;

    setS((prev) => ({
      ...prev,
      offerta: offerName,
      tipo: nextType,
      iva: ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(
        nextType
      )
        ? "10"
        : "22",
      ...(!isDomesticEnergyType(nextType)
        ? {
            canoneRaiGiaPagato: "0",
            bonusFlag: "NO",
            bonusValore: "",
          }
        : {}),
    }));
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
    const pdfCompetenceMonth = (
      selectedMonth: string,
      dispReferenceMonth: string
    ) =>
      isFixedCompetenceMonth(selectedMonth)
        ? dispReferenceMonth || selectedMonth
        : selectedMonth;

    const periodo =
      [
        pdfCompetenceMonth(s.mese1, s.meseRifTabella1),
        s.mese2
          ? pdfCompetenceMonth(s.mese2, s.meseRifTabella2)
          : "",
      ]
        .filter(Boolean)
        .join(" / ") || "-";

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
          <div class="bar" style="background:${orange}"></div>
          <div class="grid">
            <div><div class="label">Cliente</div><div class="value">${s.nome || "-"}</div></div>
            <div><div class="label">Periodo</div><div class="value">${periodo}</div></div>
            <div class="offer-pair">
              <div><div class="label">Tipologia offerta</div><div class="value">${String(s.tipologiaOfferta || "VARIABILE") === "FISSO" ? "Fisso" : "Variabile"}</div></div>
              <div><div class="label">Offerta</div><div class="value">${s.offerta || "-"}</div></div>
            </div>
            <div><div class="label">Tipologia cliente</div><div class="value">${energyPdfTipologia(s.tipo)}</div></div>
            <div><div class="label">Fatturazione</div><div class="value">${s.fatturazione || "-"}</div></div>
            ${String(s.pod || "").trim()
              ? `<div><div class="label">POD</div><div class="value">${s.pod}</div></div>`
              : ""}
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
    const cleanOffer = sanitizeFileName(s.offerta || "");
    const energyFileName = [cleanName, cleanOffer]
      .filter(Boolean)
      .join(" ");
    printHtmlDocument(
      "Preventivo Energia",
      html,
      `${energyFileName} - Energia`
    );
};

return (
  <div
    className="pun-psv-table-grid"
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
            {highlightedSelectField(
              "Tipologia cliente",
              s.tipo,
              handleEnergyTypeChange,
              compatibleEnergyTypeOptions,
              energyTypeOptionLabel,
              "controllare accuratamente la tipologia di cliente per il corretto calcolo automatico delle voci Reti e oneri"
            )}
            {offerTypeField(
              s.tipologiaOfferta || "VARIABILE",
              handleEnergyOfferTypeChange
            )}
            {selectField(
              "Offerta",
              s.offerta,
              handleEnergyOfferChange,
              compatibleEnergyOfferOptions.map((x) => x.nome)
            )}
            {isDomesticEnergyType(s.tipo) &&
              field(
                "Canone RAI già pagato",
                s.canoneRaiGiaPagato,
                (v) => set("canoneRaiGiaPagato", v),
                "number"
              )}
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
    setDispCpAutoMode(false);
    set("dispacciamentoCapacityMarket", pulito);
  },
  "text",
  "Valore rilevato da circolari ARERA. Controllare sempre il valore corretto sulla fattura del cliente, anche se quel valore stesso potrebbe essere aumentato da variabili commerciali."
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
    {numFormat(r.dispCpBase,6)}
  </div>

  <button
 type="button"
 onClick={() => {
   setDispCpAutoMode(true);
   set(
     "dispacciamentoCapacityMarket",
     String(r.dispCpBase)
   );
 }}
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

      {isMobile && (
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div
          style={{
          border:
          Number(String(s.potenzaImpegnata || "").replace(",", ".")) > 0
          ? "2px solid #f97316"
          : "3px solid #dc2626",
          borderRadius: 12,
          padding: 10,
          background:
          Number(String(s.potenzaImpegnata || "").replace(",", ".")) > 0
          ? "#fff7ed"
          : "#fff1f2",
          boxShadow:
          Number(String(s.potenzaImpegnata || "").replace(",", ".")) > 0
          ? "0 0 0 2px rgba(249,115,22,.08)"
          : "0 0 0 3px rgba(220,38,38,.10)",
          }}
          >
          {Number(String(s.potenzaImpegnata || "").replace(",", ".")) <= 0 && (
          <div
          style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          padding: "5px 9px",
          borderRadius: 999,
          background: "#dc2626",
          color: "#fff",
          fontSize: 11,
          fontWeight: 950,
          letterSpacing: ".02em",
          }}
          >
          ⚠ INSERISCI LA POTENZA
          </div>
          )}
          
          {field(
          s.fatturazione === "MULTI POD MENSILE" ||
          s.fatturazione === "MULTI POD BIMESTRALE"
          ? "Potenza totale fatturata (kW)"
          : "Potenza fatturata (kW)",
          s.potenzaImpegnata || "",
          (v) => set("potenzaImpegnata", v),
          "number"
          )}
          
          {Number(String(s.potenzaImpegnata || "").replace(",", ".")) <= 0 && (
          <div
          style={{
          marginTop: 7,
          fontSize: 12,
          lineHeight: 1.35,
          color: "#991b1b",
          fontWeight: 850,
          }}
          >
          Dato necessario per calcolare correttamente la quota potenza rete.
          </div>
          )}
          </div>
        </div>
      )}

      {sectionCard(
        "rete",
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <span>Rete, oneri, rettifiche</span>
          <HelpHint text="valori rilevati automaticamente da circolari ARERA in base alla tipologia di cliente. Controllare sempre i medesimi campi sull'attuale fattura del cliente; in caso di incongruenze, è disponibile la compilazione manuale." />
        </span>,
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={() => set("reteMode", "AUTO")}
              style={{
                padding: "9px 15px",
                borderRadius: 999,
                border:
                  String(s.reteMode || "AUTO") === "AUTO"
                    ? "2px solid #ea580c"
                    : "1px solid #cbd5e1",
                background:
                  String(s.reteMode || "AUTO") === "AUTO"
                    ? "#fff7ed"
                    : "#ffffff",
                color:
                  String(s.reteMode || "AUTO") === "AUTO"
                    ? "#c2410c"
                    : "#475569",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ⚡ AUTOMATICO
            </button>

            <button
              type="button"
              onClick={() => set("reteMode", "MANUALE")}
              style={{
                padding: "9px 15px",
                borderRadius: 999,
                border:
                  String(s.reteMode || "AUTO") === "MANUALE"
                    ? "2px solid #0f172a"
                    : "1px solid #cbd5e1",
                background:
                  String(s.reteMode || "AUTO") === "MANUALE"
                    ? "#0f172a"
                    : "#ffffff",
                color:
                  String(s.reteMode || "AUTO") === "MANUALE"
                    ? "#ffffff"
                    : "#475569",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ✎ MANUALE
            </button>

            <span
              style={{
                fontSize: 12,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              I valori manuali restano memorizzati quando passi ad Automatico.
            </span>
          </div>

          {String(s.reteMode || "AUTO") === "AUTO" ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "minmax(0,0.8fr) repeat(3,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                {!isMobile && (
                  <div
                    style={{
                      border:
                        Number(String(s.potenzaImpegnata || "").replace(",", ".")) > 0
                          ? "2px solid #f97316"
                          : "3px solid #dc2626",
                      borderRadius: 12,
                      padding: 10,
                      background:
                        Number(String(s.potenzaImpegnata || "").replace(",", ".")) > 0
                          ? "#fff7ed"
                          : "#fff1f2",
                      boxShadow:
                        Number(String(s.potenzaImpegnata || "").replace(",", ".")) > 0
                          ? "0 0 0 2px rgba(249,115,22,.08)"
                          : "0 0 0 3px rgba(220,38,38,.10)",
                    }}
                  >
                    {Number(String(s.potenzaImpegnata || "").replace(",", ".")) <= 0 && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 8,
                          padding: "5px 9px",
                          borderRadius: 999,
                          background: "#dc2626",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 950,
                          letterSpacing: ".02em",
                        }}
                      >
                        ⚠ INSERISCI LA POTENZA
                      </div>
                    )}
  
                    {field(
                      s.fatturazione === "MULTI POD MENSILE" ||
                      s.fatturazione === "MULTI POD BIMESTRALE"
                        ? "Potenza totale fatturata (kW)"
                        : "Potenza fatturata (kW)",
                      s.potenzaImpegnata || "",
                      (v) => set("potenzaImpegnata", v),
                      "number"
                    )}
  
                    {Number(String(s.potenzaImpegnata || "").replace(",", ".")) <= 0 && (
                      <div
                        style={{
                          marginTop: 7,
                          fontSize: 12,
                          lineHeight: 1.35,
                          color: "#991b1b",
                          fontWeight: 850,
                        }}
                      >
                        Dato necessario per calcolare correttamente la quota potenza rete.
                      </div>
                    )}
                  </div>
                )}

                {[
                  ["Quota consumi rete", r.H25],
                  ["Quota fissa rete", r.H29],
                  ["Quota potenza rete", r.H30],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      border: "1px solid #fdba74",
                      borderRadius: 10,
                      padding: 12,
                      background: "#fffaf5",
                      minHeight: 66,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#7c2d12",
                        marginBottom: 6,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      {money(Number(value || 0))}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: "#64748b",
                      }}
                    >
                      calcolo automatico
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: "9px 11px",
                  borderRadius: 8,
                  background: r.networkAutoAvailable ? "#f8fafc" : "#fff7ed",
                  border: r.networkAutoAvailable
                    ? "1px solid #e2e8f0"
                    : "1px solid #fdba74",
                  color: r.networkAutoAvailable ? "#475569" : "#9a3412",
                  fontSize: 12,
                  lineHeight: 1.45,
                  fontWeight: 700,
                }}
              >
                {r.networkAutoAvailable ? (
                  <>
                    Tariffe rete e oneri automatici · {s.tipo} · {r.networkMonth1}
                    {sLikeBimestrale(s.fatturazione) && s.mese2
                      ? ` + ${r.networkMonth2}`
                      : ""}.
                    {isNonEnergivoreDefaultType(s.tipo)
                      ? " ASOS classe 0 / non energivoro."
                      : ""}
                    {!s.potenzaImpegnata
                      ? " Inserisci la potenza in kW per calcolare anche la quota potenza."
                      : ""}
                  </>
                ) : (
                  <>
                    Tariffa automatica non disponibile per il periodo selezionato.
                    Usa MANUALE oppure scegli un mese presente nello storico.
                  </>
                )}
              </div>

              {!isEDistributionPod(s.pod) && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  POD non riconosciuto come E-Distribuzione: verifica la tariffa
                  del distributore locale oppure usa la modalità MANUALE.
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(3,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {[
                {
                  label: "Quota consumi rete",
                  value: s.quotaConsumiRete,
                  key: "quotaConsumiRete",
                },
                {
                  label: "Quota fissa rete",
                  value: s.quotaFissaRete,
                  key: "quotaFissaRete",
                },
                {
                  label: "Quota potenza rete",
                  value: s.quotaPotenzaRete,
                  key: "quotaPotenzaRete",
                },
              ].map((item) => (
                <div
                  key={item.key}
                  style={{
                    border: "1px solid #fdba74",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fffaf5",
                    minHeight: 66,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#7c2d12",
                      marginBottom: 8,
                    }}
                  >
                    {item.label}
                  </div>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={item.value || ""}
                    onChange={(e) => set(item.key, e.target.value)}
                    placeholder="0,00"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      background: "#ffffff",
                      padding: "10px 11px",
                      color: "#0f172a",
                      fontSize: 20,
                      fontWeight: 900,
                      outline: "none",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

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
            {isDomesticEnergyType(s.tipo) &&
              toggleAmount(
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

          {canUseProvvigioni && (
            <button
              type="button"
              onClick={() =>
                onOpenProvvigioni({
                  commodity: "Energia",
                  annualConsumption: consumoAnnuoEnergia,
                  offer:
                    selectedEnergyOffer?.provvigioneTipo ||
                    getProvvigioniOfferType(s.offerta),
                  bonusFissoLuce:
                    String(s.tipologiaOfferta || "").toUpperCase() === "FISSO" &&
                    isDomesticEnergyType(s.tipo),
                })
              }
              style={{
                marginTop: 10,
                padding: "10px 14px",
                borderRadius: 8,
                background: "#7c3aed",
                color: "white",
                border: "none",
                cursor: "pointer",
                width: "100%",
                fontWeight: 900,
              }}
            >
              PROVVIGIONE
            </button>
          )}
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
  gasNetworkTariffRows,
  showAgentAssociation,
  canUseProvvigioni,
  onOpenProvvigioni,
}: {
  punPsvRows: PunPsvRow[];
  gasOffers: GasOffer[];
  gasAcciseSettings: GasAcciseSettings;
  gasNetworkTariffRows: GasNetworkTariffRow[];
  showAgentAssociation: boolean;
  canUseProvvigioni: boolean;
  onOpenProvvigioni: (prefill: ProvvigioniPrefill) => void;
}) {
  const visibleGasOffers = gasOffers.filter((offer) => offer.visibile !== false);

  const buildGasInitialState = () => ({
    iva: "10",
    nome: "",
    pdr: "",
    uso: "DOMESTICO",
    fatturazione: "MENSILE",
    tipologiaOfferta: "VARIABILE",
    offerta:
      visibleGasOffers.find((offer) => !isSicuraOffer(offer.nome))?.nome ||
      "",
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
    reteMode: "AUTO",
    regione: "UMBRIA",
    classeContatore: "G4-G6",
    consumoAnnuoRete: "",
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
  const [gasCompatibilityDriver, setGasCompatibilityDriver] =
    useState<"uso" | "offerta">("uso");
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
    const storedState = simulation.state || {};
    const restored = {
      ...buildGasInitialState(),
      ...storedState,
      tipologiaOfferta:
        storedState.tipologiaOfferta ||
        (isSicuraOffer(String(storedState.offerta || "")) ||
        isFixedCompetenceMonth(String(storedState.periodo1 || ""))
          ? "FISSO"
          : "VARIABILE"),
    };

    setS(restored);
    setLastGasInputAt(Date.now());
    setGasSavedOpen(false);
  };

  const gasFixedMode =
    String(s.tipologiaOfferta || "VARIABILE") === "FISSO";

  const fixedModeGasOffers = visibleGasOffers.filter(
    (offer) => isSicuraOffer(offer.nome) === gasFixedMode
  );

  const selectedGasOffer =
    fixedModeGasOffers.find((offer) => offer.nome === s.offerta) ||
    visibleGasOffers.find((offer) => offer.nome === s.offerta);

  const compatibleGasUseOptions =
    gasCompatibilityDriver === "offerta" && selectedGasOffer
      ? ["DOMESTICO", "BUSINESS"].filter((uso) =>
          gasOfferAllowsUse(selectedGasOffer, uso)
        )
      : ["DOMESTICO", "BUSINESS"];

  const compatibleGasOfferOptions =
    gasCompatibilityDriver === "uso"
      ? fixedModeGasOffers.filter((offer) =>
          gasOfferAllowsUse(offer, s.uso)
        )
      : fixedModeGasOffers;

  useEffect(() => {
    const currentOffer = fixedModeGasOffers.find(
      (offer) => offer.nome === s.offerta
    );

    if (
      currentOffer &&
      gasOfferAllowsUse(currentOffer, s.uso)
    ) {
      return;
    }

    const nextOffer =
      fixedModeGasOffers.find((offer) =>
        gasOfferAllowsUse(offer, s.uso)
      ) || fixedModeGasOffers[0];

    if (!nextOffer) {
      setS((prev) => ({ ...prev, offerta: "" }));
      return;
    }

    const nextUso = gasOfferAllowsUse(nextOffer, s.uso)
      ? s.uso
      : ["DOMESTICO", "BUSINESS"].find((uso) =>
          gasOfferAllowsUse(nextOffer, uso)
        ) || s.uso;

    setS((prev) => ({
      ...prev,
      offerta: nextOffer.nome,
      uso: nextUso,
      iva: nextUso === "DOMESTICO" ? "10" : "22",
      ...(nextUso !== "DOMESTICO"
        ? {
            bonusFlag: "NO",
            bonusValore: "",
          }
        : {}),
    }));
  }, [
    gasOffers,
    s.offerta,
    s.uso,
    s.tipologiaOfferta,
    gasFixedMode,
  ]);

  useEffect(() => {
    const isFixed =
      String(s.tipologiaOfferta || "VARIABILE") === "FISSO";

    const variableRows = [...punPsvRows]
      .filter(
        (row) =>
          !isFixedCompetenceMonth(row.mese) &&
          Number(row.psv || 0) !== 0
      )
      .sort(
        (a, b) =>
          getMonthYearSortValue(b.mese) -
          getMonthYearSortValue(a.mese)
      );

    const fixedLabels = [
      s.uso === "DOMESTICO"
        ? "FISSO DOMESTICO"
        : "FISSO BUSINESS",
      "FISSO AD HOC",
    ];

    const validMonthOptions = isFixed
      ? fixedLabels
      : variableRows.map((row) => row.mese);

    if (!validMonthOptions.includes(s.periodo1)) {
      setS((prev) => ({
        ...prev,
        periodo1: validMonthOptions[0] || "",
        periodo2: "",
        periodo3: "",
        periodo4: "",
      }));
    }
  }, [
    punPsvRows,
    s.periodo1,
    s.uso,
    s.tipologiaOfferta,
  ]);

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

  const r = useMemo(
    () => calcGas(s, punPsvRows, gasOffers, gasNetworkTariffRows),
    [s, punPsvRows, gasOffers, gasNetworkTariffRows]
  );

  const gasReferenceRows = useMemo(() => {
    const selectedPeriods = [s.periodo1, s.periodo2, s.periodo3, s.periodo4];
    const periodCount = gasMonths(s.fatturazione);
    const fixedReference =
      punPsvRows.find(
        (row) =>
          row.mese ===
          (s.uso === "DOMESTICO"
            ? "FISSO DOMESTICO"
            : "FISSO BUSINESS")
      ) || null;

    return selectedPeriods
      .slice(0, periodCount)
      .map((selectedPeriod, index) => {
        if (!selectedPeriod) return null;

        if (gasFixedMode) {
          return {
            label: `Mese ${index + 1} · ${selectedPeriod}`,
            value: isFixedDedicatedOffer(s.offerta)
              ? `Prezzo fisso ${referencePriceFormat(r.spreadEff)} €/Smc`
              : fixedReference
                ? `Prezzo fisso ${referencePriceFormat(n(fixedReference.psv))} €/Smc`
                : "-",
          };
        }

        const source = punPsvRows.find((row) => row.mese === selectedPeriod);

        return {
          label: `Mese ${index + 1} · ${selectedPeriod}`,
          value: source
            ? `PSV ${referencePriceFormat(n(source.psv))} €/Smc`
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
    s.uso,
    s.offerta,
    gasFixedMode,
    punPsvRows,
    r.spreadEff,
  ]);

  const gasMonthOptions = mesiOrdinati
    .filter((m) => !isFixedCompetenceMonth(m.mese))
    .filter((m) => gasFixedMode || Boolean(m.psv && m.psv !== 0))
    .map((m) => m.mese);

  const gasSecondaryMonthOptions =
    gasMonthOptions;

  const set = (k: string, v: string) => {
    setLastGasInputAt(Date.now());
    setS((prev) => {
      const newState = { ...prev, [k]: v };

      if (k === "uso") {
        newState.iva = v === "DOMESTICO" ? "10" : "22";

        if (v !== "DOMESTICO") {
          newState.bonusFlag = "NO";
          newState.bonusValore = "";
        }
      }

      if (k === "accisaAgevolata") {
        newState.accisaValore =
          v === "SI"
            ? String(gasAcciseSettings.agevolata)
            : String(gasAcciseSettings.nonAgevolata);
      }

      return newState;
    });
  };

  const handleGasOfferTypeChange = (tipologia: string) => {
    setGasCompatibilityDriver("uso");
    setLastGasInputAt(Date.now());

    const fixed = tipologia === "FISSO";
    const candidateOffers = visibleGasOffers.filter(
      (offer) =>
        isSicuraOffer(offer.nome) === fixed &&
        gasOfferAllowsUse(offer, s.uso)
    );

    setS((prev) => ({
      ...prev,
      tipologiaOfferta: tipologia,
      offerta: candidateOffers[0]?.nome || "",
      periodo1: "",
      periodo2: "",
      periodo3: "",
      periodo4: "",
    }));
  };

  const handleGasUseChange = (uso: string) => {
    setGasCompatibilityDriver("uso");
    setLastGasInputAt(Date.now());

    const currentOffer = fixedModeGasOffers.find(
      (offer) => offer.nome === s.offerta
    );
    const nextOffer =
      currentOffer && gasOfferAllowsUse(currentOffer, uso)
        ? currentOffer
        : fixedModeGasOffers.find((offer) =>
            gasOfferAllowsUse(offer, uso)
          );

    setS((prev) => ({
      ...prev,
      uso,
      iva: uso === "DOMESTICO" ? "10" : "22",
      offerta: nextOffer?.nome || "",
      ...(uso !== "DOMESTICO"
        ? {
            bonusFlag: "NO",
            bonusValore: "",
          }
        : {}),
    }));
  };

  const handleGasOfferChange = (offerName: string) => {
    setGasCompatibilityDriver("offerta");
    setLastGasInputAt(Date.now());

    const nextOffer = fixedModeGasOffers.find(
      (offer) => offer.nome === offerName
    );

    if (!nextOffer) {
      setS((prev) => ({ ...prev, offerta: offerName }));
      return;
    }

    const nextUso = gasOfferAllowsUse(nextOffer, s.uso)
      ? s.uso
      : ["DOMESTICO", "BUSINESS"].find((uso) =>
          gasOfferAllowsUse(nextOffer, uso)
        ) || s.uso;

    setS((prev) => ({
      ...prev,
      offerta: offerName,
      uso: nextUso,
      iva: nextUso === "DOMESTICO" ? "10" : "22",
      ...(nextUso !== "DOMESTICO"
        ? {
            bonusFlag: "NO",
            bonusValore: "",
          }
        : {}),
    }));
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
          <div class="bar" style="background:${blue}"></div>
          <div class="grid">
            <div><div class="label">Cliente</div><div class="value">${s.nome || "-"}</div></div>
            <div><div class="label">Periodo</div><div class="value">${periodo}</div></div>
            <div class="offer-pair">
              <div><div class="label">Tipologia offerta</div><div class="value">${String(s.tipologiaOfferta || "VARIABILE") === "FISSO" ? "Fisso" : "Variabile"}</div></div>
              <div><div class="label">Offerta</div><div class="value">${s.offerta || "-"}</div></div>
            </div>
            <div><div class="label">Uso</div><div class="value">${s.uso || "-"}</div></div>
            <div><div class="label">Fatturazione</div><div class="value">${s.fatturazione || "-"}</div></div>
            ${String(s.pdr || "").trim()
              ? `<div><div class="label">PDR</div><div class="value">${s.pdr}</div></div>`
              : ""}
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
    const cleanOffer = sanitizeFileName(s.offerta || "");
    const gasFileName = [cleanName, cleanOffer]
      .filter(Boolean)
      .join(" ");
    printHtmlDocument(
      "Preventivo Gas",
      html,
      `${gasFileName} - Gas`
    );
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
              {selectField(
                "Uso",
                s.uso,
                handleGasUseChange,
                compatibleGasUseOptions
              )}
              {offerTypeField(
                s.tipologiaOfferta || "VARIABILE",
                handleGasOfferTypeChange
              )}
              {field("IVA %", s.iva, (v) => set("iva", v), "number")}
              {selectField("Fatturazione", s.fatturazione, (v) => set("fatturazione", v), gasBilling)}
              {selectField(
                "Offerta",
                s.offerta,
                handleGasOfferChange,
                compatibleGasOfferOptions.map((x) => x.nome)
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
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>Rete + oneri Gas</span>
            <HelpHint text="In Automatico il periodo viene preso direttamente dai mesi selezionati nei consumi. Il calcolo usa Regione → Ambito tariffario, classe del contatore, consumo annuo di riferimento, scaglione ARERA e include anche il trasporto QT. In Manuale restano disponibili i campi liberi." />
          </span>,
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <button
                type="button"
                onClick={() => set("reteMode", "AUTO")}
                style={{
                  padding: "9px 15px",
                  borderRadius: 999,
                  border:
                    String(s.reteMode || "AUTO") === "AUTO"
                      ? "2px solid #0284c7"
                      : "1px solid #cbd5e1",
                  background:
                    String(s.reteMode || "AUTO") === "AUTO"
                      ? "#e0f2fe"
                      : "#ffffff",
                  color:
                    String(s.reteMode || "AUTO") === "AUTO"
                      ? "#0369a1"
                      : "#475569",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ⚡ AUTOMATICO
              </button>

              <button
                type="button"
                onClick={() => set("reteMode", "MANUALE")}
                style={{
                  padding: "9px 15px",
                  borderRadius: 999,
                  border:
                    String(s.reteMode || "AUTO") === "MANUALE"
                      ? "2px solid #0f172a"
                      : "1px solid #cbd5e1",
                  background:
                    String(s.reteMode || "AUTO") === "MANUALE"
                      ? "#0f172a"
                      : "#ffffff",
                  color:
                    String(s.reteMode || "AUTO") === "MANUALE"
                      ? "#ffffff"
                      : "#475569",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ✎ MANUALE
              </button>

              <span
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                I valori manuali restano memorizzati quando passi ad Automatico.
              </span>
            </div>

            {String(s.reteMode || "AUTO") === "AUTO" ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(auto-fit,minmax(160px,1fr))",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  {selectField(
                    "Regione",
                    s.regione || "UMBRIA",
                    (v) => set("regione", v),
                    GAS_REGIONS
                  )}

                  {selectField(
                    "Classe contatore",
                    s.classeContatore || "G4-G6",
                    (v) => set("classeContatore", v),
                    ["G4-G6", "G10-G40", "OLTRE G40"]
                  )}

                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#334155",
                        marginBottom: 5,
                      }}
                    >
                      Consumo annuo di riferimento
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={s.consumoAnnuoRete || ""}
                      onChange={(e) =>
                        set("consumoAnnuoRete", e.target.value)
                      }
                      placeholder={`AUTO ${numFormat(r.consumoAnnuoStimato, 0)} Smc`}
                      style={{
                        width: "100%",
                        height: 38,
                        boxSizing: "border-box",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        padding: "0 9px",
                        background: "#fff",
                        color: "#0f172a",
                        fontWeight: 800,
                      }}
                    />
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        color: "#64748b",
                        lineHeight: 1.25,
                      }}
                    >
                      Se disponibile, usa il consumo annuo riportato in bolletta.
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #bae6fd",
                      borderRadius: 10,
                      padding: 10,
                      background: "#f0f9ff",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>
                      AMBITO AUTOMATICO
                    </div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900 }}>
                      {r.networkAmbito || gasRegionToAmbito(s.regione || "UMBRIA") || "-"}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #bae6fd",
                      borderRadius: 10,
                      padding: 10,
                      background: "#f0f9ff",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>
                      PERIODO AUTOMATICO
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, lineHeight: 1.35 }}>
                      {r.networkPeriods
                        .filter((item: any) => item.mese)
                        .map((item: any) => item.mese)
                        .join(" · ") || "Seleziona i mesi nei consumi"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(3,minmax(0,1fr))",
                    gap: 12,
                  }}
                >
                  {[
                    ["Quota consumi rete + oneri", r.H23],
                    ["Quota fissa rete + oneri", r.H28],
                    ["Totale rete + oneri", r.H23 + r.H28],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      style={{
                        border: "1px solid #7dd3fc",
                        borderRadius: 10,
                        padding: 12,
                        background: "#f0f9ff",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#075985",
                          fontWeight: 800,
                          marginBottom: 6,
                        }}
                      >
                        {label}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900 }}>
                        {money(Number(value || 0))}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 9,
                    background: r.networkAutoAvailable ? "#ecfdf5" : "#fff7ed",
                    border: r.networkAutoAvailable
                      ? "1px solid #86efac"
                      : "1px solid #fdba74",
                    color: r.networkAutoAvailable ? "#166534" : "#9a3412",
                    fontSize: 12,
                    fontWeight: 750,
                    lineHeight: 1.4,
                  }}
                >
                  {r.networkAutoAvailable
                    ? `Calcolo automatico ARERA · consumo annuo di riferimento ${numFormat(r.consumoAnnuoRiferimento, 0)} Smc ${r.consumoAnnuoReteManuale ? "(manuale)" : "(stimato)"} · scaglione ${r.gasNetworkAuto.scaglioneLabel || "-"} · QT trasporto incluso · ${gasMonths(s.fatturazione)} ${gasMonths(s.fatturazione) === 1 ? "mese" : "mesi"} di competenza.`
                    : `Automatico non disponibile: ${r.gasNetworkAuto.reason || "dati mancanti"}. In questo caso vengono mantenuti i valori manuali.`}
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(2,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                {field(
                  "Quota consumi rete",
                  s.quotaVariabileAggiuntiva,
                  (v) => set("quotaVariabileAggiuntiva", v),
                  "number"
                )}
                {field(
                  "Quota fissa rete",
                  s.quotaFissaAggiuntiva,
                  (v) => set("quotaFissaAggiuntiva", v),
                  "number"
                )}
              </div>
            )}

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
              {s.uso === "DOMESTICO" &&
                toggleAmount(
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

            {canUseProvvigioni && (
              <button
                type="button"
                onClick={() =>
                  onOpenProvvigioni({
                    commodity: "Gas",
                    annualConsumption: consumoAnnuoGas,
                    offer:
                      selectedGasOffer?.provvigioneTipo ||
                      getProvvigioniOfferType(s.offerta),
                    bonusFissoLuce: false,
                  })
                }
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#7c3aed",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  fontWeight: 900,
                }}
              >
                PROVVIGIONE
              </button>
            )}
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

function SystemChargesAdmin({
  dispCpRows,
  dispCpMeta,
  dispCpRefreshing,
  onRefreshDispCapacity,
  networkTariffRows,
  networkTariffMeta,
  networkTariffRefreshing,
  onRefreshNetworkTariffs,
  superAdmin,
}: {
  dispCpRows: DispCpRow[];
  dispCpMeta: DispCapacityMeta;
  dispCpRefreshing: boolean;
  onRefreshDispCapacity: () => Promise<void>;
  networkTariffRows: NetworkTariffRow[];
  networkTariffMeta: NetworkTariffMeta;
  networkTariffRefreshing: boolean;
  onRefreshNetworkTariffs: () => Promise<void>;
  superAdmin: boolean;
}) {
  const [dispHistoryYear, setDispHistoryYear] = useState(2026);
  const [networkHistoryYear, setNetworkHistoryYear] = useState(2026);
  const [networkHistoryType, setNetworkHistoryType] = useState("BTA2");

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #e2e8f0",
  };

  const tdStyle: React.CSSProperties = {
    padding: 10,
    borderBottom: "1px solid #f1f5f9",
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
          <div>
            <h2 style={{ margin: 0 }}>
              Dispacciamento + Capacity Market · automatico
            </h2>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.45,
              }}
            >
              DOMESTICI: C_DISPD ARERA · BUSINESS BT/MT: TIDE + Capacity Market.
              <br />
              Controllo all'apertura e ogni 6 ore. Solo le componenti lette correttamente
              dalla fonte vengono aggiornate; in caso di anomalie, rimangono i valori
              storici di riferimento e compare un avviso.
            </div>
          </div>

          <button
            type="button"
            disabled={dispCpRefreshing}
            onClick={() => void onRefreshDispCapacity()}
            style={{
              padding: "10px 15px",
              borderRadius: 9,
              border: "1px solid #2563eb",
              background: dispCpRefreshing ? "#dbeafe" : "#2563eb",
              color: dispCpRefreshing ? "#1d4ed8" : "white",
              fontWeight: 900,
              cursor: dispCpRefreshing ? "wait" : "pointer",
            }}
          >
            {dispCpRefreshing ? "↻ AGGIORNAMENTO..." : "↻ AGGIORNA ORA"}
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {[2026, 2025].map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setDispHistoryYear(year)}
              style={{
                padding: "7px 13px",
                borderRadius: 999,
                border:
                  dispHistoryYear === year
                    ? "2px solid #0f172a"
                    : "1px solid #cbd5e1",
                background:
                  dispHistoryYear === year ? "#0f172a" : "#f8fafc",
                color: dispHistoryYear === year ? "white" : "#334155",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {year}
            </button>
          ))}

          <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
            Ultimo controllo:{" "}
            <strong>
              {dispCpMeta.checkedAt
                ? new Date(dispCpMeta.checkedAt).toLocaleString("it-IT")
                : "—"}
            </strong>
          </span>
        </div>

        <div style={{
          marginTop: 10,
          fontSize: 12,
          fontWeight: 850,
          color: dispCpMeta.warnings.length ? "#92400e" : "#166534",
        }}>
          Esito acquisizione: {dispCpMeta.sourceStatus === "AGGIORNAMENTO_COMPLETO"
            ? "COMPLETATO"
            : dispCpMeta.sourceStatus === "AGGIORNAMENTO_PARZIALE"
              ? "PARZIALE – VERIFICARE LE FONTI"
              : dispCpMeta.sourceStatus === "FALLBACK_STORICO"
                ? "NESSUN NUOVO VALORE – STORICO CONSERVATO"
                : dispCpMeta.sourceStatus || "NON ANCORA VERIFICATO"}
        </div>

        {dispCpMeta.warnings.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "9px 11px",
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <strong>VERIFICA PARZIALE – DATI DA CONTROLLARE.</strong>
            <div style={{ marginTop: 4 }}>
              Le fonti ARERA non sono state elaborate completamente: per i valori
              mancanti restano in uso quelli di riferimento già disponibili.
            </div>
            <div style={{ marginTop: 7 }}>
              {dispCpMeta.warnings.map((warning, index) => (
                <div key={index}>• {warning}</div>
              ))}
            </div>
          </div>
        )}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 820,
            }}
          >
            <thead>
              <tr>
                {[
                  "Mese",
                  "C_DISPD Domestico €/kWh",
                  "TIDE Business €/kWh",
                  "Capacity Market €/kWh",
                  "Totale Business €/kWh",
                  "Stato",
                ].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dispCpRows
                .filter((row) => row.anno === dispHistoryYear)
                .sort((a, b) => a.meseNumero - b.meseNumero)
                .map((row) => (
                  <tr key={row.mese}>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>{row.mese}</td>
                    <td style={tdStyle}>
                      {row.cdispDomestico == null
                        ? "—"
                        : Number(row.cdispDomestico).toFixed(6)}
                    </td>
                    <td style={tdStyle}>
                      {row.tide == null ? "—" : Number(row.tide).toFixed(6)}
                    </td>
                    <td style={tdStyle}>
                      {row.cpMarket == null
                        ? "—"
                        : Number(row.cpMarket).toFixed(6)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>
                      {row.businessTotale == null
                        ? "—"
                        : Number(row.businessTotale).toFixed(6)}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 7px",
                          borderRadius: 999,
                          background: row.status.includes("UFFICIALE")
                            ? "#dcfce7"
                            : "#eff6ff",
                          color: row.status.includes("UFFICIALE")
                            ? "#166534"
                            : "#1d4ed8",
                          fontSize: 11,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.status || "DISPONIBILE"}
                      </span>
                    </td>
                  </tr>
                ))}
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
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>
              Rete + Oneri Energia · automatico
            </h2>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.45,
              }}
            >
              Quota fissa, quota potenza e quota consumi utilizzate dal
              simulatore Energia. Storico 2025 e 2026.
              <br />
              Per BTA/MTA il riferimento è ASOS classe 0 (cliente non energivoro).
              I valori storici sono segnalati come "da verificare" finché non esiste un prospetto approvato.
            </div>
          </div>

          <button
            type="button"
            disabled={networkTariffRefreshing}
            onClick={() => void onRefreshNetworkTariffs()}
            style={{
              padding: "10px 15px",
              borderRadius: 9,
              border: "1px solid #ea580c",
              background: networkTariffRefreshing ? "#ffedd5" : "#ea580c",
              color: networkTariffRefreshing ? "#c2410c" : "white",
              fontWeight: 900,
              cursor: networkTariffRefreshing ? "wait" : "pointer",
            }}
          >
            {networkTariffRefreshing
              ? "↻ AGGIORNAMENTO..."
              : "↻ AGGIORNA ORA"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          {[2026, 2025].map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setNetworkHistoryYear(year)}
              style={{
                padding: "7px 13px",
                borderRadius: 999,
                border:
                  networkHistoryYear === year
                    ? "2px solid #0f172a"
                    : "1px solid #cbd5e1",
                background:
                  networkHistoryYear === year ? "#0f172a" : "#f8fafc",
                color:
                  networkHistoryYear === year ? "white" : "#334155",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {year}
            </button>
          ))}

          <select
            value={networkHistoryType}
            onChange={(e) => setNetworkHistoryType(e.target.value)}
            style={{
              padding: "8px 11px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "white",
              fontWeight: 800,
            }}
          >
            {[
              "RESIDENTE",
              "NON RESIDENTE",
              "RESIDENTE CANONE ESENTE",
              "BTA1","BTA2","BTA3","BTA4","BTA5","BTA6",
              "MTA1","MTA2","MTA3",
            ].map((tipo) => (
              <option key={tipo} value={tipo}>
                {energyTypeOptionLabel(tipo)}
              </option>
            ))}
          </select>

          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            Ultimo controllo:{" "}
            <strong>
              {networkTariffMeta.checkedAt
                ? new Date(networkTariffMeta.checkedAt).toLocaleString("it-IT")
                : "—"}
            </strong>
          </span>
        </div>

        {superAdmin && <TariffAuditPanel onRatesUpdated={onRefreshNetworkTariffs} />}

        {networkTariffMeta.warnings.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "9px 11px",
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {networkTariffMeta.warnings.map((warning, index) => (
              <div key={index}>⚠ {warning}</div>
            ))}
          </div>
        )}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 760,
            }}
          >
            <thead>
              <tr>
                {[
                  "Mese",
                  "Quota fissa €/POD/anno",
                  "Quota potenza €/kW/anno",
                  "Quota consumi €/kWh",
                  "Stato",
                ].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {networkTariffRows
                .filter(
                  (row) =>
                    row.anno === networkHistoryYear &&
                    row.tipo === networkHistoryType
                )
                .sort((a, b) => a.meseNumero - b.meseNumero)
                .map((row) => (
                  <tr key={row.tipo + row.mese}>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>
                      {row.mese}
                    </td>
                    <td style={tdStyle}>
                      {Number(row.quotaFissaAnnua).toFixed(4)}
                    </td>
                    <td style={tdStyle}>
                      {Number(row.quotaPotenzaAnnua).toFixed(4)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 900 }}>
                      {Number(row.quotaEnergia).toFixed(6)}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 7px",
                          borderRadius: 999,
                          background: row.status.includes("APPROVATO") ? "#dcfce7" : "#fef3c7",
                          color: row.status.includes("APPROVATO") ? "#166534" : "#92400e",
                          fontSize: 11,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.status || "DISPONIBILE"}
                      </span>
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

function GasNetworkChargesAdmin({
  rows,
  meta,
  refreshing,
  onRefresh,
}: {
  rows: GasNetworkTariffRow[];
  meta: GasNetworkTariffMeta;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const ambiti = Array.from(new Set(rows.map((row) => row.ambito))).sort();
  const months = Array.from(new Set(rows.map((row) => row.mese))).sort(
    (a, b) => {
      const aRow = rows.find((row) => row.mese === a);
      const bRow = rows.find((row) => row.mese === b);
      return (
        Number(aRow?.anno || 0) * 12 +
        Number(aRow?.meseNumero || 0) -
        (Number(bRow?.anno || 0) * 12 + Number(bRow?.meseNumero || 0))
      );
    }
  );

  const [ambito, setAmbito] = useState("CENTRALE");
  const [classe, setClasse] = useState<GasMeterClass>("G4-G6");
  const [mese, setMese] = useState(
    months[months.length - 1] || "OTTOBRE 2026"
  );

  useEffect(() => {
    if (!months.length) return;
    if (!months.includes(mese)) {
      setMese(months[months.length - 1]);
    }
  }, [months.join("|"), mese]);

  const visibleRows = rows
    .filter(
      (row) =>
        row.ambito === ambito &&
        row.classeContatore === classe &&
        row.mese === mese
    )
    .sort((a, b) => a.scaglione - b.scaglione);

  const thStyle: React.CSSProperties = {
    padding: 8,
    textAlign: "left",
    borderBottom: "1px solid #cbd5e1",
    background: "#f8fafc",
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #e2e8f0",
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  return (
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
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Rete + Oneri Gas · automatico</h2>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.45,
              maxWidth: 760,
            }}
          >
            Tariffe ARERA 2026 per ambito tariffario, classe contatore e
            scaglione. La scheda Gas usa automaticamente i mesi selezionati
            nei consumi: 1 mese per mensile, 2 per bimestrale, 3 per
            trimestrale e 4 per quadrimestrale.
          </div>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void onRefresh()}
          style={{
            padding: "10px 15px",
            borderRadius: 9,
            border: "1px solid #0284c7",
            background: refreshing ? "#e0f2fe" : "#0284c7",
            color: refreshing ? "#0369a1" : "white",
            fontWeight: 900,
            cursor: refreshing ? "default" : "pointer",
          }}
        >
          {refreshing ? "AGGIORNAMENTO..." : "AGGIORNA DA ARERA"}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          gap: 10,
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 800 }}>
          Ambito
          <select
            value={ambito}
            onChange={(e) => setAmbito(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 5,
              padding: 9,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          >
            {ambiti.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12, fontWeight: 800 }}>
          Classe contatore
          <select
            value={classe}
            onChange={(e) => setClasse(e.target.value as GasMeterClass)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 5,
              padding: 9,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          >
            <option value="G4-G6">G4-G6</option>
            <option value="G10-G40">G10-G40</option>
            <option value="OLTRE G40">OLTRE G40</option>
          </select>
        </label>

        <label style={{ fontSize: 12, fontWeight: 800 }}>
          Mese
          <select
            value={mese}
            onChange={(e) => setMese(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 5,
              padding: 9,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          >
            {months.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 10,
          borderRadius: 9,
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          color: "#0c4a6e",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        Stato fonte: <strong>{meta.sourceStatus || "STORICO LOCALE"}</strong>
        {meta.checkedAt && (
          <>
            {" · "}ultimo controllo{" "}
            <strong>{new Date(meta.checkedAt).toLocaleString("it-IT")}</strong>
          </>
        )}
        {meta.warnings.length > 0 && (
          <div style={{ marginTop: 5, color: "#9a3412" }}>
            {meta.warnings.join(" · ")}
          </div>
        )}
      </div>

      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 1050,
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Scaglione</th>
              <th style={thStyle}>Smc annui</th>
              <th style={thStyle}>Quota fissa annua</th>
              <th style={thStyle}>Distribuzione €/Smc</th>
              <th style={thStyle}>UG2</th>
              <th style={thStyle}>UG1</th>
              <th style={thStyle}>UG3</th>
              <th style={thStyle}>GS business</th>
              <th style={thStyle}>RE</th>
              <th style={thStyle}>RS</th>
              <th style={thStyle}>QT trasporto</th>
              <th style={thStyle}>Tot. domestico €/Smc</th>
              <th style={thStyle}>Tot. business €/Smc</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.mese}-${row.ambito}-${row.classeContatore}-${row.scaglione}`}>
                <td style={tdStyle}>{row.scaglione}</td>
                <td style={tdStyle}>
                  {row.aSmc == null
                    ? `oltre ${row.daSmc.toLocaleString("it-IT")}`
                    : `${row.daSmc.toLocaleString("it-IT")} – ${row.aSmc.toLocaleString("it-IT")}`}
                </td>
                <td style={{ ...tdStyle, fontWeight: 900 }}>
                  {row.quotaFissaAnnua.toFixed(2)}
                </td>
                <td style={tdStyle}>{row.quotaDistribuzione.toFixed(6)}</td>
                <td style={tdStyle}>{row.ug2.toFixed(6)}</td>
                <td style={tdStyle}>{row.ug1.toFixed(6)}</td>
                <td style={tdStyle}>{row.ug3.toFixed(6)}</td>
                <td style={tdStyle}>{row.gsBusiness.toFixed(6)}</td>
                <td style={tdStyle}>{row.re.toFixed(6)}</td>
                <td style={tdStyle}>{row.rs.toFixed(6)}</td>
                <td style={tdStyle}>{row.qtTrasporto.toFixed(6)}</td>
                <td style={{ ...tdStyle, fontWeight: 900 }}>
                  {row.quotaVariabileDomestico.toFixed(6)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 900 }}>
                  {row.quotaVariabileBusiness.toFixed(6)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "#64748b",
          lineHeight: 1.4,
        }}
      >
        Fonti: deliberazioni ARERA 574/2025/R/gas, 588/2025/R/com,
        126/2025/R/gas, 98/2026/R/com e 343/2026/R/com. La componente
        GS è esclusa per uso domestico. Il trasporto QTt è incluso
        automaticamente in base al mese di competenza.
      </div>
    </div>
  );
}

function Listini({
  energyOffers,
  setEnergyOffers,
  gasOffers,
  setGasOffers,
  gasAcciseSettings,
  setGasAcciseSettings,
}: {
  energyOffers: EnergyOffer[];
  setEnergyOffers: React.Dispatch<React.SetStateAction<EnergyOffer[]>>;
  gasOffers: GasOffer[];
  setGasOffers: React.Dispatch<React.SetStateAction<GasOffer[]>>;
  gasAcciseSettings: GasAcciseSettings;
  setGasAcciseSettings: React.Dispatch<React.SetStateAction<GasAcciseSettings>>;
}) {
  const cloneEnergyOffers = (rows: EnergyOffer[]) => rows.map((row) => ({ ...row }));
  const cloneGasOffers = (rows: GasOffer[]) => rows.map((row) => ({ ...row }));

  const [draftEnergyOffers, setDraftEnergyOffers] = useState<EnergyOffer[]>(() => cloneEnergyOffers(energyOffers));
  const [draftGasOffers, setDraftGasOffers] = useState<GasOffer[]>(() => cloneGasOffers(gasOffers));
  const [draftGasAcciseSettings, setDraftGasAcciseSettings] = useState<GasAcciseSettings>(() => ({ ...gasAcciseSettings }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingEnergyIndex, setDraggingEnergyIndex] = useState<number | null>(null);
  const [draggingGasIndex, setDraggingGasIndex] = useState<number | null>(null);

  useEffect(() => {
    if (dirty) return;
    setDraftEnergyOffers(cloneEnergyOffers(energyOffers));
    setDraftGasOffers(cloneGasOffers(gasOffers));
    setDraftGasAcciseSettings({ ...gasAcciseSettings });
  }, [energyOffers, gasOffers, gasAcciseSettings, dirty]);

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

  const updateEnergyOffer = (index: number, key: keyof EnergyOffer, value: string) => {
    setDraftEnergyOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const updateEnergyOfferProvvigioneTipo = (
    index: number,
    provvigioneTipo: ProvvigioniOfferType
  ) => {
    setDraftEnergyOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, provvigioneTipo } : row
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

  const updateEnergyOfferCustomerGroup = (
    index: number,
    group: EnergyCustomerGroup,
    checked: boolean
  ) => {
    setDraftEnergyOffers((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const current = normalizedEnergyOfferGroups(row);
        if (!checked && current.length === 1 && current.includes(group)) {
          return row;
        }

        const next = checked
          ? Array.from(new Set([...current, group]))
          : current.filter((item) => item !== group);

        return {
          ...row,
          allowedCustomerGroups: ALL_ENERGY_CUSTOMER_GROUPS.filter((item) =>
            next.includes(item)
          ),
        };
      })
    );
    markDirty();
  };

  const updateGasOfferProvvigioneTipo = (
    index: number,
    provvigioneTipo: ProvvigioniOfferType
  ) => {
    setDraftGasOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, provvigioneTipo } : row
      )
    );
    markDirty();
  };

  const updateGasOfferVisibility = (index: number, visibile: boolean) => {
    setDraftGasOffers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, visibile } : row))
    );
    markDirty();
  };

  const updateGasOfferCustomerGroup = (
    index: number,
    group: GasCustomerGroup,
    checked: boolean
  ) => {
    setDraftGasOffers((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const current = normalizedGasOfferGroups(row);
        if (!checked && current.length === 1 && current.includes(group)) {
          return row;
        }

        const next = checked
          ? Array.from(new Set([...current, group]))
          : current.filter((item) => item !== group);

        return {
          ...row,
          allowedCustomerGroups: ALL_GAS_CUSTOMER_GROUPS.filter((item) =>
            next.includes(item)
          ),
        };
      })
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
          <table
    className="punpsv-admin-table"
    style={{ width: "100%", borderCollapse: "collapse" }}
  >
            <thead>
              <tr>
                {["Ordina", "Visibile", "Nome offerta", "Tipo provvigione", "Tipologie CTE", "Spread", "Maggiorazione Capacity Market", "Quota fissa"].map((h) => (
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
                  <td style={{ ...tdStyle, minWidth: 150 }}>
                    <select
                      value={
                        row.provvigioneTipo ||
                        getProvvigioniOfferType(row.nome)
                      }
                      onChange={(e) =>
                        updateEnergyOfferProvvigioneTipo(
                          i,
                          e.target.value as ProvvigioniOfferType
                        )
                      }
                      style={{
                        ...inputStyle,
                        width: 140,
                        background: "white",
                        fontWeight: 800,
                      }}
                    >
                      <option value="STANDARD">STANDARD</option>
                      <option value="UNICA">UNICA</option>
                      <option value="SPECIAL">SPECIAL</option>
                    </select>
                  </td>
                  <td style={{ ...tdStyle, minWidth: 190, verticalAlign: "top" }}>
                    <details
                      style={{
                        position: "relative",
                        width: 180,
                      }}
                    >
                      <summary
                        style={{
                          listStyle: "none",
                          cursor: "pointer",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          padding: "8px 10px",
                          background: "#ffffff",
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#334155",
                          userSelect: "none",
                        }}
                      >
                        {normalizedEnergyOfferGroups(row)
                          .map(
                            (group) =>
                              ENERGY_CUSTOMER_GROUPS.find(
                                (item) => item.key === group
                              )?.label
                          )
                          .filter(Boolean)
                          .join(", ")}
                        <span style={{ float: "right" }}>▾</span>
                      </summary>

                      <div
                        style={{
                          position: "absolute",
                          zIndex: 30,
                          top: "calc(100% + 4px)",
                          left: 0,
                          minWidth: 180,
                          background: "white",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          boxShadow: "0 10px 25px rgba(15,23,42,.16)",
                          padding: 8,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ENERGY_CUSTOMER_GROUPS.map((item) => {
                          const checked = normalizedEnergyOfferGroups(row).includes(
                            item.key
                          );
                          const isLastChecked =
                            checked &&
                            normalizedEnergyOfferGroups(row).length === 1;

                          return (
                            <label
                              key={item.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 6px",
                                borderRadius: 6,
                                cursor: isLastChecked
                                  ? "not-allowed"
                                  : "pointer",
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isLastChecked}
                                onChange={(e) =>
                                  updateEnergyOfferCustomerGroup(
                                    i,
                                    item.key,
                                    e.target.checked
                                  )
                                }
                                style={{
                                  width: 17,
                                  height: 17,
                                  cursor: isLastChecked
                                    ? "not-allowed"
                                    : "pointer",
                                }}
                              />
                              {item.label}
                            </label>
                          );
                        })}
                      </div>
                    </details>
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
                {["Ordina", "Visibile", "Nome offerta", "Tipo provvigione", "Tipologie CTE", "Spread", "Quota variabile", "Quota fissa"].map((h) => (
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
                  <td style={{ ...tdStyle, minWidth: 150 }}>
                    <select
                      value={
                        row.provvigioneTipo ||
                        getProvvigioniOfferType(row.nome)
                      }
                      onChange={(e) =>
                        updateGasOfferProvvigioneTipo(
                          i,
                          e.target.value as ProvvigioniOfferType
                        )
                      }
                      style={{
                        ...inputStyle,
                        width: 140,
                        background: "white",
                        fontWeight: 800,
                      }}
                    >
                      <option value="STANDARD">STANDARD</option>
                      <option value="UNICA">UNICA</option>
                      <option value="SPECIAL">SPECIAL</option>
                    </select>
                  </td>
                  <td style={{ ...tdStyle, minWidth: 180, verticalAlign: "top" }}>
                    <details
                      style={{
                        position: "relative",
                        width: 170,
                      }}
                    >
                      <summary
                        style={{
                          listStyle: "none",
                          cursor: "pointer",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          padding: "8px 10px",
                          background: "#ffffff",
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#334155",
                          userSelect: "none",
                        }}
                      >
                        {normalizedGasOfferGroups(row)
                          .map(
                            (group) =>
                              GAS_CUSTOMER_GROUPS.find(
                                (item) => item.key === group
                              )?.label
                          )
                          .filter(Boolean)
                          .join(", ")}
                        <span style={{ float: "right" }}>▾</span>
                      </summary>

                      <div
                        style={{
                          position: "absolute",
                          zIndex: 30,
                          top: "calc(100% + 4px)",
                          left: 0,
                          minWidth: 170,
                          background: "white",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          boxShadow: "0 10px 25px rgba(15,23,42,.16)",
                          padding: 8,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {GAS_CUSTOMER_GROUPS.map((item) => {
                          const checked = normalizedGasOfferGroups(row).includes(
                            item.key
                          );
                          const isLastChecked =
                            checked &&
                            normalizedGasOfferGroups(row).length === 1;

                          return (
                            <label
                              key={item.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 6px",
                                borderRadius: 6,
                                cursor: isLastChecked
                                  ? "not-allowed"
                                  : "pointer",
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isLastChecked}
                                onChange={(e) =>
                                  updateGasOfferCustomerGroup(
                                    i,
                                    item.key,
                                    e.target.checked
                                  )
                                }
                                style={{
                                  width: 17,
                                  height: 17,
                                  cursor: isLastChecked
                                    ? "not-allowed"
                                    : "pointer",
                                }}
                              />
                              {item.label}
                            </label>
                          );
                        })}
                      </div>
                    </details>
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
  const [bulkAgentPasswordsOpen, setBulkAgentPasswordsOpen] =
    useState(false);
  const [bulkAgentPasswords, setBulkAgentPasswords] =
    useState<Record<number, string>>({});
  const [bulkAgentPasswordsSaving, setBulkAgentPasswordsSaving] =
    useState(false);

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

    try {
      const data = await adminAgentList("ALL");
      setAgents((data as Agent[]) || []);
    } catch (error) {
      console.error("LOAD AGENTS ERROR:", error);
      setAgents([]);
    } finally {
      setLoading(false);
    }
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

    try {
      await adminAgentCreate({
        nome: nome.trim(),
        cognome: cognome.trim(),
        username: username.trim(),
        password: password.trim(),
        ownerAdminId: ownerAdminIdToSave,
      });
    } catch (error: any) {
      setSaving(false);
      console.error("SAVE AGENT ERROR:", error);
      alert(
        "Errore salvataggio agente: " +
          (error?.message || JSON.stringify(error))
      );
      return;
    }

    setSaving(false);

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

  const setAgentProvvigioniVisibility = async (
    agentId: number | undefined,
    visible: boolean
  ) => {
    if (!agentId || adminProfile?.role !== "super_admin") return;

    try {
      await adminAgentSetProvvigioniVisibility(
        agentId,
        visible
      );
    } catch (error: any) {
      alert(
        "Errore aggiornamento visibilità Provvigione: " +
          (error?.message || error)
      );
      return;
    }

    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? { ...agent, provvigioni_visible: visible }
          : agent
      )
    );
  };

  const deleteAgent = async (agentId?: number) => {
    if (!agentId) return;

    const ok = window.confirm("Vuoi eliminare questo agente?");
    if (!ok) return;

    try {
      await adminAgentDelete(agentId);
    } catch (error: any) {
      alert(
        "Errore eliminazione agente: " +
          (error?.message || error)
      );
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

    if (
      adminProfile?.role === "super_admin" &&
      !editOwnerAdminId
    ) {
      alert("Seleziona l'admin proprietario");
      return;
    }

    try {
      await adminAgentUpdate({
        id: editingAgent.id,
        username: editUsername.trim(),
        password: editPassword.trim(),
        ownerAdminId:
          adminProfile?.role === "super_admin"
            ? Number(editOwnerAdminId)
            : undefined,
      });
    } catch (error: any) {
      alert(
        "Errore modifica: " +
          (error?.message || error)
      );
      return;
    }
  
    alert("Agente aggiornato");
  
    setEditingAgent(null);
    setEditUsername("");
    setEditPassword("");
    setEditOwnerAdminId("");
  
    await loadAgents();
  };

  const openBulkAgentPasswords = () => {
    const next: Record<number, string> = {};

    agents.forEach((agent) => {
      if (!agent.id) return;
      next[agent.id] = agent.password || "";
    });

    setBulkAgentPasswords(next);
    setBulkAgentPasswordsOpen(true);
  };

  const saveBulkAgentPasswords = async () => {
    const changed = agents.filter((agent) => {
      if (!agent.id) return false;
      const nextPassword =
        bulkAgentPasswords[agent.id]?.trim() || "";
      return (
        nextPassword &&
        nextPassword !== String(agent.password || "")
      );
    });

    if (!changed.length) {
      alert("Non ci sono password modificate da salvare.");
      return;
    }

    const missing = agents.filter((agent) => {
      if (!agent.id) return false;
      return !(
        bulkAgentPasswords[agent.id]?.trim() ||
        String(agent.password || "").trim()
      );
    });

    if (missing.length) {
      const ok = window.confirm(
        `Ci sono ${missing.length} account con password ancora vuota. Vuoi salvare comunque le altre password modificate?`
      );
      if (!ok) return;
    }

    const ok = window.confirm(
      `Vuoi aggiornare ${changed.length} password agente?`
    );
    if (!ok) return;

    setBulkAgentPasswordsSaving(true);

    const results = await Promise.allSettled(
      changed.map((agent) =>
        adminAgentUpdate({
          id: Number(agent.id),
          username: agent.username.trim(),
          password:
            bulkAgentPasswords[Number(agent.id)].trim(),
          ownerAdminId:
            adminProfile?.role === "super_admin"
              ? agent.owner_admin_id
              : undefined,
        })
      )
    );

    setBulkAgentPasswordsSaving(false);

    const failed = results.filter(
      (result) => result.status === "rejected"
    );

    if (failed.length) {
      alert(
        `Aggiornamento completato con ${failed.length} errori. Le altre password sono state salvate.`
      );
    } else {
      alert(
        `${changed.length} password agente aggiornate correttamente.`
      );
      setBulkAgentPasswordsOpen(false);
    }

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0 }}>Elenco agenti</h2>
          <button
            type="button"
            onClick={openBulkAgentPasswords}
            style={{
              padding: "9px 12px",
              borderRadius: 9,
              border: "1px solid #f97316",
              background: "#fff7ed",
              color: "#c2410c",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            MODIFICA TUTTE LE PASSWORD
          </button>
        </div>
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
                    ...(adminProfile?.role === "super_admin"
                      ? ["Admin", "Provvigione"]
                      : []),
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
                    <td
                      style={{
                        padding: 8,
                        borderBottom: "1px solid #f1f5f9",
                        color: "#166534",
                        fontWeight: 800,
                      }}
                    >
                      {a.password ||
                        (a.password_configured !== false
                          ? "DA RIPRISTINARE"
                          : "—")}
                    </td>
  
                    {adminProfile?.role === "super_admin" && (
  <>
    <td
      style={{
        padding: 8,
        borderBottom: "1px solid #f1f5f9",
        fontWeight: 700,
        background:
          a.owner_admin_id === adminProfile?.id
            ? "#f0fdf4"
            : "#eff6ff",
        borderRadius: 8,
      }}
    >
      {getOwnerAdminLabel(a.owner_admin_id as number)}
    </td>

    <td
      style={{
        padding: 8,
        borderBottom: "1px solid #f1f5f9",
        textAlign: "center",
      }}
    >
      <input
        type="checkbox"
        checked={a.provvigioni_visible === true}
        onChange={(event) =>
          void setAgentProvvigioniVisibility(
            a.id,
            event.target.checked
          )
        }
        title="Consenti a questo agente di vedere il pulsante PROVVIGIONE in Energia e Gas"
        style={{
          width: 20,
          height: 20,
          cursor: "pointer",
        }}
      />
    </td>
  </>
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
  
      {bulkAgentPasswordsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.42)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10020,
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(900px, 100%)",
              maxHeight: "88vh",
              overflow: "hidden",
              background: "white",
              borderRadius: 14,
              boxShadow: "0 18px 50px rgba(15,23,42,.25)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Modifica tutte le password agenti
              </h3>
              <div
                style={{
                  marginTop: 5,
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Modifica tutte le righe che vuoi e poi premi SALVA TUTTE.
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                padding: 14,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 650,
                }}
              >
                <thead>
                  <tr>
                    {["Nome", "Cognome", "Username", "Password"].map(
                      (label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: 8,
                            borderBottom:
                              "1px solid #cbd5e1",
                          }}
                        >
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.id}>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        {agent.nome}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        {agent.cognome}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        {agent.username}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        <input
                          value={
                            agent.id
                              ? bulkAgentPasswords[agent.id] ??
                                ""
                              : ""
                          }
                          onChange={(event) => {
                            if (!agent.id) return;
                            setBulkAgentPasswords(
                              (current) => ({
                                ...current,
                                [agent.id as number]:
                                  event.target.value,
                              })
                            );
                          }}
                          placeholder={
                            agent.password
                              ? ""
                              : "Inserisci password"
                          }
                          style={{
                            width: "100%",
                            minWidth: 180,
                            padding: 8,
                            border:
                              "1px solid #cbd5e1",
                            borderRadius: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: 14,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                disabled={bulkAgentPasswordsSaving}
                onClick={() =>
                  setBulkAgentPasswordsOpen(false)
                }
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
                disabled={bulkAgentPasswordsSaving}
                onClick={() =>
                  void saveBulkAgentPasswords()
                }
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: 0,
                  background: "#f97316",
                  color: "white",
                  cursor: bulkAgentPasswordsSaving
                    ? "wait"
                    : "pointer",
                  fontWeight: 900,
                }}
              >
                {bulkAgentPasswordsSaving
                  ? "SALVATAGGIO..."
                  : "SALVA TUTTE"}
              </button>
            </div>
          </div>
        </div>
      )}

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
  const resetToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get(
          "agent-reset"
        ) || ""
      : "";

  const [mode, setMode] = useState<"agent" | "admin">("agent");
  const [username, setUsername] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("last_login_username") || ""
      : ""
  );
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [resetProfile, setResetProfile] = useState<{
    id: number;
    nome: string;
    cognome: string;
    username: string;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(
    Boolean(resetToken)
  );
  const [resetError, setResetError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  useEffect(() => {
    if (!resetToken) return;

    let cancelled = false;

    void (async () => {
      setResetLoading(true);
      setResetError("");

      try {
        const profile =
          await getAgentPasswordResetProfile(resetToken);

        if (cancelled) return;

        if (!profile) {
          setResetProfile(null);
          setResetError(
            "Il link per impostare la password non è valido o è scaduto."
          );
          return;
        }

        setResetProfile(profile);
        setUsername(profile.username || "");
        localStorage.setItem(
          "last_login_username",
          profile.username || ""
        );
      } catch (error: any) {
        if (!cancelled) {
          setResetError(
            error?.message ||
              "Non riesco a verificare il link."
          );
        }
      } finally {
        if (!cancelled) setResetLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resetToken]);

  const handlePasswordReset = async () => {
    if (!resetToken || !resetProfile) return;

    if (newPassword.length < 8) {
      setResetError(
        "La nuova password deve contenere almeno 8 caratteri."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError("Le due password non coincidono.");
      return;
    }

    setResetSaving(true);
    setResetError("");

    try {
      await completeAgentPasswordReset(
        resetToken,
        newPassword
      );

      localStorage.setItem(
        "last_login_username",
        resetProfile.username || ""
      );
      localStorage.removeItem("agent_session");

      window.location.replace("/?tab=report");
    } catch (error: any) {
      setResetError(
        error?.message ||
          "Errore durante l'impostazione della password."
      );
    } finally {
      setResetSaving(false);
    }
  };

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

      localStorage.setItem("last_login_username", user);

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
        const data = await agentLogin(user, pass);

        if (!data) {
          setErrorMsg("Credenziali agente non valide");
          setLoading(false);
          return;
        }

        setAgentSession(data);
        setSession(null);
        setAdminProfile(null);
        onLoginSuccess();
      }
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      setErrorMsg("Errore durante il login");
    }

    setLoading(false);
  };

  if (resetToken) {
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
            maxWidth: 440,
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
            Imposta / cambia password
          </h2>

          {resetLoading ? (
            <div style={{ color: "#64748b" }}>
              Verifica del link in corso...
            </div>
          ) : resetProfile ? (
            <>
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {resetProfile.nome} {resetProfile.cognome}
                </div>
                <div style={{ marginTop: 5 }}>
                  Username:{" "}
                  <strong>{resetProfile.username}</strong>
                </div>
              </div>

              <input
                type="password"
                placeholder="Nuova password"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />

              <input
                type="password"
                placeholder="Ripeti nuova password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handlePasswordReset();
                  }
                }}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />

              <div
                style={{
                  color: "#64748b",
                  fontSize: 12,
                }}
              >
                Minimo 8 caratteri. Lo username resterà memorizzato nel login.
              </div>

              {resetError && (
                <div
                  style={{
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {resetError}
                </div>
              )}

              <button
                type="button"
                disabled={resetSaving}
                onClick={() =>
                  void handlePasswordReset()
                }
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: 0,
                  background: "#f97316",
                  color: "white",
                  cursor: resetSaving ? "wait" : "pointer",
                  fontWeight: 900,
                }}
              >
                {resetSaving
                  ? "SALVATAGGIO..."
                  : "SALVA NUOVA PASSWORD"}
              </button>
            </>
          ) : (
            <>
              <div
                style={{
                  color: "#b91c1c",
                  fontWeight: 700,
                }}
              >
                {resetError || "Link non valido o scaduto."}
              </div>
              <button
                type="button"
                onClick={() =>
                  window.location.replace("/?tab=report")
                }
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: 0,
                  background: "#0f172a",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                VAI AL LOGIN
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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
              padding: "8px 10px",
              borderRadius: 10,
              border:
                mode === "agent"
                  ? "1px solid #0f172a"
                  : "1px solid #cbd5e1",
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
              padding: "8px 10px",
              borderRadius: 10,
              border:
                mode === "admin"
                  ? "1px solid #0f172a"
                  : "1px solid #cbd5e1",
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleLogin();
          }}
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
          onClick={() => void handleLogin()}
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

function parseItalianReportNumber(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return 0;

  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw.replace(/^[+-]/, "").replace(/[^0-9.,]/g, "");
  if (!unsigned) return 0;

  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");
  let normalized = unsigned;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandSeparator = decimalSeparator === "." ? "," : ".";
    normalized = unsigned.split(thousandSeparator).join("");
    normalized = normalized.replace(decimalSeparator, ".");
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(unsigned)
      ? unsigned.replace(/\./g, "")
      : unsigned;
  } else if (lastComma >= 0) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(unsigned)
      ? unsigned.replace(/,/g, "")
      : unsigned.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed * sign : 0;
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
      contracts_energia: parseItalianReportNumber(form.contracts_energia),
      consumi_energia: parseItalianReportNumber(form.consumi_energia),
      contracts_gas: parseItalianReportNumber(form.contracts_gas),
      consumi_gas: parseItalianReportNumber(form.consumi_gas),
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
                type="text"
                inputMode="decimal"
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
                type="text"
                inputMode="decimal"
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
                type="text"
                inputMode="decimal"
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
                type="text"
                inputMode="decimal"
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
                        background:
                          h === "Contratti energia" ||
                          h === "Consumi energia"
                            ? "#ffedd5"
                            : h === "Contratti gas" ||
                                h === "Consumi gas"
                              ? "#dbeafe"
                              : undefined,
                        color:
                          h === "Contratti energia" ||
                          h === "Consumi energia"
                            ? "#9a3412"
                            : h === "Contratti gas" ||
                                h === "Consumi gas"
                              ? "#1d4ed8"
                              : undefined,
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
                    <td
                      data-label="Contratti energia"
                      className="ge-number-cell"
                      style={{ background: "#fff7ed" }}
                    >
                      {r.contracts_energia}
                    </td>
                    <td
                      data-label="Consumi energia"
                      className="ge-number-cell"
                      style={{ background: "#fff7ed" }}
                    >
                      {numFormat(r.consumi_energia, 2)}
                    </td>
                    <td
                      data-label="Contratti gas"
                      className="ge-number-cell"
                      style={{ background: "#eff6ff" }}
                    >
                      {r.contracts_gas}
                    </td>
                    <td
                      data-label="Consumi gas"
                      className="ge-number-cell"
                      style={{ background: "#eff6ff" }}
                    >
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
  const [mode, setMode] =
    useState<"CURRENT" | "PREVIOUS" | "PERIODO">("CURRENT");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"ALL" | "MINE" | "OTHERS">("ALL");
  const [expandedReportAgentId, setExpandedReportAgentId] =
    useState<number | null>(null);
  const [reportAdminView, setReportAdminView] =
    useState<"REPORT" | "NOTIFY">("REPORT");
  const [reportNotificationRecipients, setReportNotificationRecipients] =
    useState<any[]>([]);
  const [selectedMissingReportAgentIds, setSelectedMissingReportAgentIds] =
    useState<Set<number>>(new Set());

  const loadAgents = async () => {
    try {
      const data = await adminAgentList(ownerFilter);
      setAgents(data || []);
    } catch (error) {
      console.error("LOAD AGENTS ERROR:", error);
      setAgents([]);
    }
  };

  const loadReportNotificationRecipients = async () => {
    try {
      const raw = localStorage.getItem("admin_session");
      const session = raw ? JSON.parse(raw) : null;
      const sessionToken = String(session?.token || "");

      if (!sessionToken) {
        setReportNotificationRecipients([]);
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/report-email-notify`,
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "list",
            session_token: sessionToken,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error || `Errore HTTP ${response.status}`
        );
      }

      setReportNotificationRecipients(
        Array.isArray(data?.recipients)
          ? data.recipients.map((item: any) => ({
              agenzia: String(item?.agenzia || ""),
              email: String(item?.email || ""),
              report_notify: true,
              agent_id: item?.agent_id
                ? Number(item.agent_id)
                : null,
              username: String(item?.username || ""),
            }))
          : []
      );
    } catch (error) {
      console.error(
        "LOAD REPORT NOTIFICATION RECIPIENTS ERROR:",
        error
      );
      setReportNotificationRecipients([]);
    }
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
    setExpandedReportAgentId(null);
    loadAgents();
    loadReports(null);
    loadReportNotificationRecipients();
    setSelectedMissingReportAgentIds(new Set());
  }, [ownerFilter, adminProfile?.id, adminProfile?.role]);

  useEffect(() => {
    setSelectedMissingReportAgentIds(new Set());
  }, [mode, dateFrom, dateTo]);

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

  const productionToday = new Date();
  const productionStart = new Date(
    productionToday.getFullYear(),
    productionToday.getMonth() -
      (productionToday.getDate() < 12 ? 1 : 0),
    12
  );

  const toLocalYmd = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const productionStartYmd = toLocalYmd(productionStart);
  const productionTodayYmd = toLocalYmd(productionToday);

  const previousProductionEnd = new Date(
    productionToday.getFullYear(),
    productionToday.getMonth() -
      (productionToday.getDate() < 12 ? 1 : 0),
    11
  );

  const previousProductionStart = new Date(
    previousProductionEnd.getFullYear(),
    previousProductionEnd.getMonth() - 1,
    11
  );

  const previousProductionStartYmd =
    toLocalYmd(previousProductionStart);
  const previousProductionEndYmd =
    toLocalYmd(previousProductionEnd);

  const currentProductionReports = reports.filter((report) => {
    const reportDate = String(report.report_date || "");
    return (
      reportDate >= productionStartYmd &&
      reportDate <= productionTodayYmd
    );
  });

  const previousProductionReports = reports.filter((report) => {
    const reportDate = String(report.report_date || "");
    return (
      reportDate >= previousProductionStartYmd &&
      reportDate <= previousProductionEndYmd
    );
  });

  const selectedPeriodReports = reports.filter((report) => {
    const reportDate = String(report.report_date || "");
    if (!reportDate) return false;
    if (dateFrom && reportDate < dateFrom) return false;
    if (dateTo && reportDate > dateTo) return false;
    return true;
  });

  const summaryReports =
    mode === "CURRENT"
      ? currentProductionReports
      : mode === "PREVIOUS"
        ? previousProductionReports
        : selectedPeriodReports;

  const totals = summaryReports.reduce(
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

  const productionPeriodLabel =
    `${formatReportDate(productionStartYmd)} – ${formatReportDate(
      productionTodayYmd
    )}`;

  const previousProductionPeriodLabel =
    `${formatReportDate(
      previousProductionStartYmd
    )} – ${formatReportDate(previousProductionEndYmd)}`;

  const selectedPeriodLabel =
    dateFrom || dateTo
      ? `${dateFrom ? formatReportDate(dateFrom) : "INIZIO"} – ${
          dateTo ? formatReportDate(dateTo) : "OGGI"
        }`
      : "SELEZIONA IL PERIODO";

  const summaryPeriodLabel =
    mode === "CURRENT"
      ? productionPeriodLabel
      : mode === "PREVIOUS"
        ? previousProductionPeriodLabel
        : selectedPeriodLabel;

  const getAgentName = (agentId: number) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent
      ? `${agent.nome} ${agent.cognome}`.toUpperCase()
      : `ID ${agentId}`;
  };

  const groupedReportAgents = Array.from(
    summaryReports.reduce((map, report) => {
      const agentId = Number(report.agent_id);
      const current = map.get(agentId) || [];
      current.push(report);
      map.set(agentId, current);
      return map;
    }, new Map<number, any[]>())
  )
    .map(([agentId, agentReports]) => {
      const sortedReports = [...agentReports].sort((a, b) =>
        String(b.report_date || "").localeCompare(
          String(a.report_date || "")
        )
      );

      return {
        agentId,
        reports: sortedReports,
        latestReportDate:
          sortedReports[0]?.report_date || "",
      };
    })
    .sort((a, b) =>
      String(b.latestReportDate).localeCompare(
        String(a.latestReportDate)
      )
    );

  const reportAgentIdsInSummary = new Set(
    summaryReports
      .map((report) => Number(report.agent_id || 0))
      .filter((id) => id > 0)
  );

  const visibleAgentIds = new Set(
    agents
      .map((agent) => Number(agent.id || 0))
      .filter((id) => id > 0)
  );

  const missingReportAgents = Array.from(
    reportNotificationRecipients.reduce((map, recipient) => {
      const agentId = Number(recipient?.agent_id || 0);
      if (
        !agentId ||
        !visibleAgentIds.has(agentId) ||
        reportAgentIdsInSummary.has(agentId) ||
        map.has(agentId)
      ) {
        return map;
      }

      map.set(agentId, {
        ...recipient,
        agentId,
      });
      return map;
    }, new Map<number, any>())
  )
    .map(([, recipient]) => recipient)
    .sort((a, b) =>
      getAgentName(a.agentId).localeCompare(
        getAgentName(b.agentId),
        "it"
      )
    );

  const toggleMissingReportAgent = (agentId: number) => {
    setSelectedMissingReportAgentIds((current) => {
      const next = new Set(current);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const openSelectedReportNotifications = () => {
    if (selectedMissingReportAgentIds.size === 0) return;
    setReportAdminView("NOTIFY");
  };

  const reportAdminTabs = (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        padding: 6,
        borderRadius: 12,
        background: "#e2e8f0",
        width: "fit-content",
        maxWidth: "100%",
      }}
    >
      <button
        type="button"
        onClick={() => setReportAdminView("REPORT")}
        style={{
          border: 0,
          borderRadius: 9,
          padding: "9px 13px",
          fontWeight: 900,
          cursor: "pointer",
          background:
            reportAdminView === "REPORT"
              ? "#0f172a"
              : "transparent",
          color:
            reportAdminView === "REPORT"
              ? "white"
              : "#0f172a",
        }}
      >
        REPORT ADMIN
      </button>
      <button
        type="button"
        onClick={() => {
          setSelectedMissingReportAgentIds(new Set());
          setReportAdminView("NOTIFY");
        }}
        style={{
          border: 0,
          borderRadius: 9,
          padding: "9px 13px",
          fontWeight: 900,
          cursor: "pointer",
          background:
            reportAdminView === "NOTIFY"
              ? "#16a34a"
              : "transparent",
          color:
            reportAdminView === "NOTIFY"
              ? "white"
              : "#0f172a",
        }}
      >
        🔔 INVIO NOTIFICA REPORT
      </button>
    </div>
  );

  if (reportAdminView === "NOTIFY") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          {reportAdminTabs}
        </div>
        <ReportNotificationPanel
          agents={reportNotificationRecipients}
          initialSelectedAgentIds={
            selectedMissingReportAgentIds.size > 0
              ? Array.from(selectedMissingReportAgentIds)
              : null
          }
        />
      </div>
    );
  }

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
        {reportAdminTabs}

        <h2 style={{ marginTop: 16 }}>Report Admin</h2>

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
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Attuale produzione
              </div>
              <select
                value={mode}
                onChange={(e) =>
                  setMode(
                    e.target.value as
                      | "CURRENT"
                      | "PREVIOUS"
                      | "PERIODO"
                  )
                }
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                }}
              >
                <option value="CURRENT">
                  PRODUZIONE IN CORSO
                </option>
                <option value="PREVIOUS">
                  PRODUZIONE PRECEDENTE
                </option>
                <option value="PERIODO">
                  PERIODO SCELTO
                </option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Agente
              </div>
              <select
                value={selectedAgentId ?? ""}
                onChange={async (e) => {
                  const value = e.target.value;
                  const nextAgentId = value ? Number(value) : null;
                  setSelectedAgentId(nextAgentId);
                  setExpandedReportAgentId(null);
                  await loadReports(nextAgentId);
                }}
                style={{
                  minWidth: 230,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "white",
                }}
              >
                <option value="">TUTTI GLI AGENTI</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {String(agent.nome || "")} {String(agent.cognome || "")}
                  </option>
                ))}
              </select>
            </div>
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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 22,
              color: "#0f172a",
            }}
          >
            {mode === "CURRENT"
              ? "RIEPILOGO PRODUZIONE IN CORSO"
              : mode === "PREVIOUS"
                ? "RIEPILOGO PRODUZIONE PRECEDENTE"
                : "RIEPILOGO PERIODO SCELTO"}
          </h3>

          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              color: "#475569",
              fontSize: 12,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {summaryPeriodLabel}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #fed7aa",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(249,115,22,.10)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                color: "white",
                padding: "13px 16px",
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontWeight: 900,
                fontSize: 19,
                letterSpacing: ".3px",
              }}
            >
              <span style={{ fontSize: 23 }}>⚡</span>
              LUCE
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(145px, 1fr))",
                gap: 10,
                padding: 12,
              }}
            >
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 13,
                  padding: 14,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: "#9a3412",
                    fontSize: 12,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: ".35px",
                  }}
                >
                  Contratti energia
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "#7c2d12",
                    fontSize: "clamp(26px, 3vw, 34px)",
                    lineHeight: 1,
                    fontWeight: 900,
                    overflowWrap: "anywhere",
                  }}
                >
                  {String(totals.contracts_energia)}
                </div>
              </div>

              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 13,
                  padding: 14,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: "#9a3412",
                    fontSize: 12,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: ".35px",
                  }}
                >
                  Consumi energia
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "#7c2d12",
                    fontSize: "clamp(24px, 3vw, 34px)",
                    lineHeight: 1,
                    fontWeight: 900,
                    overflowWrap: "anywhere",
                  }}
                >
                  {numFormat(totals.consumi_energia, 2)}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #bfdbfe",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(37,99,235,.10)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)",
                color: "white",
                padding: "13px 16px",
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontWeight: 900,
                fontSize: 19,
                letterSpacing: ".3px",
              }}
            >
              <span style={{ fontSize: 23 }}>🔥</span>
              GAS
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(145px, 1fr))",
                gap: 10,
                padding: 12,
              }}
            >
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 13,
                  padding: 14,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: "#1d4ed8",
                    fontSize: 12,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: ".35px",
                  }}
                >
                  Contratti gas
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "#1e3a8a",
                    fontSize: "clamp(26px, 3vw, 34px)",
                    lineHeight: 1,
                    fontWeight: 900,
                    overflowWrap: "anywhere",
                  }}
                >
                  {String(totals.contracts_gas)}
                </div>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 13,
                  padding: 14,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: "#1d4ed8",
                    fontSize: 12,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: ".35px",
                  }}
                >
                  Consumi gas
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "#1e3a8a",
                    fontSize: "clamp(24px, 3vw, 34px)",
                    lineHeight: 1,
                    fontWeight: 900,
                    overflowWrap: "anywhere",
                  }}
                >
                  {numFormat(totals.consumi_gas, 2)}
                </div>
              </div>
            </div>
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
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>
          Storico report
        </h3>
        <div
          style={{
            marginBottom: 12,
            color: "#64748b",
            fontSize: 13,
          }}
        >
          Una riga per agente, ordinata in base al report più recente.
          Clicca sull'agente per aprire lo storico completo.
        </div>

        {loading ? (
          <div>Caricamento...</div>
        ) : groupedReportAgents.length === 0 ? (
          <div>Nessun report</div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            {groupedReportAgents.map((group) => {
              const isOpen =
                expandedReportAgentId === group.agentId;

              const agentSummaryReports = summaryReports.filter(
                (report) =>
                  Number(report.agent_id) === group.agentId
              );

              const agentSummaryTotals =
                agentSummaryReports.reduce(
                  (acc, report) => {
                    acc.contracts_energia += Number(
                      report.contracts_energia || 0
                    );
                    acc.consumi_energia += Number(
                      report.consumi_energia || 0
                    );
                    acc.contracts_gas += Number(
                      report.contracts_gas || 0
                    );
                    acc.consumi_gas += Number(
                      report.consumi_gas || 0
                    );
                    return acc;
                  },
                  {
                    contracts_energia: 0,
                    consumi_energia: 0,
                    contracts_gas: 0,
                    consumi_gas: 0,
                  }
                );

              const agentDetailReports = [
                ...agentSummaryReports,
              ].sort((a, b) =>
                String(b.report_date || "").localeCompare(
                  String(a.report_date || "")
                )
              );

              return (
                <div
                  key={group.agentId}
                  style={{
                    border: isOpen
                      ? "2px solid #93c5fd"
                      : "1px solid #e2e8f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "white",
                    boxShadow: isOpen
                      ? "0 8px 22px rgba(37,99,235,.08)"
                      : "none",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedReportAgentId((current) =>
                        current === group.agentId
                          ? null
                          : group.agentId
                      )
                    }
                    style={{
                      width: "100%",
                      border: 0,
                      background: isOpen
                        ? "#eff6ff"
                        : "#f8fafc",
                      cursor: "pointer",
                      padding: "11px 12px",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      textAlign: "left",
                      color: "#0f172a",
                    }}
                  >
                    <div
                      style={{
                        flex: "1 1 220px",
                        minWidth: 180,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          color: "#0f2d69",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {getAgentName(group.agentId)}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          color: "#64748b",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {summaryPeriodLabel}
                        {" · "}
                        {agentDetailReports.length} REPORT
                      </div>
                    </div>

                    <div
                      style={{
                        flex: "4 1 620px",
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(120px, 1fr))",
                        gap: 7,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          padding: "7px 9px",
                          borderRadius: 9,
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: "#9a3412",
                            fontWeight: 900,
                          }}
                        >
                          CONTRATTI LUCE
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            color: "#7c2d12",
                            fontWeight: 900,
                            fontSize: 16,
                          }}
                        >
                          {agentSummaryTotals.contracts_energia}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "7px 9px",
                          borderRadius: 9,
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: "#9a3412",
                            fontWeight: 900,
                          }}
                        >
                          CONSUMI LUCE
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            color: "#7c2d12",
                            fontWeight: 900,
                            fontSize: 16,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {numFormat(
                            agentSummaryTotals.consumi_energia,
                            2
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "7px 9px",
                          borderRadius: 9,
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: "#1d4ed8",
                            fontWeight: 900,
                          }}
                        >
                          CONTRATTI GAS
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            color: "#1e3a8a",
                            fontWeight: 900,
                            fontSize: 16,
                          }}
                        >
                          {agentSummaryTotals.contracts_gas}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "7px 9px",
                          borderRadius: 9,
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: "#1d4ed8",
                            fontWeight: 900,
                          }}
                        >
                          CONSUMI GAS
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            color: "#1e3a8a",
                            fontWeight: 900,
                            fontSize: 16,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {numFormat(
                            agentSummaryTotals.consumi_gas,
                            2
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        width: 28,
                        textAlign: "center",
                        fontSize: 18,
                        fontWeight: 900,
                        color: "#2563eb",
                        transform: isOpen
                          ? "rotate(180deg)"
                          : "none",
                        transition: "transform .15s ease",
                      }}
                    >
                      ▼
                    </div>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: 10,
                        borderTop:
                          "1px solid #bfdbfe",
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          margin: "2px 4px 10px",
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: ".35px",
                        }}
                      >
                        DETTAGLIO {getAgentName(group.agentId)} · {summaryPeriodLabel}
                      </div>

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
                                    textAlign: "center",
                                    padding: 8,
                                    borderBottom:
                                      "1px solid #e2e8f0",
                                    background:
                                      h === "Contratti energia" ||
                                      h === "Consumi energia"
                                        ? "#ffedd5"
                                        : h === "Contratti gas" ||
                                            h === "Consumi gas"
                                          ? "#dbeafe"
                                          : undefined,
                                    color:
                                      h === "Contratti energia" ||
                                      h === "Consumi energia"
                                        ? "#9a3412"
                                        : h === "Contratti gas" ||
                                            h === "Consumi gas"
                                          ? "#1d4ed8"
                                          : undefined,
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {agentDetailReports.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  style={{
                                    padding: 16,
                                    textAlign: "center",
                                    color: "#64748b",
                                    fontWeight: 800,
                                  }}
                                >
                                  Nessun report nel periodo selezionato.
                                </td>
                              </tr>
                            ) : (
                              agentDetailReports.map((r, i) => (
                              <tr key={r.id || i}>
                                <td
                                  data-label="Data"
                                  className="ge-date-cell"
                                  style={{ textAlign: "center" }}
                                >
                                  {formatReportDate(
                                    r.report_date
                                  )}
                                </td>
                                <td
                                  data-label="Contratti energia"
                                  className="ge-number-cell"
                                  style={{
                                    textAlign: "center",
                                    background: "#fff7ed",
                                  }}
                                >
                                  {r.contracts_energia}
                                </td>
                                <td
                                  data-label="Consumi energia"
                                  className="ge-number-cell"
                                  style={{
                                    textAlign: "center",
                                    background: "#fff7ed",
                                  }}
                                >
                                  {numFormat(
                                    r.consumi_energia,
                                    2
                                  )}
                                </td>
                                <td
                                  data-label="Contratti gas"
                                  className="ge-number-cell"
                                  style={{
                                    textAlign: "center",
                                    background: "#eff6ff",
                                  }}
                                >
                                  {r.contracts_gas}
                                </td>
                                <td
                                  data-label="Consumi gas"
                                  className="ge-number-cell"
                                  style={{
                                    textAlign: "center",
                                    background: "#eff6ff",
                                  }}
                                >
                                  {numFormat(
                                    r.consumi_gas,
                                    2
                                  )}
                                </td>
                                <td
                                  data-label="Note"
                                  className="ge-note-cell"
                                  style={{ textAlign: "center" }}
                                >
                                  {r.notes || "-"}
                                </td>
                                <td
                                  data-label="Azioni"
                                  className="ge-action-cell"
                                  style={{ textAlign: "center" }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteReportAdmin(r.id)
                                    }
                                    className="ge-icon-danger"
                                    title="Cancella report"
                                    aria-label="Cancella report"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            paddingTop: 18,
            borderTop: "2px solid #e2e8f0",
          }}
        >
          <h3 style={{ margin: "0 0 6px" }}>
            Agenti senza dati nel periodo
          </h3>
          <div
            style={{
              marginBottom: 12,
              color: "#64748b",
              fontSize: 13,
            }}
          >
            Solo agenti con flag REPORT attivo · {summaryPeriodLabel}
          </div>

          {missingReportAgents.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "#f8fafc",
                color: "#64748b",
                fontWeight: 800,
              }}
            >
              Nessun agente con flag Report attivo senza dati nel periodo.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {missingReportAgents.map((recipient) => {
                const agentId = Number(recipient.agentId);
                const checked =
                  selectedMissingReportAgentIds.has(agentId);

                return (
                  <label
                    key={agentId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: checked
                        ? "2px solid #f59e0b"
                        : "1px solid #e2e8f0",
                      background: checked
                        ? "#fffbeb"
                        : "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleMissingReportAgent(agentId)
                      }
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          color: "#0f2d69",
                        }}
                      >
                        {getAgentName(agentId)}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 12,
                          color: "#64748b",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {recipient.email || "Email non disponibile"}
                      </div>
                    </div>
                  </label>
                );
              })}

              <button
                type="button"
                onClick={openSelectedReportNotifications}
                disabled={selectedMissingReportAgentIds.size === 0}
                style={{
                  marginTop: 8,
                  width: "100%",
                  border: 0,
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontWeight: 900,
                  cursor:
                    selectedMissingReportAgentIds.size > 0
                      ? "pointer"
                      : "not-allowed",
                  background:
                    selectedMissingReportAgentIds.size > 0
                      ? "#16a34a"
                      : "#cbd5e1",
                  color: "white",
                }}
              >
                🔔 INVIA NOTIFICA REPORT
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ADMIN_DASHBOARD_CHOICES: Array<{ key: string; label: string }> = [
  { key: "energia", label: "ENERGIA" },
  { key: "gas", label: "GAS" },
  { key: "report", label: "REPORT" },
  { key: "punpsvPublic", label: "PUN-PSV" },
  { key: "ateco", label: "ATECO" },
  { key: "calendarAdmin", label: "CALENDARIO" },
  { key: "recruiting", label: "RECRUITING" },
  { key: "appointments", label: "APPUNTAMENTI" },
  { key: "archive", label: "DATI PRODUZIONE" },
  { key: "email", label: "INVIO EMAIL" },
  { key: "driveArchive", label: "ARCHIVIO DRIVE" },
  { key: "provvigioni", label: "PROVVIGIONI" },
  { key: "reportAdmin", label: "REPORT AGENTI" },
  { key: "recruitingWaiting", label: "SALA D'ATTESA HR" },
  { key: "personale", label: "PERSONALE" },
];

function getAdminDashboardPermissions(profile: AdminProfile | null): Set<string> {
  if (!profile || profile.role === "super_admin") {
    return new Set(ADMIN_DASHBOARD_CHOICES.map((item) => item.key));
  }
  if (Array.isArray(profile.dashboard_tabs)) {
    return new Set(profile.dashboard_tabs);
  }
  if (profile.full_access !== false) {
    // Mantiene la riservatezza delle provvigioni per gli admin non Super Admin.
    return new Set(ADMIN_DASHBOARD_CHOICES.filter((item) => item.key !== "provvigioni").map((item) => item.key));
  }
  // Compatibilità con gli admin precedentemente limitati da "Tutte le schede".
  return new Set(["energia", "gas", "report", "punpsvPublic", "ateco", "driveArchive", "reportAdmin"]);
}

function canAdminAccessTab(profile: AdminProfile | null, requestedTab: string): boolean {
  if (!profile || profile.role === "super_admin" || requestedTab === "dashboard") return true;
  if (Array.isArray(profile.dashboard_tabs)) {
    return profile.dashboard_tabs.includes(requestedTab);
  }
  if (profile.full_access !== false) return requestedTab !== "provvigioni";
  return getAdminDashboardPermissions(profile).has(requestedTab);
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
  const [bulkAdminPasswordsOpen, setBulkAdminPasswordsOpen] =
    useState(false);
  const [bulkAdminPasswords, setBulkAdminPasswords] =
    useState<Record<number, string>>({});
  const [bulkAdminPasswordsSaving, setBulkAdminPasswordsSaving] =
    useState(false);
  const [savingDashboardAdminId, setSavingDashboardAdminId] = useState<number | null>(null);

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

  const setAdminDashboardSelection = async (admin: any, key: string, enabled: boolean) => {
    if (admin.role === "super_admin" || !admin.id) return;
    const current = getAdminDashboardPermissions(admin);
    if (enabled) current.add(key);
    else current.delete(key);
    if (!current.size) {
      alert("Devi lasciare almeno una scheda abilitata.");
      return;
    }
    setSavingDashboardAdminId(Number(admin.id));
    try {
      await adminSetDashboardTabs(Number(admin.id), [...current]);
      setAdmins((previous) => previous.map((entry) =>
        Number(entry.id) === Number(admin.id)
          ? { ...entry, dashboard_tabs: [...current] }
          : entry
      ));
    } catch (error: any) {
      alert("Errore nel salvataggio delle schede: " + (error?.message || error));
    } finally {
      setSavingDashboardAdminId(null);
    }
  };

  const openBulkAdminPasswords = () => {
    const next: Record<number, string> = {};

    admins.forEach((admin) => {
      if (!admin.id) return;
      next[Number(admin.id)] = admin.password || "";
    });

    setBulkAdminPasswords(next);
    setBulkAdminPasswordsOpen(true);
  };

  const saveBulkAdminPasswords = async () => {
    const changed = admins.filter((admin) => {
      if (!admin.id) return false;
      const nextPassword =
        bulkAdminPasswords[Number(admin.id)]?.trim() || "";
      return (
        nextPassword &&
        nextPassword !== String(admin.password || "")
      );
    });

    if (!changed.length) {
      alert("Non ci sono password modificate da salvare.");
      return;
    }

    const ok = window.confirm(
      `Vuoi aggiornare ${changed.length} password admin?`
    );
    if (!ok) return;

    setBulkAdminPasswordsSaving(true);

    const results = await Promise.allSettled(
      changed.map((admin) =>
        adminUpdateUser({
          id: Number(admin.id),
          nome: String(admin.nome || "").trim(),
          cognome: String(admin.cognome || "").trim(),
          username: String(admin.username || "").trim(),
          password:
            bulkAdminPasswords[Number(admin.id)].trim(),
        })
      )
    );

    setBulkAdminPasswordsSaving(false);

    const failed = results.filter(
      (result) => result.status === "rejected"
    );

    if (failed.length) {
      alert(
        `Aggiornamento completato con ${failed.length} errori. Le altre password sono state salvate.`
      );
    } else {
      alert(
        `${changed.length} password admin aggiornate correttamente.`
      );
      setBulkAdminPasswordsOpen(false);
    }

    await loadAdmins();
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
          className="ge-admin-responsive-grid"
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0 }}>Elenco admin</h2>
          <button
            type="button"
            onClick={openBulkAdminPasswords}
            style={{
              padding: "9px 12px",
              borderRadius: 9,
              border: "1px solid #f97316",
              background: "#fff7ed",
              color: "#c2410c",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            MODIFICA TUTTE LE PASSWORD
          </button>
        </div>

        {loading ? (
          <div>Caricamento...</div>
        ) : admins.length === 0 ? (
          <div>Nessun admin trovato</div>
        ) : (
          <div className="ge-table-shell">
            <table className="ge-list-table">
              <thead>
                <tr>
                  {["Nome", "Cognome", "Username", "Password", "Ruolo", "Schede dashboard", "Azioni"].map(
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
                        color: "#166534",
                        fontWeight: 800,
                      }}
                    >
                      {a.password ||
                        (a.password_configured !== false
                          ? "DA RIPRISTINARE"
                          : "—")}
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
                      {a.role === "super_admin" ? (
                        <strong style={{ color: "#166534", fontSize: 12 }}>TUTTE (SUPER ADMIN)</strong>
                      ) : (
                        <details style={{ position: "relative", minWidth: 205, textAlign: "left" }}>
                          <summary
                            style={{
                              padding: "9px 11px",
                              border: "1px solid #cbd5e1",
                              borderRadius: 9,
                              background: "#f8fafc",
                              color: "#0f2d69",
                              fontWeight: 800,
                              cursor: "pointer",
                              userSelect: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {savingDashboardAdminId === Number(a.id)
                              ? "SALVATAGGIO..."
                              : `${getAdminDashboardPermissions(a).size} SCHEDE SELEZIONATE ▾`}
                          </summary>
                          <div
                            style={{
                              display: "grid",
                              gap: 5,
                              marginTop: 5,
                              padding: 9,
                              border: "1px solid #cbd5e1",
                              borderRadius: 10,
                              background: "white",
                              boxShadow: "0 7px 18px rgba(15,23,42,.08)",
                              maxHeight: 250,
                              overflowY: "auto",
                              minWidth: 220,
                            }}
                          >
                            {ADMIN_DASHBOARD_CHOICES.map(({ key, label }) => (
                              <label
                                key={key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 9,
                                  padding: "5px 3px",
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={getAdminDashboardPermissions(a).has(key)}
                                  disabled={savingDashboardAdminId === Number(a.id)}
                                  onChange={(event) => void setAdminDashboardSelection(a, key, event.target.checked)}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
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
                            setEditAdminPassword(a.password || "");
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

      {bulkAdminPasswordsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.42)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10020,
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(900px, 100%)",
              maxHeight: "88vh",
              overflow: "hidden",
              background: "white",
              borderRadius: 14,
              boxShadow: "0 18px 50px rgba(15,23,42,.25)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Modifica tutte le password Admin
              </h3>
              <div
                style={{
                  marginTop: 5,
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Modifica tutte le righe che vuoi e poi premi SALVA TUTTE.
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                padding: 14,
              }}
            >
              <table
                className="ge-admin-password-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 650,
                }}
              >
                <thead>
                  <tr>
                    {["Nome", "Cognome", "Username", "Password"].map(
                      (label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: 8,
                            borderBottom:
                              "1px solid #cbd5e1",
                          }}
                        >
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id}>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        {admin.nome || "—"}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        {admin.cognome || "—"}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        {admin.username}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        <input
                          value={
                            admin.id
                              ? bulkAdminPasswords[
                                  Number(admin.id)
                                ] ?? ""
                              : ""
                          }
                          onChange={(event) => {
                            if (!admin.id) return;
                            setBulkAdminPasswords(
                              (current) => ({
                                ...current,
                                [Number(admin.id)]:
                                  event.target.value,
                              })
                            );
                          }}
                          placeholder={
                            admin.password
                              ? ""
                              : "Inserisci password"
                          }
                          style={{
                            width: "100%",
                            minWidth: 180,
                            padding: 8,
                            border:
                              "1px solid #cbd5e1",
                            borderRadius: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: 14,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                disabled={bulkAdminPasswordsSaving}
                onClick={() =>
                  setBulkAdminPasswordsOpen(false)
                }
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
                disabled={bulkAdminPasswordsSaving}
                onClick={() =>
                  void saveBulkAdminPasswords()
                }
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: 0,
                  background: "#f97316",
                  color: "white",
                  cursor: bulkAdminPasswordsSaving
                    ? "wait"
                    : "pointer",
                  fontWeight: 900,
                }}
              >
                {bulkAdminPasswordsSaving
                  ? "SALVATAGGIO..."
                  : "SALVA TUTTE"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                value={editAdminPassword}
                onChange={(e) => setEditAdminPassword(e.target.value)}
                placeholder="Password"
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
  action,
}: {
  title: string;
  subtitle: string;
  icon: string;
  variant: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`ge-section-hero ge-section-hero--${variant}`}
    >
      <div className="ge-section-hero__icon">{icon}</div>
      <div className="ge-section-hero__content">
        <div className="ge-section-hero__title">{title}</div>
        <div className="ge-section-hero__subtitle">
          {subtitle}
        </div>
      </div>
      {action && (
        <div className="ge-section-hero__action">{action}</div>
      )}
    </div>
  );
}

function AdminDashboard({
  navigate,
  openEmail,
  waitingIncomingCount,
  waitingOutgoingCount,
  allowedTabs,
  showReportCard,
}: {
  navigate: DashboardNavigate;
  openEmail: () => void;
  waitingIncomingCount: number;
  waitingOutgoingCount: number;
  allowedTabs: Set<string>;
  showReportCard: boolean;
}) {
  const canShow = (key: string) => allowedTabs.has(key);
  return (
    <div className="ge-dashboard">
      <div className="ge-dashboard-primary ge-dashboard-primary--admin">
        {canShow("energia") && <DashboardCard title="ENERGIA" description="Simula una fattura di energia elettrica." icon="⚡" className="ge-card-energy" spanMobile onClick={() => navigate("energia")} />}
        {canShow("gas") && <DashboardCard title="GAS" description="Simula una fattura di gas metano." icon="🔥" className="ge-card-gas" spanMobile onClick={() => navigate("gas")} />}
        {canShow("punpsvPublic") && <DashboardCard title="PUN-PSV" description="Analizza e monitora i dati PUN e PSV." icon="📈" className="ge-card-pun" onClick={() => navigate("punpsvPublic")} />}
        {canShow("ateco") && <DashboardCard title="ATECO" description="Analizza i dati ATECO." icon="🧾" className="ge-card-ateco" onClick={() => navigate("ateco")} />}
      </div>
      <div className="ge-dashboard-secondary ge-dashboard-secondary--admin">
        {showReportCard && canShow("report") && <DashboardCard title="REPORT" description="Inserisci e consulta i report personali." icon="▤" className="ge-card-agent-report" compact onClick={() => navigate("report")} />}
        {canShow("calendarAdmin") && <DashboardCard title="CALENDARIO" description="Gestisci il tuo calendario e le attività." icon="📅" className="ge-card-calendar" compact onClick={() => navigate("calendarAdmin")} />}
        {canShow("recruiting") && <DashboardCard title="RECRUITING" description="Gestisci candidati e nuove risorse." icon="👥" className="ge-card-recruiting" compact onClick={() => navigate("recruiting")} />}
        {canShow("appointments") && <DashboardCard title="APPUNTAMENTI" description="Organizza e monitora gli appuntamenti." icon="✓" className="ge-card-appointments" compact onClick={() => navigate("appointments")} />}
        {canShow("archive") && <DashboardCard title="DATI PRODUZIONE" description="Monitora i dati di produzione." icon="🧮" className="ge-card-production" compact onClick={() => navigate("archive")} />}
        {canShow("email") && <DashboardCard title="INVIO EMAIL" description="Invia comunicazioni e allegati." icon="✉" className="ge-card-email" compact onClick={openEmail} />}
        {canShow("driveArchive") && <DashboardCard title="ARCHIVIO DRIVE" description="Consulta documenti e file condivisi." icon="📁" className="ge-card-drive" compact onClick={() => navigate("driveArchive")} />}
        {canShow("provvigioni") && <DashboardCard title="PROVVIGIONI" description="Consulta e calcola le provvigioni commerciali." icon="💰" className="ge-card-provvigioni" compact onClick={() => navigate("provvigioni")} />}
        {canShow("reportAdmin") && <DashboardCard title="REPORT AGENTI" description="Consulta i report degli agenti." icon="▤" className="ge-card-agent-report" compact onClick={() => navigate("reportAdmin")} />}
        {canShow("recruitingWaiting") && <DashboardCard title="SALA D'ATTESA HR" description="Gestisci nominativi in arrivo e sincronizzazioni HR." icon="⌛" className="ge-card-waiting" compact incomingCount={waitingIncomingCount} outgoingCount={waitingOutgoingCount} onClick={() => navigate("recruitingWaiting")} />}
        {canShow("personale") && <DashboardCard title="PERSONALE" description="Gestisci ferie, permessi ed ex festività." icon="👤" className="ge-card-personale" compact onClick={() => navigate("personale")} />}
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
          title="PUN-PSV"
          description="Analizza i dati del mercato PUN e PSV."
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
          title="ARCHIVIO DRIVE"
          description="Consulta documenti e file condivisi."
          icon="📁"
          className="ge-card-drive"
          compact
          onClick={() => navigate("driveArchive")}
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

  const mainNavBtn = {
    ...baseBtn,
    padding: "9px 11px",
  };

  const [adminSession, setAdminSession] = useState<AdminProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [agentSession, setAgentSession] = useState<any>(null);
  const [provvigioniPrefill, setProvvigioniPrefill] =
    useState<ProvvigioniPrefill | null>(null);
  const [appointmentOpenRequest, setAppointmentOpenRequest] =
    useState<{
      crmEventId: string;
      mode: "view" | "reschedule";
      requestId: number;
    } | null>(null);
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
  
  const [recruitingEntrySection, setRecruitingEntrySection] =
    useState<"contacts" | "external_contacts">("contacts");

  const [tab, setTab] = useState(() => {
    const requestedTab =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tab")
        : "";

    // L'unica apertura diretta consentita è il link delle email
    // della Sala d'attesa. In tutti gli altri casi l'app parte
    // sempre dalla DASHBOARD pulita.
    if (requestedTab === "recruitingWaiting") {
      return "recruitingWaiting";
    }
    if (requestedTab === "driveArchive") {
      return "driveArchive";
    }
    if (requestedTab === "report") {
      return "report";
    }

    return "dashboard";
  });
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const browserHistoryReadyRef = useRef(false);
  const browserHistoryPopRef = useRef(false);
  const browserHistoryDepthRef = useRef(0);

  useEffect(() => {
    const initialDepth = Number(
      window.history.state?.geDepth || 0
    );
    browserHistoryDepthRef.current = Number.isFinite(initialDepth)
      ? Math.max(0, initialDepth)
      : 0;

    const currentUrl = new URL(window.location.href);
    currentUrl.hash =
      tab === "dashboard"
        ? ""
        : `ge-${encodeURIComponent(tab)}`;

    window.history.replaceState(
      {
        ...(window.history.state || {}),
        geTab: tab,
        geDepth: browserHistoryDepthRef.current,
      },
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    );

    browserHistoryReadyRef.current = true;

    const handlePopState = (event: PopStateEvent) => {
      const hashTab = window.location.hash.startsWith("#ge-")
        ? decodeURIComponent(
            window.location.hash.slice("#ge-".length)
          )
        : "";

      const historyTab =
        typeof event.state?.geTab === "string"
          ? event.state.geTab
          : hashTab || "dashboard";

      const nextDepth = Number(event.state?.geDepth || 0);
      browserHistoryDepthRef.current = Number.isFinite(nextDepth)
        ? Math.max(0, nextDepth)
        : 0;

      browserHistoryPopRef.current = true;
      setAdminMenuOpen(false);
      setTab(historyTab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!browserHistoryReadyRef.current) return;

    if (browserHistoryPopRef.current) {
      browserHistoryPopRef.current = false;
      return;
    }

    if (window.history.state?.geTab === tab) return;

    const url = new URL(window.location.href);
    if (
      tab !== "recruitingWaiting" &&
      tab !== "driveArchive" &&
      tab !== "report"
    ) {
      url.searchParams.delete("tab");
    }

    url.hash =
      tab === "dashboard"
        ? ""
        : `ge-${encodeURIComponent(tab)}`;

    const nextDepth = browserHistoryDepthRef.current + 1;
    browserHistoryDepthRef.current = nextDepth;

    window.history.pushState(
      {
        ...(window.history.state || {}),
        geTab: tab,
        geDepth: nextDepth,
      },
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [tab]);

  useEffect(() => {
    const requestedTab =
      new URLSearchParams(window.location.search).get("tab");

    if (
      requestedTab === "recruitingWaiting" ||
      requestedTab === "driveArchive" ||
      requestedTab === "report"
    ) return;

    setAdminMenuOpen(false);
    localStorage.setItem("app_tab", "dashboard");
  }, []);

  const navigateTo = (nextTab: string) => {
    window.dispatchEvent(new Event("close-outlook-email"));
    setAdminMenuOpen(false);

    if (nextTab === "recruiting") {
      setRecruitingEntrySection("contacts");
    }

    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openProvvigioniFromSimulation = (
    prefill: ProvvigioniPrefill
  ) => {
    setProvvigioniPrefill({
      ...prefill,
      requestId: Date.now(),
    });
    navigateTo("provvigioni");
  };

  const openAppointmentFromCalendar = (
    crmEventId: string,
    mode: "view" | "reschedule"
  ) => {
    setAppointmentOpenRequest({
      crmEventId,
      mode,
      requestId: Date.now(),
    });
    setAdminMenuOpen(false);
    setTab("appointments");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openRecruitingContactFromCalendar = (
    scope: "internal" | "external",
    candidateId: string
  ) => {
    const nextSection =
      scope === "external" ? "external_contacts" : "contacts";

    try {
      window.localStorage.setItem(
        `recruiting_selected_candidate_${scope}`,
        candidateId
      );
    } catch {
      // Il componente Recruiting userà comunque l'ID già ricevuto.
    }

    setAdminMenuOpen(false);
    setRecruitingEntrySection(nextSection);
    setTab("recruiting");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openNewAgentFromRecruiting = (candidate: {
    id: string;
    fullName: string;
    phone: string;
    email: string;
    operationalZone: string;
    provinceCode: string;
    region: string;
    contactScope: "internal" | "external";
  }) => {
    const payload = {
      sourceCandidateId: candidate.id,
      sourceScope: candidate.contactScope,
      fullName: String(candidate.fullName || "")
        .trim()
        .toLocaleUpperCase("it"),
      phone: String(candidate.phone || "").trim(),
      email: String(candidate.email || "").trim(),
      zone: String(
        candidate.operationalZone ||
          candidate.region ||
          ""
      )
        .trim()
        .toLocaleUpperCase("it"),
      region: String(candidate.region || "")
        .trim()
        .toLocaleUpperCase("it"),
      provinceCode: String(candidate.provinceCode || "")
        .trim()
        .toLocaleUpperCase("it"),
    };

    try {
      sessionStorage.setItem(
        "unified_agent_create_prefill",
        JSON.stringify(payload)
      );
    } catch {
      // Il passaggio funziona comunque anche se lo storage non è disponibile.
    }

    window.dispatchEvent(new Event("close-outlook-email"));
    setAdminMenuOpen(false);
    setTab("agentManagement");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onOpenUnifiedAgentCreate = (event: Event) => {
      const detail = (
        event as CustomEvent<Record<string, unknown>>
      ).detail || {};

      try {
        sessionStorage.setItem(
          "unified_agent_create_prefill",
          JSON.stringify(detail)
        );
      } catch {
        // La navigazione funziona comunque.
      }

      window.dispatchEvent(new Event("close-outlook-email"));
      setAdminMenuOpen(false);
      setTab("agentManagement");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener(
      "open-unified-agent-create",
      onOpenUnifiedAgentCreate as EventListener
    );

    return () => {
      window.removeEventListener(
        "open-unified-agent-create",
        onOpenUnifiedAgentCreate as EventListener
      );
    };
  }, []);

  useEffect(() => {
    const onAgentManagementNav = (event: Event) => {
      const target = String(
        (event as CustomEvent<{ target?: string }>).detail?.target || ""
      );

      window.dispatchEvent(new Event("close-outlook-email"));
      setAdminMenuOpen(false);

      if (target === "map") {
        setTab("recruitingManagement");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (target === "admin") {
        setTab("agentManagement");
        window.setTimeout(() => {
          const section = document.getElementById(
            "ge-admin-users-manager"
          ) as HTMLDetailsElement | null;
          if (!section) return;
          section.open = true;
          section.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 120);
      }
    };

    window.addEventListener(
      "agent-management-nav",
      onAgentManagementNav as EventListener
    );

    return () => {
      window.removeEventListener(
        "agent-management-nav",
        onAgentManagementNav as EventListener
      );
    };
  }, []);

  useEffect(() => {
    const onOpenAgentManagementRecord = (event: Event) => {
      const detail = (
        event as CustomEvent<Record<string, unknown>>
      ).detail || {};

      try {
        sessionStorage.setItem(
          "agent_management_open_target",
          JSON.stringify(detail)
        );
      } catch {
        // La navigazione resta comunque disponibile.
      }

      window.dispatchEvent(new Event("close-outlook-email"));
      setAdminMenuOpen(false);
      setTab("agentManagement");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener(
      "open-agent-management-record",
      onOpenAgentManagementRecord as EventListener
    );

    return () => {
      window.removeEventListener(
        "open-agent-management-record",
        onOpenAgentManagementRecord as EventListener
      );
    };
  }, []);

  const openDatabaseSettings = () => {
    window.dispatchEvent(new Event("close-outlook-email"));
    setAdminMenuOpen(false);

    window.requestAnimationFrame(() => {
      setTab("agentManagement");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const toggleAdminMenu = () => {
    window.dispatchEvent(new Event("close-outlook-email"));
    if (tab !== "dashboard") {
      setAdminMenuOpen(true);
      setTab("dashboard");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setAdminMenuOpen((current) => !current);
  };

  useEffect(() => {
    if (tab === "adminMenu") {
      setTab("dashboard");
      setAdminMenuOpen(false);
    }
  }, [tab]);

  const openOutlookEmail = () => {
    if (adminSession && !canAdminAccessTab(adminProfile, "email")) return;
    setAdminMenuOpen(false);
    window.dispatchEvent(
      new CustomEvent("open-outlook-email", {
        detail: { view: "email" },
      })
    );
  };

  const openOutlookEmailMatches = (targetAgency?: string) => {
    if (adminSession && !canAdminAccessTab(adminProfile, "email")) return;
    setAdminMenuOpen(false);
    window.dispatchEvent(
      new CustomEvent("open-outlook-email", {
        detail: {
          view: "matches",
          targetAgency: String(targetAgency || "").trim(),
        },
      })
    );
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

      try {
        const agent = await ensureAgentSession();
        setAgentSession(agent);
      } catch (error) {
        console.error("AGENT SESSION RESTORE ERROR:", error);
        localStorage.removeItem("agent_session");
        setAgentSession(null);
      }
    })();
  }, []);

  // Mantiene le autorizzazioni dashboard allineate tra Fold, PC e altri dispositivi.
  useEffect(() => {
    const token = String(adminSession?.token || "");
    if (!token) return;
    let cancelled = false;

    const refreshDashboardAccess = async () => {
      try {
        const { data, error } = await supabase.rpc("admin_dashboard_access", {
          p_session_token: token,
          p_action: "self",
        });
        if (cancelled || error || !data) return;
        const access = data as any;
        const dashboard_tabs = Array.isArray(access.dashboard_tabs)
          ? access.dashboard_tabs.map(String)
          : null;
        setAdminProfile((current) => {
          if (!current) return current;
          const oldKeys = JSON.stringify(current.dashboard_tabs ?? null);
          const newKeys = JSON.stringify(dashboard_tabs);
          if (
            oldKeys === newKeys &&
            current.full_access === access.full_access &&
            current.role === access.role
          ) return current;
          const updated = {
            ...current,
            dashboard_tabs,
            full_access: access.full_access,
            role: access.role,
          };
          localStorage.setItem("admin_session", JSON.stringify({
            ...updated,
            token,
          }));
          return updated;
        });
      } catch (error) {
        console.warn("DASHBOARD ACCESS REFRESH ERROR:", error);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshDashboardAccess();
    };
    window.addEventListener("focus", refreshDashboardAccess);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refreshDashboardAccess, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshDashboardAccess);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [adminSession?.token]);

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
  const punPsvPdfLayoutRef = useRef<HTMLDivElement>(null);
  const [punPsvPdfMode, setPunPsvPdfMode] =
    useState<"both" | "pun" | "psv">("both");

  const waitForPunPsvPdfMode = async (
    mode: "both" | "pun" | "psv"
  ) => {
    setPunPsvPdfMode(mode);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  };

  const capturePunPsvPdfPage = async (
    mode: "both" | "pun" | "psv"
  ) => {
    await waitForPunPsvPdfMode(mode);

    const exportPage = punPsvPdfLayoutRef.current;
    if (!exportPage) {
      throw new Error("Layout PDF PUN-PSV non disponibile");
    }

    return html2canvas(exportPage, {
      scale: 1.55,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: 1400,
      windowHeight: 990,
    });
  };

  const exportPunPsvPdf = async () => {
    try {
      const canvas = await capturePunPsvPdfPage("both");

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const img = canvas.toDataURL("image/jpeg", 0.95);

      pdf.addImage(img, "JPEG", 0, 0, pageWidth, pageHeight);

      const meseNome = String(activePunPsvMonth || "PUN-PSV")
        .replace(/\s+/g, "-")
        .toUpperCase();

      pdf.save(`Report-PUN-PSV-${meseNome}.pdf`);
    } catch (error) {
      console.error("PUN PSV PDF ERROR:", error);
      alert("Errore esportazione PDF");
    } finally {
      setPunPsvPdfMode("both");
    }
  };

  const exportPunPsvThreePagePdf = async () => {
    try {
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const modes: Array<"both" | "pun" | "psv"> = [
        "both",
        "pun",
        "psv",
      ];

      for (let index = 0; index < modes.length; index += 1) {
        const canvas = await capturePunPsvPdfPage(modes[index]);
        const img = canvas.toDataURL("image/jpeg", 0.95);

        if (index > 0) {
          pdf.addPage("a4", "landscape");
        }

        pdf.addImage(
          img,
          "JPEG",
          0,
          0,
          pageWidth,
          pageHeight
        );
      }

      const meseNome = String(activePunPsvMonth || "PUN-PSV")
        .replace(/\s+/g, "-")
        .toUpperCase();

      pdf.save(
        `Report-PUN-PSV-3-Pagine-${meseNome}.pdf`
      );
    } catch (error) {
      console.error("PUN PSV 3 PAGE PDF ERROR:", error);
      alert("Errore esportazione PDF a 3 pagine");
    } finally {
      setPunPsvPdfMode("both");
    }
  };


  const [selectedMonthPUN, setSelectedMonthPUN] = useState("");
  const [appliedMonthPUN, setAppliedMonthPUN] = useState("");
  const activePunPsvMonth = appliedMonthPUN || selectedMonthPUN;

  const selectPunPsvMonth = (month: string) => {
    setSelectedMonthPUN(month);
    setAppliedMonthPUN(month);
  };

  
  const [punPsvView, setPunPsvView] = useState<"both" | "pun" | "psv">("both");
  const [expandedMarketChart, setExpandedMarketChart] =
    useState<null | "pun" | "psv">(null);
  const [marketChartOffset, setMarketChartOffset] = useState({ x: 0, y: 0 });
  const marketChartDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const openExpandedMarketChart = (type: "pun" | "psv") => {
    setMarketChartOffset({ x: 0, y: 0 });
    setExpandedMarketChart(type);
  };

  const startMarketChartDrag = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    marketChartDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: marketChartOffset.x,
      originY: marketChartOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveMarketChartDrag = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const drag = marketChartDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setMarketChartOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const stopMarketChartDrag = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (marketChartDragRef.current?.pointerId === event.pointerId) {
      marketChartDragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
  };
  
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
  
  function punPsvMonthScore(label: string) {
    const mesi = [
      "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
      "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
    ];
    const parts = normalizeMonthLabel(label).split(" ");
    const monthIndex = mesi.indexOf(parts[0] || "");
    const year = Number(parts[1] || 0);
    if (monthIndex < 0 || !year) return -1;
    return year * 12 + monthIndex;
  }

  const validPunPsvRowsChronological = [...punPsvRows]
    .filter((row) => {
      const mese = normalizeMonthLabel(row.mese);
      if (!mese || mese.startsWith("FISSO ")) return false;
      return (
        Number(row.mono || 0) !== 0 ||
        Number(row.f1 || 0) !== 0 ||
        Number(row.f2 || 0) !== 0 ||
        Number(row.f3 || 0) !== 0 ||
        Number(row.psv || 0) !== 0
      );
    })
    .sort((a, b) => punPsvMonthScore(a.mese) - punPsvMonthScore(b.mese));

  function getCentered12PunPsvRows(selectedMonth: string) {
    if (!validPunPsvRowsChronological.length) return [];

    const normalizedSelected = normalizeMonthLabel(selectedMonth);
    let selectedIndex = validPunPsvRowsChronological.findIndex(
      (row) => normalizeMonthLabel(row.mese) === normalizedSelected
    );

    if (selectedIndex < 0) selectedIndex = validPunPsvRowsChronological.length - 1;

    let startIndex = selectedIndex - 5;
    let endIndex = startIndex + 12;

    if (startIndex < 0) {
      startIndex = 0;
      endIndex = Math.min(12, validPunPsvRowsChronological.length);
    }

    if (endIndex > validPunPsvRowsChronological.length) {
      endIndex = validPunPsvRowsChronological.length;
      startIndex = Math.max(0, endIndex - 12);
    }

    return validPunPsvRowsChronological.slice(startIndex, endIndex);
  }

  const chartPunPsvRows = getCentered12PunPsvRows(activePunPsvMonth);
  const visiblePunPsvRows = chartPunPsvRows;
  const tablePunPsvRows = [...chartPunPsvRows].reverse();
  const validMonthOptions = [...validPunPsvRowsChronological].reverse();

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

const chartYearLabels = chartPunPsvRows.map(
  (row) => String(row.mese || "").trim().split(" ")[1] || ""
);

const selectedChartIndex = chartPunPsvRows.findIndex(
  (row) => normalizeMonthLabel(row.mese) === normalizeMonthLabel(activePunPsvMonth)
);
const latestPunPsvRow =
  selectedChartIndex >= 0
    ? chartPunPsvRows[selectedChartIndex]
    : chartPunPsvRows[chartPunPsvRows.length - 1] || null;
const latestPunPsvMonthLabel = latestPunPsvRow
  ? String(latestPunPsvRow.mese || "").trim().toUpperCase()
  : "-";

const latestPun =
latestPunPsvRow
 ? Number(latestPunPsvRow.mono || 0).toFixed(3)
 : "-";

const latestPsv =
latestPunPsvRow
 ? Number(latestPunPsvRow.psv || 0).toFixed(6)
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

  const resetPunPsvToCurrentMonth = () => {
    const monthNames = [
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

    const now = new Date();
    const currentMonthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    const currentAvailable = publicPunPsvOptions.find(
      (row) =>
        normalizeMonthLabel(row.mese) ===
        normalizeMonthLabel(currentMonthLabel)
    )?.mese;

    const targetMonth =
      currentAvailable ||
      publicPunPsvOptions[0]?.mese ||
      currentMonthLabel;

    selectPunPsvMonth(targetMonth);
  };

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
const [dispCpRows, setDispCpRows] = useState<DispCpRow[]>(
  INITIAL_AUTO_DISP_CP_ROWS
);
const [dispCpMeta, setDispCpMeta] = useState<DispCapacityMeta>({
  checkedAt: "",
  sourceStatus: "STORICO LOCALE",
  warnings: [],
});
const [dispCpRefreshing, setDispCpRefreshing] = useState(false);
const [networkTariffRows, setNetworkTariffRows] = useState<NetworkTariffRow[]>(
  INITIAL_NETWORK_TARIFF_ROWS
);
const [networkTariffMeta, setNetworkTariffMeta] = useState<NetworkTariffMeta>({
  checkedAt: "",
  sourceStatus: "STORICO LOCALE",
  warnings: [],
});
const [networkTariffRefreshing, setNetworkTariffRefreshing] = useState(false);
const [gasNetworkTariffRows, setGasNetworkTariffRows] = useState<GasNetworkTariffRow[]>(
  INITIAL_GAS_NETWORK_TARIFF_ROWS
);
const [gasNetworkTariffMeta, setGasNetworkTariffMeta] = useState<GasNetworkTariffMeta>({
  checkedAt: "",
  sourceStatus: "STORICO LOCALE",
  warnings: [],
});
const [gasNetworkTariffRefreshing, setGasNetworkTariffRefreshing] = useState(false);
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
  if (!canAdminAccessTab(adminProfile, tab)) {
    setAdminMenuOpen(false);
    setTab("dashboard");
    localStorage.setItem("app_tab", "dashboard");
  }
}, [adminSession, adminProfile, tab]);

useEffect(() => {
  if (!adminSession || tab !== "recruitingWaiting") return;

  const url = new URL(window.location.href);
  if (url.searchParams.get("tab") !== "recruitingWaiting") return;

  url.searchParams.delete("tab");
  url.hash = `ge-${encodeURIComponent(tab)}`;

  window.history.replaceState(
    {
      ...(window.history.state || {}),
      geTab: tab,
      geDepth: browserHistoryDepthRef.current,
    },
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}, [adminSession, tab]);

  const pricingCostTabs = [
    "listini",
    "punpsvAdmin",
    "systemCharges",
    "gasNetworkCharges",
  ];

  const databaseAdminTabs = [
    "agentManagement",
    "agents",
    ...pricingCostTabs,
    "recruitingManagement",
    "recruitingCrm",
  ];

  useEffect(() => {
    if (tab === "recruitingZones") {
      setTab("recruitingManagement");
      localStorage.setItem("app_tab", "recruitingManagement");
    }
  }, [tab]);

  useEffect(() => {
    // La barra Area Admin può esistere esclusivamente
    // sulla DASHBOARD. Qualunque altra scheda la chiude.
    if (tab !== "dashboard" && adminMenuOpen) {
      setAdminMenuOpen(false);
    }
  }, [tab, adminMenuOpen]);
  const adminTabs = ["dashboard", "calendarAdmin", "reportAdmin", "archive", "driveArchive", "recruiting", "recruitingWaiting", "appointments", "provvigioni", "personale", ...databaseAdminTabs, "adminUsers"];

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
    driveArchive: {
      title: "ARCHIVIO DRIVE",
      subtitle: "Consulta i file della cartella Google Drive collegata.",
      icon: "📁",
      variant: "drive",
    },
    recruiting: {
      title: "RECRUITING",
      subtitle: "Gestisci contatti, candidati e attività di recruiting.",
      icon: "👥",
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
    personale: {
      title: "PERSONALE",
      subtitle: "Gestisci ferie, permessi ed ex festività.",
      icon: "👤",
      variant: "personale",
    },
    reportAdmin: {
      title: "REPORT AGENTI",
      subtitle: "Analizza risultati, attività e performance della rete.",
      icon: "▤",
      variant: "agent-report",
    },
    agentManagement: {
      title: "GESTIONE AGENTI",
      subtitle: "Unifica accessi, email, Report, provvigioni, DM e zone in una sola anagrafica.",
      icon: "👥",
      variant: "database",
    },
    agents: {
      title: "IMPOSTAZIONI LOGIN · AVANZATE",
      subtitle: "Gestione avanzata degli account e creazione nuovi accessi.",
      icon: "⚙",
      variant: "database",
    },
    listini: {
      title: "LISTINI",
      subtitle: "Gestisci listini, offerte e parametri commerciali.",
      icon: "⚙",
      variant: "database",
    },
    punpsvAdmin: {
      title: "PUN-PSV ADMIN",
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
    systemCharges: {
      title: "DISP/CP MRK + ONERI DI SISTEMA",
      subtitle: "Consulta e aggiorna dispacciamento, Capacity Market, rete e oneri di sistema.",
      icon: "⚙",
      variant: "database",
    },
    gasNetworkCharges: {
      title: "RETE + ONERI GAS",
      subtitle: "Tariffe automatiche Gas per ambito, classe contatore e scaglioni ARERA.",
      icon: "🔥",
      variant: "database",
    },
    recruitingManagement: {
      title: "GESTIONE AGENTI ATTIVI / ZONE",
      subtitle: "Gestisci agenti attivi, macroaree e assegnazioni territoriali.",
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
      title: "IMPOSTAZIONI LOGIN · ADMIN",
      subtitle: "Gestisci gli amministratori della web app.",
      icon: "⚙",
      variant: "database",
    },
  };

  const currentAdminSection = pricingCostTabs.includes(tab)
    ? {
        title: "LISTINI E COSTI",
        subtitle:
          "Gestisci listini, prezzi di mercato e componenti di costo Energia e Gas.",
        icon: "⚙",
        variant: "database",
      }
    : adminSectionMeta[tab];
  const isAdminTab = adminTabs.includes(tab);
  const isSuperAdmin = adminProfile?.role === "super_admin";
  const canUseProvvigioni =
    isSuperAdmin ||
    (Boolean(adminSession) && getAdminDashboardPermissions(adminProfile).has("provvigioni")) ||
    Boolean(agentSession?.provvigioni_visible);
  const hasFullAdminAccess =
    isSuperAdmin ||
    (!Array.isArray(adminProfile?.dashboard_tabs) &&
      adminProfile?.full_access !== false);

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

const refreshDispCapacity = async (force = false) => {
  setDispCpRefreshing(true);
  try {
    const result = await fetchDispCapacityRows(force);
    setDispCpRows(result.rows);
    setDispCpMeta(result.meta);
    if (force) {
      const warning = result.meta.warnings.length
        ? "\n\nDettaglio anomalie:\n" + result.meta.warnings.join("\n")
        : "";
      const updated = result.meta.sourceStatus === "AGGIORNAMENTO_COMPLETO";
      const partiallyUpdated = result.meta.sourceStatus === "AGGIORNAMENTO_PARZIALE";
      const title = updated
        ? "Dispacciamento / Capacity: aggiornamento completo."
        : partiallyUpdated
          ? "VERIFICA PARZIALE: alcuni valori sono stati aggiornati, gli altri sono rimasti invariati."
          : "NESSUN AGGIORNAMENTO: mantenuti i valori storici di riferimento.";
      alert(title + warning);
    }
  } catch (error: any) {
    console.error("DISP CAPACITY UPDATE ERROR:", error);
    if (force) {
      alert(
        "Aggiornamento non riuscito. Rimangono in uso gli ultimi valori validi.\n\n" +
          (error?.message || error)
      );
    }
  } finally {
    setDispCpRefreshing(false);
  }
};

useEffect(() => {
  void refreshDispCapacity(false);

  const timer = window.setInterval(() => {
    void refreshDispCapacity(false);
  }, 6 * 60 * 60 * 1000);

  return () => window.clearInterval(timer);
}, []);

const refreshNetworkTariffs = async (force = false) => {
  setNetworkTariffRefreshing(true);
  try {
    const result = await fetchNetworkTariffRows(force);
    setNetworkTariffRows(result.rows);
    setNetworkTariffMeta(result.meta);
  } catch (error) {
    console.error("NETWORK TARIFF UPDATE ERROR:", error);
  } finally {
    setNetworkTariffRefreshing(false);
  }
};

useEffect(() => {
  void refreshNetworkTariffs(false);

  const timer = window.setInterval(() => {
    void refreshNetworkTariffs(false);
  }, 6 * 60 * 60 * 1000);

  return () => window.clearInterval(timer);
}, []);

const refreshGasNetworkTariffs = async (force = false) => {
  setGasNetworkTariffRefreshing(true);
  try {
    const result = await fetchGasNetworkTariffRows(force);
    setGasNetworkTariffRows(result.rows);
    setGasNetworkTariffMeta(result.meta);
    if (force) {
      const warning = result.meta.warnings.length
        ? "\n\n" + result.meta.warnings.join("\n")
        : "";
      alert("Rete + oneri Gas aggiornati." + warning);
    }
  } catch (error: any) {
    console.error("GAS NETWORK TARIFF UPDATE ERROR:", error);
    if (force) {
      alert(
        "Aggiornamento rete/oneri Gas non riuscito. Rimangono in uso gli ultimi valori validi.\n\n" +
          (error?.message || error)
      );
    }
  } finally {
    setGasNetworkTariffRefreshing(false);
  }
};

useEffect(() => {
  void refreshGasNetworkTariffs(false);

  const timer = window.setInterval(() => {
    void refreshGasNetworkTariffs(false);
  }, 6 * 60 * 60 * 1000);

  return () => window.clearInterval(timer);
}, []);

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

      if (Array.isArray(map.energyOffers)) {
        const obsoleteEnergyOfferNames = new Set(["CASA", "CASASPECIAL", "CASAUNICA", "CONDOMINI 10", "CONDOMINI 15", "CONDOMINI 5", "IMPRESA", "IMPRESASPECIAL", "IMPRESAUNICA", "SCELTA", "SCELTASPECIAL", "SCELTAUNICA", "SICURABUSINESS", "SICURADOMESTICO", "VALORE", "VALORESPECIAL", "VALOREUNICA"]);
        const savedEnergyOffers = (map.energyOffers as EnergyOffer[])
          .map((offer) => ({
            ...offer,
            visibile: offer.visibile !== false,
            provvigioneTipo:
              ["STANDARD", "UNICA", "SPECIAL"].includes(
                String(offer.provvigioneTipo || "")
              )
                ? (offer.provvigioneTipo as ProvvigioniOfferType)
                : getProvvigioniOfferType(offer.nome),
            allowedCustomerGroups:
              Array.isArray(offer.allowedCustomerGroups) &&
              offer.allowedCustomerGroups.some((group) =>
                ALL_ENERGY_CUSTOMER_GROUPS.includes(group)
              )
                ? offer.allowedCustomerGroups.filter((group) =>
                    ALL_ENERGY_CUSTOMER_GROUPS.includes(group)
                  )
                : [...ALL_ENERGY_CUSTOMER_GROUPS],
          }))
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
          .map((offer) => ({
            ...offer,
            visibile: offer.visibile !== false,
            provvigioneTipo:
              ["STANDARD", "UNICA", "SPECIAL"].includes(
                String(offer.provvigioneTipo || "")
              )
                ? (offer.provvigioneTipo as ProvvigioniOfferType)
                : getProvvigioniOfferType(offer.nome),
            allowedCustomerGroups:
              Array.isArray(offer.allowedCustomerGroups) &&
              offer.allowedCustomerGroups.some((group) =>
                ALL_GAS_CUSTOMER_GROUPS.includes(group)
              )
                ? offer.allowedCustomerGroups.filter((group) =>
                    ALL_GAS_CUSTOMER_GROUPS.includes(group)
                  )
                : ["DOMESTICO", "BUSINESS"],
          }))
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
              : requestedTab === "report"
                ? "report"
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
      {adminMenuOpen && tab === "dashboard" && (
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
          {canAdminAccessTab(adminProfile, "personale") && (
            <button onClick={() => setTab("personale")} style={{ ...baseBtn, ...(tab === "personale" ? activeBtn : {}) }}>PERSONALE</button>
          )}
          {canAdminAccessTab(adminProfile, "reportAdmin") && (
            <button onClick={() => setTab("reportAdmin")} style={{ ...baseBtn, ...(tab === "reportAdmin" ? activeBtn : {}) }}>REPORT ADMIN</button>
          )}
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
          className="ge-database-nav"
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
            onClick={() => setTab("agentManagement")}
            style={{
              ...baseBtn,
              padding: "9px 14px",
              ...(["agentManagement", "agents", "recruitingManagement"].includes(tab)
                ? activeBtn
                : {}),
            }}
          >
            GESTIONE AGENTI
          </button>

          <button
            onClick={() =>
              setTab(
                adminProfile?.role === "super_admin"
                  ? "listini"
                  : "systemCharges"
              )
            }
            style={{
              ...baseBtn,
              padding: "9px 14px",
              ...(pricingCostTabs.includes(tab)
                ? activeBtn
                : {}),
            }}
          >
            LISTINI E COSTI
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

      {hasFullAdminAccess &&
        pricingCostTabs.includes(tab) && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              background: "#ffffff",
              border: "1px solid #dbeafe",
              borderRadius: 12,
              padding: 10,
              marginTop: -6,
              boxShadow:
                "0 5px 16px rgba(15,23,42,.04)",
            }}
          >
            {adminProfile?.role === "super_admin" && (
              <button
                onClick={() => setTab("listini")}
                style={{
                  ...baseBtn,
                  padding: "8px 13px",
                  ...(tab === "listini"
                    ? activeBtn
                    : {}),
                }}
              >
                LISTINI
              </button>
            )}

            {adminProfile?.role === "super_admin" && (
              <button
                onClick={() => setTab("punpsvAdmin")}
                style={{
                  ...baseBtn,
                  padding: "8px 13px",
                  ...(tab === "punpsvAdmin"
                    ? activeBtn
                    : {}),
                }}
              >
                PUN-PSV ADMIN
              </button>
            )}

            <button
              onClick={() => setTab("systemCharges")}
              style={{
                ...baseBtn,
                padding: "8px 13px",
                ...(tab === "systemCharges"
                  ? activeBtn
                  : {}),
              }}
            >
              DISP/CP MRK + ONERI DI SISTEMA
            </button>

            <button
              onClick={() => setTab("gasNetworkCharges")}
              style={{
                ...baseBtn,
                padding: "8px 13px",
                ...(tab === "gasNetworkCharges"
                  ? activeBtn
                  : {}),
              }}
            >
              RETE + ONERI GAS
            </button>
          </div>
        )}

      {tab !== "dashboard" && currentAdminSection && (
        <SectionHero
          title={currentAdminSection.title}
          subtitle={currentAdminSection.subtitle}
          icon={currentAdminSection.icon}
          variant={currentAdminSection.variant}
          action={
            tab === "calendarAdmin" ? (
              <button
                type="button"
                className="ge-section-hero__today-button"
                onClick={() =>
                  window.dispatchEvent(
                    new Event("ge:calendar-focus-today")
                  )
                }
                title="Vai al giorno di oggi"
                aria-label="Vai al giorno di oggi"
              >
                👁
              </button>
            ) : undefined
          }
        />
      )}

      {tab === "dashboard" && (
        <AdminDashboard
          navigate={navigateTo}
          openEmail={openOutlookEmail}
          waitingIncomingCount={waitingRoomIncomingCount}
          waitingOutgoingCount={waitingRoomOutgoingCount}
          allowedTabs={getAdminDashboardPermissions(adminProfile)}
          showReportCard={Array.isArray(adminProfile?.dashboard_tabs) || adminProfile?.full_access === false}
        />
      )}

      {tab === "calendarAdmin" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Recruiting
            initialSection="calendar"
            hideNavigation
            onOpenContact={openRecruitingContactFromCalendar}
            onOpenAppointment={openAppointmentFromCalendar}
            onAddToAgents={openNewAgentFromRecruiting}
          />
        </div>
      )}

      {tab === "appointments" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Appointments
            openRequest={appointmentOpenRequest}
            onOpenRequestConsumed={() =>
              setAppointmentOpenRequest(null)
            }
          />
        </div>
      )}

      {tab === "personale" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Personale ownerKey={adminProfile?.auth_id || adminProfile?.username || "personale"} />
        </div>
      )}

      {tab === "driveArchive" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <DriveArchive />
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
          <Recruiting
            key={`recruiting-${recruitingEntrySection}`}
            initialSection={recruitingEntrySection}
            onAddToAgents={openNewAgentFromRecruiting}
          />
        </div>
      )}

      {tab === "recruitingWaiting" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <Recruiting
            initialSection="hr_notes"
            onAddToAgents={openNewAgentFromRecruiting}
          />
        </div>
      )}

      {tab === "agentManagement" && (
        <div style={{ width: "100%", minWidth: 0 }}>
          <UnifiedAgentManagement
            adminProfile={adminProfile}
            onOpenEmailMatches={openOutlookEmailMatches}
            onOpenZones={() => setTab("recruitingManagement")}
            onOpenAdminManagement={() => {
              const section = document.getElementById(
                "ge-admin-users-manager"
              ) as HTMLDetailsElement | null;
              if (!section) return;
              section.open = true;
              window.requestAnimationFrame(() => {
                section.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              });
            }}
          />

          {adminProfile?.role === "super_admin" && (
            <details
              id="ge-admin-users-manager"
              style={{
                marginTop: 14,
                background: "#faf5ff",
                border: "1px solid #ddd6fe",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  padding: "13px 16px",
                  fontWeight: 950,
                  color: "#5b21b6",
                  userSelect: "none",
                }}
              >
                👤 GESTIONE ADMIN · CREA E MODIFICA AMMINISTRATORI
              </summary>
              <div style={{ padding: "0 12px 12px" }}>
                <AdminUsersManager adminProfile={adminProfile} />
              </div>
            </details>
          )}
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
          <Recruiting
            initialSection="crm_management"
            hideNavigation
            onAddToAgents={openNewAgentFromRecruiting}
          />
        </div>
      )}

      {tab === "systemCharges" && (
        <SystemChargesAdmin
          dispCpRows={dispCpRows}
          dispCpMeta={dispCpMeta}
          dispCpRefreshing={dispCpRefreshing}
          onRefreshDispCapacity={() => refreshDispCapacity(true)}
          networkTariffRows={networkTariffRows}
          networkTariffMeta={networkTariffMeta}
          networkTariffRefreshing={networkTariffRefreshing}
          onRefreshNetworkTariffs={() => refreshNetworkTariffs(true)}
          superAdmin={isSuperAdmin}
        />
      )}

      {tab === "gasNetworkCharges" && (
        <GasNetworkChargesAdmin
          rows={gasNetworkTariffRows}
          meta={gasNetworkTariffMeta}
          refreshing={gasNetworkTariffRefreshing}
          onRefresh={() => refreshGasNetworkTariffs(true)}
        />
      )}

      {tab === "listini" && (
        <Listini
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
          <h2 style={{ marginTop: 0 }}>PUN-PSV Admin</h2>

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
    {savingSettings ? "Salvataggio..." : "Salva PUN-PSV"}
  </button>
</div>

          <div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={thStyle}>Mese</th>
        <th
          style={{
            ...thStyle,
            background: "#ffedd5",
            color: "#c2410c",
          }}
        >
          F0
        </th>
        <th
          style={{
            ...thStyle,
            background: "#f97316",
            color: "#ffffff",
          }}
        >
          F1
        </th>
        <th
          style={{
            ...thStyle,
            background: "#f97316",
            color: "#ffffff",
          }}
        >
          F2
        </th>
        <th
          style={{
            ...thStyle,
            background: "#f97316",
            color: "#ffffff",
          }}
        >
          F3
        </th>
        <th
          style={{
            ...thStyle,
            background: "#e0f2fe",
            color: "#0369a1",
          }}
        >
          PSV
        </th>
      </tr>
    </thead>
    <tbody>
      {punPsvRows
        .filter((row) => {
          if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS" || row.mese === "FISSO AD HOC") return true;
          return row.mese.endsWith(String(selectedYear));
        })
        .map((row) => {
          const isFirstFixed = row.mese === "FISSO DOMESTICO";
          const isLastFixed = row.mese === "FISSO AD HOC";
          const isFixed =
            row.mese === "FISSO DOMESTICO" ||
            row.mese === "FISSO BUSINESS" ||
            row.mese === "FISSO AD HOC";

          const fixedBandBase = isFixed
            ? {
                borderTop: isFirstFixed
                  ? "3px solid #dc2626"
                  : undefined,
                borderBottom: isLastFixed
                  ? "3px solid #dc2626"
                  : tdStyle.borderBottom,
              }
            : {};

          return (
            <tr key={row.mese}>
              <td
                style={{
                  ...tdStyle,
                  ...fixedBandBase,
                  borderLeft: isFixed
                    ? "3px solid #dc2626"
                    : undefined,
                }}
              >
                <div>{row.mese}</div>
                {(row.mese === "FISSO DOMESTICO" ||
                  row.mese === "FISSO BUSINESS") && (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#64748b",
                    }}
                  >
                    (senza perdite)
                  </div>
                )}
              </td>

              <td
                style={{
                  ...tdStyle,
                  ...fixedBandBase,
                  background: "#fff7ed",
                }}
              >
                <input
                  type="number"
                  step="0.000001"
                  value={row.mono}
                  onChange={(e) =>
                    updatePunPsvValue(row.mese, "mono", e.target.value)
                  }
                  style={{
                    ...inputStyle,
                    background: "#fff7ed",
                    borderColor: "#fdba74",
                  }}
                />
              </td>

              <td
                style={{
                  ...tdStyle,
                  ...fixedBandBase,
                  background: "#ffedd5",
                }}
              >
                <input
                  type="number"
                  step="0.000001"
                  value={row.f1}
                  onChange={(e) =>
                    updatePunPsvValue(row.mese, "f1", e.target.value)
                  }
                  style={{
                    ...inputStyle,
                    background: "#ffedd5",
                    borderColor: "#fb923c",
                  }}
                />
              </td>

              <td
                style={{
                  ...tdStyle,
                  ...fixedBandBase,
                  background: "#ffedd5",
                }}
              >
                <input
                  type="number"
                  step="0.000001"
                  value={row.f2}
                  onChange={(e) =>
                    updatePunPsvValue(row.mese, "f2", e.target.value)
                  }
                  style={{
                    ...inputStyle,
                    background: "#ffedd5",
                    borderColor: "#fb923c",
                  }}
                />
              </td>

              <td
                style={{
                  ...tdStyle,
                  ...fixedBandBase,
                  background: "#ffedd5",
                }}
              >
                <input
                  type="number"
                  step="0.000001"
                  value={row.f3}
                  onChange={(e) =>
                    updatePunPsvValue(row.mese, "f3", e.target.value)
                  }
                  style={{
                    ...inputStyle,
                    background: "#ffedd5",
                    borderColor: "#fb923c",
                  }}
                />
              </td>

              <td
                style={{
                  ...tdStyle,
                  ...fixedBandBase,
                  background: "#f0f9ff",
                  borderRight: isFixed
                    ? "3px solid #dc2626"
                    : undefined,
                }}
              >
                <input
                  type="number"
                  step="0.000001"
                  value={row.psv}
                  onChange={(e) =>
                    updatePunPsvValue(row.mese, "psv", e.target.value)
                  }
                  style={{
                    ...inputStyle,
                    background: "#e0f2fe",
                    borderColor: "#7dd3fc",
                  }}
                />
              </td>
            </tr>
          );
        })}
    </tbody>
  </table>
</div>
        </div>
      )}
    </div>
  );
};
const hasAgentResetLink =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has(
    "agent-reset"
  );

if (hasAgentResetLink || (!agentSession && !adminSession)) {
  return (
    <LoginView
      setSession={setAdminSession}
      setAdminProfile={setAdminProfile}
      setAgentSession={setAgentSession}
        onLoginSuccess={() => {
          const requestedTab =
            new URLSearchParams(window.location.search).get("tab");
          const nextTab =
            requestedTab === "report" ? "report" : "dashboard";
          setTab(nextTab);
          localStorage.setItem("app_tab", nextTab);
        }}
      />
  );
}
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 20 }}>
      <div className="ge-brand-shell" style={{ position: "relative" }}>
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

        {(agentSession || adminSession) && (
          <button
            type="button"
            className="ge-brand-logout"
            style={{
              position: "absolute",
              zIndex: 20,
              top: 10,
              right: 12,
              minWidth: 54,
              padding: "7px 10px",
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,.9)",
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              lineHeight: 1,
              fontWeight: 900,
              boxShadow: "0 4px 10px rgba(127,29,29,.22)",
              cursor: "pointer",
            }}
            onClick={() => {
              void adminLogout();
              void agentLogout();
              localStorage.removeItem("admin_session");
              localStorage.removeItem("agent_session");
              setAdminSession(null);
              setAdminProfile(null);
              setAgentSession(null);
              setAdminMenuOpen(false);
              setTab("energia");
              localStorage.removeItem("app_tab");
            }}
            aria-label="Esci"
            title="Esci"
          >
            ESCI
          </button>
        )}

        {adminSession && (canAdminAccessTab(adminProfile, "calendarAdmin") ||
          canAdminAccessTab(adminProfile, "recruiting") ||
          canAdminAccessTab(adminProfile, "email")) && (
          <div
            className="ge-brand-quick-actions"
            style={{
              position: "absolute",
              zIndex: 19,
              right: 142,
              bottom: 11,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            {canAdminAccessTab(adminProfile, "calendarAdmin") && (
            <button
              type="button"
              title="Calendario"
              aria-label="Apri Calendario"
              onClick={() => navigateTo("calendarAdmin")}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border:
                  tab === "calendarAdmin"
                    ? "2px solid #ffffff"
                    : "1px solid rgba(255,255,255,.72)",
                background:
                  tab === "calendarAdmin"
                    ? "rgba(255,255,255,.30)"
                    : "rgba(255,255,255,.16)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                padding: 0,
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                boxShadow: "0 3px 9px rgba(15,23,42,.16)",
              }}
            >
              📅
            </button>
            )}

            {canAdminAccessTab(adminProfile, "recruiting") && (
            <button
              type="button"
              title="Recruiting"
              aria-label="Apri Recruiting"
              onClick={() => navigateTo("recruiting")}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border:
                  tab === "recruiting"
                    ? "2px solid #ffffff"
                    : "1px solid rgba(255,255,255,.72)",
                background:
                  tab === "recruiting"
                    ? "rgba(255,255,255,.30)"
                    : "rgba(255,255,255,.16)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                padding: 0,
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                boxShadow: "0 3px 9px rgba(15,23,42,.16)",
              }}
            >
              👥
            </button>
            )}

            {canAdminAccessTab(adminProfile, "email") && (
            <button
              type="button"
              title="Invio Email"
              aria-label="Apri Invio Email"
              onClick={openOutlookEmail}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.72)",
                background: "rgba(255,255,255,.16)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                padding: 0,
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                boxShadow: "0 3px 9px rgba(15,23,42,.16)",
              }}
            >
              ✉️
            </button>
            )}

          </div>
        )}

        {adminProfile?.role === "super_admin" && (
          <button
            type="button"
            className="ge-brand-waiting"
            style={{
              position: "absolute",
              zIndex: 19,
              right: 12,
              bottom: 10,
              top: "auto",
              transform: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "auto",
              padding: 0,
              border: 0,
              background: "transparent",
            }}
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
          alignItems: "center",
          gap: 7,
          marginBottom: 16,
          flexWrap: "wrap",
          width: "100%",
        }}
      >
        <div
          className="ge-main-nav__primary"
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {(!adminSession || canAdminAccessTab(adminProfile, "energia")) && (
          <button
            onClick={() => navigateTo("energia")}
            style={{
              ...mainNavBtn,
              ...(tab === "energia" ? activeBtn : {}),
            }}
          >
            <span className="ge-main-nav__label-desktop">Energia</span>
            <span className="ge-main-nav__label-mobile">ENERGIA</span>
          </button>
          )}

          {(!adminSession || canAdminAccessTab(adminProfile, "gas")) && (
          <button
            onClick={() => navigateTo("gas")}
            style={{
              ...mainNavBtn,
              ...(tab === "gas" ? activeBtn : {}),
            }}
          >
            <span className="ge-main-nav__label-desktop">Gas</span>
            <span className="ge-main-nav__label-mobile">GAS</span>
          </button>
          )}

          {(!adminSession || canAdminAccessTab(adminProfile, "report")) && (
          <button
            onClick={() => navigateTo("report")}
            style={{
              ...mainNavBtn,
              ...(tab === "report" ? activeBtn : {}),
            }}
          >
            <span className="ge-main-nav__label-desktop">Report</span>
            <span className="ge-main-nav__label-mobile">REPORT</span>
          </button>
          )}

          {(!adminSession || canAdminAccessTab(adminProfile, "punpsvPublic")) && (
          <button
            onClick={() => navigateTo("punpsvPublic")}
            style={{
              ...mainNavBtn,
              ...(tab === "punpsvPublic" ? activeBtn : {}),
            }}
          >
            <span className="ge-main-nav__label-desktop">PUN-PSV</span>
            <span className="ge-main-nav__label-mobile">PUN</span>
          </button>
          )}

          {(!adminSession || canAdminAccessTab(adminProfile, "ateco")) && (
          <button
            onClick={() => navigateTo("ateco")}
            style={{
              ...mainNavBtn,
              ...(tab === "ateco" ? activeBtn : {}),
            }}
          >
            <span className="ge-main-nav__label-desktop">ATECO</span>
            <span className="ge-main-nav__label-mobile">ATECO</span>
          </button>
          )}

          {(!adminSession || canAdminAccessTab(adminProfile, "driveArchive")) && (
          <button
            onClick={() => navigateTo("driveArchive")}
            style={{
              ...mainNavBtn,
              ...(tab === "driveArchive" ? activeBtn : {}),
            }}
          >
            <span className="ge-main-nav__label-desktop">ARCHIVIO</span>
            <span className="ge-main-nav__label-mobile">ARCH.</span>
          </button>
          )}

        </div>

        <div
          className="ge-main-nav__actions"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginLeft: "auto",
            flexWrap: "nowrap",
          }}
        >
          {adminSession && (
            <button
              type="button"
              onClick={toggleAdminMenu}
              style={{
                ...baseBtn,
                ...(adminMenuOpen &&
                tab === "dashboard"
                  ? activeBtn
                  : {}),
              }}
            >
              <span className="ge-main-nav__label-desktop">Area Admin</span>
              <span className="ge-main-nav__label-mobile">ADMIN</span>
            </button>
          )}

          {adminSession && hasFullAdminAccess && (
            <button
              type="button"
              className="ge-main-nav__reload"
              title="Ricarica pagina"
              aria-label="Ricarica pagina"
              onClick={() => window.location.reload()}
              style={{
                ...baseBtn,
                width: 42,
                height: 42,
                padding: 0,
                display: "grid",
                placeItems: "center",
                fontSize: 22,
                lineHeight: 1,
                color: "#64748b",
                background: "#e2e8f0",
                border: "1px solid #cbd5e1",
                fontWeight: 900,
              }}
            >
              ↻
            </button>
          )}

          {adminSession && hasFullAdminAccess && (
            <button
              type="button"
              className="ge-main-nav__settings"
              title="IMPOSTAZIONI LOGIN"
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
                fontFamily:
                  "Arial, 'Segoe UI Symbol', sans-serif",
                fontWeight: 900,
              }}
            >
              ⚙
            </button>
          )}
        </div>
      </div>
  
  
{adminSession && adminProfile && !canAdminAccessTab(adminProfile, tab) ? (
  <div style={{ padding: 24, background: "white", borderRadius: 12, color: "#991b1b", fontWeight: 800 }}>
    Non hai accesso a questa scheda. Ritorno alla dashboard.
  </div>
) : tab === "dashboard" ? (
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
      networkTariffRows={networkTariffRows}
      showAgentAssociation={Boolean(adminSession)}
      canUseProvvigioni={canUseProvvigioni}
      onOpenProvvigioni={openProvvigioniFromSimulation}
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
      gasNetworkTariffRows={gasNetworkTariffRows}
      showAgentAssociation={Boolean(adminSession)}
      canUseProvvigioni={canUseProvvigioni}
      onOpenProvvigioni={openProvvigioniFromSimulation}
    />
  </>
) : tab === "driveArchive" ? (
  <>
    <SectionHero
      title="ARCHIVIO DRIVE"
      subtitle="Consulta documenti e file condivisi da Google Drive."
      icon="📁"
      variant="drive"
    />
    <DriveArchive />
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
        ) : tab === "provvigioni" && canUseProvvigioni ? (
          <>
            <SectionHero
              title="PROVVIGIONI"
              subtitle="Consulta e calcola le provvigioni commerciali."
              icon="💰"
              variant="energy"
            />
            <Provvigioni
              prefill={provvigioniPrefill}
              onPrefillConsumed={() => setProvvigioniPrefill(null)}
            />
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
              title="PUN-PSV"
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
  onChange={(e)=> selectPunPsvMonth(e.target.value)}
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
                  onClick={resetPunPsvToCurrentMonth}
                  title="Torna al mese corrente"
                  aria-label="Torna al mese corrente"
                  style={{
                    width: 44,
                    height: 44,
                    padding: 0,
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    color: "#334155",
                    fontSize: 22,
                    fontWeight: 900,
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  ↩
                </button>
        
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

                <button
                  type="button"
                  onClick={exportPunPsvThreePagePdf}
                  style={{
                    background: "#0f172a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 18px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  PDF 3 PAGINE
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
    paddingBottom: "8px"
  }}
>
              <div
                className="pun-psv-chart-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: punPsvView === "both" ? "1fr 1fr" : "1fr",
                  gap: 20,
                  marginBottom: 10,
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
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                    <h3 style={{ marginTop: 0, marginBottom: 16 }}>Andamento PUN</h3>
        
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 14,
                        minHeight: 38,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 34,
                          padding: "7px 11px",
                          borderRadius: 10,
                          background: "#ff9f1c",
                          color: "#111827",
                          fontSize: 13,
                          fontWeight: 900,
                          boxShadow: "0 0 0 2px rgba(255,159,28,.18)",
                        }}
                      >
                        Mese selezionato: {latestPunPsvMonthLabel}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 34,
                          padding: "7px 11px",
                          borderRadius: 10,
                          background: "#ff9f1c",
                          color: "#111827",
                          fontSize: 13,
                          fontWeight: 900,
                          boxShadow: "0 0 0 2px rgba(255,159,28,.18)",
                        }}
                      >
                        {latestPun}
                      </span>
                    </div>
        
                    <svg
                      viewBox="0 0 760 240"
                      onClick={() => openExpandedMarketChart("pun")}
                      title="Apri grafico PUN"
                      style={{
                        width: "100%",
                        height: 280,
                        display: "block",
                        cursor: "zoom-in",
                      }}
                    >
                      <defs>
                        <linearGradient id="punAreaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.38" />
                          <stop offset="100%" stopColor="#fb923c" stopOpacity="0.03" />
                        </linearGradient>
                        <filter id="punGlow" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

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
        
                      <polygon
                        points={`${punPolyline} 732,180 28,180`}
                        fill="url(#punAreaGradient)"
                      />

                      <polyline
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={punPolyline}
                        filter="url(#punGlow)"
                      />

                      {punCoords.map((p, i) => {
                        const isSelected = i === selectedChartIndex;
                        return (
                          <g key={i}>
                            {isSelected && (
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="14"
                                fill="rgba(249,115,22,.16)"
                                stroke="#fb923c"
                                strokeWidth="2"
                              />
                            )}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isSelected ? 8 : 5.5}
                              fill="#ffffff"
                              stroke="#f97316"
                              strokeWidth={isSelected ? 4 : 2.5}
                            />
                          </g>
                        );
                      })}
        
                      {punCoords.map((p, i) => (
                        <text
                        key={"m" + i}
                        x={p.x}
                        y="205"
                        textAnchor="middle"
                        fontSize="15"
                        fill={i === selectedChartIndex ? "#c2410c" : "#64748b"}
                        fontWeight={i === selectedChartIndex ? "900" : "500"}
                        >
                        <>
                          <tspan x={p.x} dy="0">
                            {(monthLabels[i] || "").toUpperCase()}
                          </tspan>
                      
                          <tspan x={p.x} dy="16">
                          {chartYearLabels[i]}
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
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                    <h3 style={{ marginTop: 0, marginBottom: 16 }}>Andamento PSV</h3>
        
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 14,
                        minHeight: 38,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 34,
                          padding: "7px 11px",
                          borderRadius: 10,
                          background: "#67e8f9",
                          color: "#0f172a",
                          fontSize: 13,
                          fontWeight: 900,
                          boxShadow: "0 0 0 2px rgba(103,232,249,.20)",
                        }}
                      >
                        Mese selezionato: {latestPunPsvMonthLabel}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 34,
                          padding: "7px 11px",
                          borderRadius: 10,
                          background: "#67e8f9",
                          color: "#0f172a",
                          fontSize: 13,
                          fontWeight: 900,
                          boxShadow: "0 0 0 2px rgba(103,232,249,.20)",
                        }}
                      >
                        {latestPsv}
                      </span>
                    </div>
        
                    <svg
                      viewBox="0 0 760 240"
                      onClick={() => openExpandedMarketChart("psv")}
                      title="Apri grafico PSV"
                      style={{
                        width: "100%",
                        height: 280,
                        display: "block",
                        cursor: "zoom-in",
                      }}
                    >
                      <defs>
                        <linearGradient id="psvAreaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
                        </linearGradient>
                        <filter id="psvGlow" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

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
        
                      <polygon
                        points={`${psvPolyline} 732,180 28,180`}
                        fill="url(#psvAreaGradient)"
                      />

                      <polyline
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={psvPolyline}
                        filter="url(#psvGlow)"
                      />

                      {psvCoords.map((p, i) => {
                        const isSelected = i === selectedChartIndex;
                        return (
                          <g key={i}>
                            {isSelected && (
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="14"
                                fill="rgba(14,165,233,.15)"
                                stroke="#38bdf8"
                                strokeWidth="2"
                              />
                            )}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isSelected ? 8 : 5.5}
                              fill="#ffffff"
                              stroke="#0ea5e9"
                              strokeWidth={isSelected ? 4 : 2.5}
                            />
                          </g>
                        );
                      })}
        
                      {psvCoords.map((p, i) => (
                        <text
                        key={"psv" + i}
                        x={p.x}
                        y="205"
                        textAnchor="middle"
                        fontSize="15"
                        fill={i === selectedChartIndex ? "#0369a1" : "#64748b"}
                      fontWeight={i === selectedChartIndex ? "900" : "500"}
                      >
                        <>
                          <tspan x={p.x} dy="0">
                            {(monthLabels[i] || "").toUpperCase()}
                          </tspan>
                      
                          <tspan x={p.x} dy="16">
                          {chartYearLabels[i]}
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


{/* TABELLE MESI */}
<div
  ref={punPsvTableRef}
  style={{
    width: "100%",
    maxWidth: "100%",
    margin: "0 auto",
  }}
>
  <div
    className="pun-psv-table-grid"
    style={{
      display: "grid",
      gridTemplateColumns:
        punPsvView === "both"
          ? "minmax(0, 1fr) minmax(0, 1fr)"
          : "minmax(0, 1fr)",
      gap: 20,
      alignItems: "start",
      justifyContent: "stretch",
    }}
  >
    {(punPsvView === "both" || punPsvView === "pun") && (
      <div
        style={{
          overflow: "hidden",
          borderRadius: 16,
          border: "1px solid rgba(249,115,22,.22)",
          background:
            "linear-gradient(180deg, rgba(255,247,237,.96) 0%, rgba(255,255,255,.98) 28%)",
          boxShadow:
            "0 10px 28px rgba(249,115,22,.08), 0 0 0 2px rgba(251,146,60,.05)",
          width: "100%",
          maxWidth: punPsvView === "both" ? "none" : 900,
          justifySelf: punPsvView === "both" ? "stretch" : "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(249,115,22,.16)",
            background:
              "linear-gradient(90deg, rgba(249,115,22,.14), rgba(251,146,60,.04))",
          }}
        >
          <div>
            <div
              style={{
                color: "#9a3412",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              ENERGIA
            </div>
            <div
              style={{
                marginTop: 2,
                color: "#0f172a",
                fontSize: 17,
                fontWeight: 900,
              }}
            >
              Valori PUN
            </div>
          </div>
          <span
            style={{
              padding: "6px 9px",
              borderRadius: 999,
              background: "#ffedd5",
              color: "#c2410c",
              fontSize: 11,
              fontWeight: 900,
              boxShadow: "0 0 14px rgba(249,115,22,.12)",
            }}
          >
            12 MESI
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              background: "transparent",
              minWidth: 620,
            }}
          >
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "17.5%" }} />
              <col style={{ width: "17.5%" }} />
              <col style={{ width: "17.5%" }} />
              <col style={{ width: "17.5%" }} />
            </colgroup>
            <thead>
              <tr>
                {["Mese", "PUN F0", "F1", "F2", "F3"].map((label, index) => (
                  <th
                    key={label}
                    style={{
                      padding: "9px 10px",
                      textAlign: index === 0 ? "left" : "right",
                      color: index === 0 ? "#7c2d12" : "#c2410c",
                      background:
                        index === 0
                          ? "rgba(249,115,22,.10)"
                          : index === 1
                          ? "#ffedd5"
                          : "rgba(251,146,60,.07)",
                      borderBottom: "1px solid rgba(249,115,22,.16)",
                      fontSize: 11,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tablePunPsvRows.slice(0, 12).map((row, index) => {
                const isSelected =
                  normalizeMonthLabel(row.mese) === normalizeMonthLabel(activePunPsvMonth);
                return (
                <tr
                  key={row.mese}
                  onClick={() => selectPunPsvMonth(row.mese)}
                  title="Seleziona questo mese"
                  style={{
                    cursor: "pointer",
                    background: isSelected
                      ? "#fff3e8"
                      : index % 2 === 0
                        ? "rgba(255,255,255,.84)"
                        : "rgba(255,247,237,.64)",
                    boxShadow: isSelected
                      ? "inset 0 0 0 2px #f97316, 0 0 12px rgba(249,115,22,.12)"
                      : "none",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid rgba(226,232,240,.82)",
                      color: "#334155",
                      fontWeight: 750,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.mese}
                  </td>
                  {[row.mono, row.f1, row.f2, row.f3].map((value, valueIndex) => (
                    <td
                      key={valueIndex}
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        borderBottom: "1px solid rgba(226,232,240,.82)",
                        color: valueIndex === 0 ? "#ea580c" : "#475569",
                        background:
                          valueIndex === 0 ? "rgba(255,237,213,.72)" : "transparent",
                        fontWeight: valueIndex === 0 ? 850 : 650,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {Number(value || 0).toFixed(3)}
                    </td>
                  ))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {(punPsvView === "both" || punPsvView === "psv") && (
      <div
        style={{
          overflow: "hidden",
          borderRadius: 16,
          border: "1px solid rgba(14,165,233,.22)",
          background:
            "linear-gradient(180deg, rgba(240,249,255,.96) 0%, rgba(255,255,255,.98) 28%)",
          boxShadow:
            "0 10px 28px rgba(14,165,233,.08), 0 0 0 2px rgba(56,189,248,.05)",
          width: "100%",
          maxWidth: punPsvView === "both" ? "none" : 560,
          justifySelf: punPsvView === "both" ? "stretch" : "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(14,165,233,.16)",
            background:
              "linear-gradient(90deg, rgba(14,165,233,.14), rgba(103,232,249,.04))",
          }}
        >
          <div>
            <div
              style={{
                color: "#0369a1",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              GAS
            </div>
            <div
              style={{
                marginTop: 2,
                color: "#0f172a",
                fontSize: 17,
                fontWeight: 900,
              }}
            >
              Valori PSV
            </div>
          </div>
          <span
            style={{
              padding: "6px 9px",
              borderRadius: 999,
              background: "#cffafe",
              color: "#0369a1",
              fontSize: 11,
              fontWeight: 900,
              boxShadow: "0 0 14px rgba(14,165,233,.12)",
            }}
          >
            12 MESI
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              background: "transparent",
            }}
          >
            <colgroup>
              <col style={{ width: "58%" }} />
              <col style={{ width: "42%" }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  style={{
                    padding: "9px 10px",
                    textAlign: "left",
                    color: "#075985",
                    background: "rgba(14,165,233,.10)",
                    borderBottom: "1px solid rgba(14,165,233,.16)",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  Mese
                </th>
                <th
                  style={{
                    padding: "9px 10px",
                    textAlign: "right",
                    color: "#0284c7",
                    background: "#e0f2fe",
                    borderBottom: "1px solid rgba(14,165,233,.16)",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  PSV
                </th>
              </tr>
            </thead>
            <tbody>
              {tablePunPsvRows.slice(0, 12).map((row, index) => {
                const isSelected =
                  normalizeMonthLabel(row.mese) === normalizeMonthLabel(activePunPsvMonth);
                return (
                <tr
                  key={row.mese}
                  onClick={() => selectPunPsvMonth(row.mese)}
                  title="Seleziona questo mese"
                  style={{
                    cursor: "pointer",
                    background: isSelected
                      ? "#eef9ff"
                      : index % 2 === 0
                        ? "rgba(255,255,255,.84)"
                        : "rgba(240,249,255,.70)",
                    boxShadow: isSelected
                      ? "inset 0 0 0 2px #0ea5e9, 0 0 12px rgba(14,165,233,.12)"
                      : "none",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid rgba(226,232,240,.82)",
                      color: "#334155",
                      fontWeight: 750,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.mese}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      textAlign: "right",
                      borderBottom: "1px solid rgba(226,232,240,.82)",
                      color: "#0284c7",
                      background: "rgba(224,242,254,.78)",
                      fontWeight: 850,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {Number(row.psv || 0).toFixed(6)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>

</div>


{expandedMarketChart && (
  <div
    onClick={() => setExpandedMarketChart(null)}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100000,
      background: "rgba(15,23,42,.30)",
      pointerEvents: "auto",
    }}
  >
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "min(1120px, 94vw)",
        maxHeight: "90vh",
        transform: `translate(calc(-50% + ${marketChartOffset.x}px), calc(-50% + ${marketChartOffset.y}px))`,
        background: "#ffffff",
        border:
          expandedMarketChart === "pun"
            ? "2px solid rgba(249,115,22,.40)"
            : "2px solid rgba(14,165,233,.40)",
        borderRadius: 18,
        boxShadow: "0 28px 70px rgba(15,23,42,.34)",
        overflow: "hidden",
      }}
    >
      <div
        onPointerDown={startMarketChartDrag}
        onPointerMove={moveMarketChartDrag}
        onPointerUp={stopMarketChartDrag}
        onPointerCancel={stopMarketChartDrag}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          background:
            expandedMarketChart === "pun"
              ? "linear-gradient(90deg,#fff7ed,#ffffff)"
              : "linear-gradient(90deg,#f0f9ff,#ffffff)",
          borderBottom:
            expandedMarketChart === "pun"
              ? "1px solid rgba(249,115,22,.22)"
              : "1px solid rgba(14,165,233,.22)",
          cursor: "move",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 950,
              color: "#0f172a",
            }}
          >
            {expandedMarketChart === "pun"
              ? "Andamento PUN"
              : "Andamento PSV"}
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>
            Trascina questa barra per spostare la finestra
          </div>
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setExpandedMarketChart(null)}
          style={{
            border: 0,
            borderRadius: 9,
            padding: "9px 13px",
            background: "#ef4444",
            color: "#fff",
            fontSize: 12,
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          CHIUDI
        </button>
      </div>

      <div
        style={{
          padding: "14px 16px 18px",
          overflow: "auto",
          maxHeight: "calc(90vh - 70px)",
          background:
            expandedMarketChart === "pun"
              ? "linear-gradient(180deg,#fffaf5,#ffffff)"
              : "linear-gradient(180deg,#f5fbff,#ffffff)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              padding: "7px 10px",
              borderRadius: 9,
              background:
                expandedMarketChart === "pun" ? "#ffedd5" : "#cffafe",
              color:
                expandedMarketChart === "pun" ? "#c2410c" : "#0369a1",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            Mese selezionato: {latestPunPsvMonthLabel}
          </span>
          <span
            style={{
              padding: "7px 10px",
              borderRadius: 9,
              background:
                expandedMarketChart === "pun" ? "#fb923c" : "#0ea5e9",
              color: "#fff",
              fontSize: 13,
              fontWeight: 950,
            }}
          >
            {expandedMarketChart === "pun" ? latestPun : latestPsv}
          </span>
        </div>

        <svg
          viewBox="0 0 760 240"
          style={{
            width: "100%",
            height: "min(620px, 64vh)",
            minHeight: 360,
            display: "block",
          }}
        >
          <defs>
            <linearGradient
              id="expandedPunGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.40" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient
              id="expandedPsvGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.40" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
            </linearGradient>
          </defs>

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

          <polygon
            points={`${
              expandedMarketChart === "pun"
                ? punPolyline
                : psvPolyline
            } 732,180 28,180`}
            fill={
              expandedMarketChart === "pun"
                ? "url(#expandedPunGradient)"
                : "url(#expandedPsvGradient)"
            }
          />

          <polyline
            fill="none"
            stroke={
              expandedMarketChart === "pun" ? "#f97316" : "#0ea5e9"
            }
            strokeWidth={expandedMarketChart === "pun" ? 6 : 5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={
              expandedMarketChart === "pun"
                ? punPolyline
                : psvPolyline
            }
          />

          {(expandedMarketChart === "pun"
            ? punCoords
            : psvCoords
          ).map((p, i, arr) => {
            const isSelected = i === selectedChartIndex;
            const value =
              expandedMarketChart === "pun"
                ? punValues[i]
                : psvValues[i];

            return (
              <g key={i}>
                {isSelected && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="14"
                    fill={
                      expandedMarketChart === "pun"
                        ? "rgba(249,115,22,.15)"
                        : "rgba(14,165,233,.15)"
                    }
                    stroke={
                      expandedMarketChart === "pun"
                        ? "#fb923c"
                        : "#38bdf8"
                    }
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 8 : 5.5}
                  fill="#ffffff"
                  stroke={
                    expandedMarketChart === "pun"
                      ? "#f97316"
                      : "#0ea5e9"
                  }
                  strokeWidth={isSelected ? 4 : 2.5}
                />
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  fontSize="13"
                  fill="#111111"
                  fontWeight="700"
                >
                  {Number(value || 0).toFixed(3)}
                </text>
                <text
                  x={p.x}
                  y="205"
                  textAnchor="middle"
                  fontSize="13"
                  fill="#64748b"
                >
                  <tspan x={p.x} dy="0">
                    {(monthLabels[i] || "").toUpperCase()}
                  </tspan>
                  <tspan x={p.x} dy="15">
                    {chartYearLabels[i]}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  </div>
)}

{/* LAYOUT DEDICATO EXPORT PDF A4 ORIZZONTALE */}
<div
  ref={punPsvPdfLayoutRef}
  aria-hidden="true"
  style={{
    position: "fixed",
    left: "-20000px",
    top: 0,
    width: 1400,
    height: 990,
    padding: "22px 26px 24px",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#0f172a",
    fontFamily: "Arial, Helvetica, sans-serif",
    overflow: "hidden",
  }}
>
  <div
    style={{
      height: 92,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    }}
  >
    <img
      src="/logo-piuenergia.svg"
      alt="+energia"
      style={{
        width: 250,
        height: 66,
        objectFit: "contain",
        display: "block",
      }}
    />
    <div
      style={{
        marginTop: -4,
        fontSize: 26,
        lineHeight: 1.08,
        fontWeight: 900,
        color: "#10234b",
        textAlign: "center",
      }}
    >
      {punPsvPdfMode === "pun"
        ? "Andamento PUN"
        : punPsvPdfMode === "psv"
        ? "Andamento PSV"
        : "Andamento PUN e PSV"}{" "}
      {latestPunPsvMonthLabel}
    </div>
  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        punPsvPdfMode === "both" ? "1fr 1fr" : "1fr",
      gap: 18,
      height: 438,
      marginTop: 8,
      alignItems: "start",
    }}
  >
    <div
      style={{
        display: punPsvPdfMode === "psv" ? "none" : "block",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(249,115,22,.22)",
        background: "linear-gradient(180deg,#fff7ed 0%,#ffffff 34%)",
        boxShadow: "0 7px 24px rgba(249,115,22,.08)",
        width: "100%",
        maxWidth: "none",
        justifySelf: "stretch",
      }}
    >
      <div
        style={{
          height: 53,
          padding: "9px 13px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background:
            "linear-gradient(90deg,rgba(249,115,22,.16),rgba(251,146,60,.03))",
          borderBottom: "1px solid rgba(249,115,22,.16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
          <span style={{ fontSize: 28, fontWeight: 950, color: "#ea580c" }}>PUN</span>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Prezzo Unico Nazionale dell'energia elettrica
          </span>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <span style={{ padding: "7px 9px", borderRadius: 9, background: "#ffedd5", color: "#c2410c", fontSize: 10, fontWeight: 900 }}>
            Mese selezionato: {latestPunPsvMonthLabel}
          </span>
          <span style={{ padding: "7px 10px", borderRadius: 9, background: "#fb923c", color: "#fff", fontSize: 13, fontWeight: 950 }}>
            {latestPun}
          </span>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 12 }}>
        <colgroup>
          <col style={{ width: "28%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#f97316", color: "#fff" }}>
            {["Mese", "PUN F0", "F1", "F2", "F3"].map((label, index) => (
              <th key={label} style={{ padding: "8px 9px", textAlign: index === 0 ? "left" : "right", fontSize: 11, fontWeight: 900 }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tablePunPsvRows.slice(0, 12).map((row, index) => (
            <tr
              key={row.mese}
              style={{
                background:
                  index === 0
                    ? "#fff3e8"
                    : index % 2 === 0
                    ? "#fffaf5"
                    : "#ffffff",
              }}
            >
              <td
                style={{
                  padding: "7px 9px",
                  fontWeight: index === 0 ? 900 : 700,
                  borderTop: index === 0 ? "2px solid #fb923c" : undefined,
                  borderBottom: index === 0 ? "2px solid #fb923c" : undefined,
                  borderLeft: index === 0 ? "2px solid #fb923c" : undefined,
                }}
              >
                {row.mese}
              </td>
              {[row.mono,row.f1,row.f2,row.f3].map((value,valueIndex) => (
                <td
                  key={valueIndex}
                  style={{
                    padding: "7px 9px",
                    textAlign: "right",
                    color:
                      valueIndex === 0
                        ? index === 0
                          ? "#c2410c"
                          : "#ea580c"
                        : "#334155",
                    fontWeight: valueIndex === 0 ? 900 : 650,
                    fontVariantNumeric: "tabular-nums",
                    borderTop: index === 0 ? "2px solid #fb923c" : undefined,
                    borderBottom: index === 0 ? "2px solid #fb923c" : undefined,
                    borderRight:
                      index === 0 && valueIndex === 3
                        ? "2px solid #fb923c"
                        : undefined,
                  }}
                >
                  {Number(value || 0).toFixed(3)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div
      style={{
        display: punPsvPdfMode === "pun" ? "none" : "block",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(14,165,233,.22)",
        background: "linear-gradient(180deg,#f0f9ff 0%,#ffffff 34%)",
        boxShadow: "0 7px 24px rgba(14,165,233,.08)",
        width: "100%",
        maxWidth: "none",
        justifySelf: "stretch",
      }}
    >
      <div
        style={{
          height: 53,
          padding: "9px 13px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background:
            "linear-gradient(90deg,rgba(14,165,233,.16),rgba(103,232,249,.03))",
          borderBottom: "1px solid rgba(14,165,233,.16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
          <span style={{ fontSize: 28, fontWeight: 950, color: "#0284c7" }}>PSV</span>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Punto di Scambio Virtuale del gas naturale
          </span>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <span style={{ padding: "7px 9px", borderRadius: 9, background: "#cffafe", color: "#0369a1", fontSize: 10, fontWeight: 900 }}>
            Mese selezionato: {latestPunPsvMonthLabel}
          </span>
          <span style={{ padding: "7px 10px", borderRadius: 9, background: "#0ea5e9", color: "#fff", fontSize: 13, fontWeight: 950 }}>
            {latestPsv}
          </span>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 12 }}>
        <colgroup>
          <col style={{ width: "55%" }} />
          <col style={{ width: "45%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#0284c7", color: "#fff" }}>
            <th style={{ padding: "8px 9px", textAlign: "left", fontSize: 11, fontWeight: 900 }}>Mese</th>
            <th style={{ padding: "8px 9px", textAlign: "right", fontSize: 11, fontWeight: 900 }}>PSV</th>
          </tr>
        </thead>
        <tbody>
          {tablePunPsvRows.slice(0, 12).map((row, index) => (
            <tr
              key={row.mese}
              style={{
                background:
                  index === 0
                    ? "#eef9ff"
                    : index % 2 === 0
                    ? "#f5fbff"
                    : "#ffffff",
              }}
            >
              <td
                style={{
                  padding: "7px 9px",
                  fontWeight: index === 0 ? 900 : 700,
                  borderTop: index === 0 ? "2px solid #38bdf8" : undefined,
                  borderBottom: index === 0 ? "2px solid #38bdf8" : undefined,
                  borderLeft: index === 0 ? "2px solid #38bdf8" : undefined,
                }}
              >
                {row.mese}
              </td>
              <td
                style={{
                  padding: "7px 9px",
                  textAlign: "right",
                  color: index === 0 ? "#0369a1" : "#0284c7",
                  fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  borderTop: index === 0 ? "2px solid #38bdf8" : undefined,
                  borderBottom: index === 0 ? "2px solid #38bdf8" : undefined,
                  borderRight: index === 0 ? "2px solid #38bdf8" : undefined,
                }}
              >
                {Number(row.psv || 0).toFixed(6)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        punPsvPdfMode === "both" ? "1fr 1fr" : "1fr",
      gap: 18,
      height: 392,
      marginTop: 18,
    }}
  >
    <div
      style={{
        display: punPsvPdfMode === "psv" ? "none" : "block",
        borderRadius: 16,
        padding: "13px 15px 8px",
        border: "1px solid rgba(249,115,22,.22)",
        background: "linear-gradient(180deg,#fffaf5,#ffffff)",
        boxShadow: "0 7px 24px rgba(249,115,22,.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Andamento PUN</div>
        <div style={{ display: "flex", gap: 7 }}>
          <span style={{ padding: "6px 9px", borderRadius: 8, background: "#ffedd5", color: "#c2410c", fontSize: 10, fontWeight: 900 }}>
            Mese selezionato: {latestPunPsvMonthLabel}
          </span>
          <span style={{ padding: "6px 10px", borderRadius: 8, background: "#fb923c", color: "#fff", fontSize: 12, fontWeight: 950 }}>
            {latestPun}
          </span>
        </div>
      </div>

      <svg viewBox="0 0 760 240" style={{ width: "100%", height: 306, display: "block" }}>
        <defs>
          <linearGradient id="pdfPunAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[40,80,120,160].map((y) => <line key={y} x1="0" x2="760" y1={y} y2={y} stroke="#dbe3ea" />)}
        <polygon points={`${punPolyline} 732,180 28,180`} fill="url(#pdfPunAreaGradient)" />
        <polyline fill="none" stroke="#f97316" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" points={punPolyline} />
        {punCoords.map((p,i) => {
          const isLast=i===punCoords.length-1;
          return (
            <g key={i}>
              {isLast && <circle cx={p.x} cy={p.y} r="14" fill="rgba(249,115,22,.14)" stroke="#fb923c" strokeWidth="2" />}
              <circle cx={p.x} cy={p.y} r={isLast ? 8 : 5.5} fill="#fff" stroke="#f97316" strokeWidth={isLast ? 4 : 2.5} />
              <text x={p.x} y={p.y-12} textAnchor="middle" fontSize="13" fill="#111" fontWeight="700">{punValues[i].toFixed(3)}</text>
              <text x={p.x} y="205" textAnchor="middle" fontSize="13" fill="#64748b">
                <tspan x={p.x} dy="0">{(monthLabels[i]||"").toUpperCase()}</tspan>
                <tspan x={p.x} dy="15">{chartYearLabels[i]}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>

    <div
      style={{
        display: punPsvPdfMode === "pun" ? "none" : "block",
        borderRadius: 16,
        padding: "13px 15px 8px",
        border: "1px solid rgba(14,165,233,.22)",
        background: "linear-gradient(180deg,#f5fbff,#ffffff)",
        boxShadow: "0 7px 24px rgba(14,165,233,.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Andamento PSV</div>
        <div style={{ display: "flex", gap: 7 }}>
          <span style={{ padding: "6px 9px", borderRadius: 8, background: "#cffafe", color: "#0369a1", fontSize: 10, fontWeight: 900 }}>
            Mese selezionato: {latestPunPsvMonthLabel}
          </span>
          <span style={{ padding: "6px 10px", borderRadius: 8, background: "#0ea5e9", color: "#fff", fontSize: 12, fontWeight: 950 }}>
            {latestPsv}
          </span>
        </div>
      </div>

      <svg viewBox="0 0 760 240" style={{ width: "100%", height: 306, display: "block" }}>
        <defs>
          <linearGradient id="pdfPsvAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[40,80,120,160].map((y) => <line key={y} x1="0" x2="760" y1={y} y2={y} stroke="#dbe3ea" />)}
        <polygon points={`${psvPolyline} 732,180 28,180`} fill="url(#pdfPsvAreaGradient)" />
        <polyline fill="none" stroke="#0ea5e9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" points={psvPolyline} />
        {psvCoords.map((p,i) => {
          const isLast=i===psvCoords.length-1;
          return (
            <g key={i}>
              {isLast && <circle cx={p.x} cy={p.y} r="14" fill="rgba(14,165,233,.14)" stroke="#38bdf8" strokeWidth="2" />}
              <circle cx={p.x} cy={p.y} r={isLast ? 8 : 5.5} fill="#fff" stroke="#0ea5e9" strokeWidth={isLast ? 4 : 2.5} />
              <text x={p.x} y={p.y-12} textAnchor="middle" fontSize="13" fill="#111" fontWeight="700">{psvValues[i].toFixed(3)}</text>
              <text x={p.x} y="205" textAnchor="middle" fontSize="13" fill="#64748b">
                <tspan x={p.x} dy="0">{(monthLabels[i]||"").toUpperCase()}</tspan>
                <tspan x={p.x} dy="15">{chartYearLabels[i]}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  </div>
</div>

          </div>
        ) : (
          renderAdminContent()
        )}
</div>
);
}
