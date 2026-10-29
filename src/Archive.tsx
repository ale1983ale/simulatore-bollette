import Insoluti from "./Insoluti";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { adminGetSetting, adminUpsertSettings } from "./adminSecurity";
import Production from "./Production";
import ActiveProduction from "./ActiveProduction";
import { getRecruitingContext } from "./recruitingClient";
import { exportFilteredA4Pdf, pdfNumber, pdfSelection } from "./filteredReportsPdf";
import { recessNoteText, recessReferenceMonth } from "./recessPeriod";

type Commodity = "LUCE" | "GAS" | "N/D";
type StorageMode = "loading" | "database" | "legacy";

type RecessoRow = {
  id: string;
  dedupKey: string;
  sourceFile: string;
  sourceFiles: string[];
  sourceSheet: string;
  commodity: Commodity;
  validita: string;
  validitaDate: string;
  monthKey: string;
  agente: string;
  denominazione: string;
  podPdr: string;
  tipoCliente: string;
  consumo: number | null;
  raw: Record<string, string>;
};

type ParsedFile = {
  id: string;
  name: string;
  uploadedAt: string;
  rows: RecessoRow[];
  originalRowCount: number;
  duplicateRowsInFile: number;
};

type LegacyArchive = {
  version: 1;
  files: Array<{
    id: string;
    name: string;
    uploadedAt: string;
    rows: any[];
  }>;
};

const LEGACY_KEY = "archive_recessi_v1";
const DB_TABLE = "archive_recessi";
const PAGE_SIZE = 1000;
const IMPORT_CHUNK = 400;

const MONTHS_IT = [
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

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

const stringifyCell = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${value.getFullYear()}`;
  }
  return String(value ?? "").trim();
};

const aliasGroups = {
  notaRecesso: ["NOTA_RECESSO", "NOTA RECESSO", "NOTA DI RECESSO", "NOTE RECESSO"],
  validita: [
    "DATA_VALIDITA_RECESSO",
    "DATA VALIDITA RECESSO",
    "DATA VALIDITA",
    "DATA VALIDITÀ",
    "VALIDITA",
    "VALIDITÀ",
    "DATA FINE VALIDITA",
    "DATA FINE",
    "DATA CESSAZIONE",
    "DECORRENZA",
    "DATA DECORRENZA",
  ],
  agente: [
    "AGENZIA",
    "AGENTE",
    "NOME AGENZIA",
    "AGENZIA AGENTE",
    "NOME AGENTE",
    "CONSULENTE",
    "COMMERCIALE",
  ],
  denominazione: [
    "RAGIONE_SOCIALE",
    "RAGIONE SOCIALE",
    "DENOMINAZIONE",
    "DENOMINAZIONE CLIENTE",
    "NOME CLIENTE",
    "CLIENTE",
  ],
  podPdr: [
    "POD",
    "PDR",
    "POD/PDR",
    "POD PDR",
    "CODICE POD",
    "CODICE PDR",
    "CODICE FORNITURA",
  ],
  tipoCliente: [
    "TIPOLOGIA CLIENTE",
    "TIPO CLIENTE",
    "CATEGORIA CLIENTE",
    "CD_TP_UTENZA",
    "CD TP UTENZA",
    "CD_TP_UTILIZZO",
    "CD TP UTILIZZO",
    "TIPOLOGIA",
    "TIPOLOGIA UTENZA",
    "TIPO USO",
    "USO",
    "DESTINAZIONE USO",
    "CATEGORIA",
  ],
  consumo: [
    "CONSUMO ANNUO",
    "CONSUMO_ANNUO",
    "CONSUMO ANNUALE",
    "KWH_ANNUI",
    "KWH ANNUI",
    "CONSUMO",
    "CONSUMI",
    "CONSUMO KWH",
    "CONSUMO ANNUO KWH",
    "KWH",
    "CONSUMO SMC",
    "CONSUMO ANNUO SMC",
    "SMC",
  ],
  commodity: [
    "COMMODITY",
    "TIPO FORNITURA",
    "FORNITURA",
    "SERVIZIO",
    "SETTORE",
  ],
};

const allKnownAliases = new Set(
  Object.values(aliasGroups)
    .flat()
    .map(normalize)
);

function findHeaderRow(matrix: unknown[][]) {
  let bestIndex = 0;
  let bestScore = -1;
  const maxRows = Math.min(matrix.length, 25);

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    let score = 0;

    row.forEach((cell) => {
      const key = normalize(cell);
      if (!key) return;
      if (allKnownAliases.has(key)) score += 3;
      else if (
        Array.from(allKnownAliases).some(
          (alias) => alias.length >= 5 && (key.includes(alias) || alias.includes(key))
        )
      ) {
        score += 1;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  }

  return bestIndex;
}

function makeHeaders(row: unknown[]) {
  const used = new Map<string, number>();

  return row.map((cell, index) => {
    const base = stringifyCell(cell) || `COLONNA_${index + 1}`;
    const key = normalize(base);
    const count = used.get(key) || 0;
    used.set(key, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function findRawValue(raw: Record<string, string>, aliases: string[]) {
  const entries = Object.entries(raw).map(([key, value]) => ({
    normalized: normalize(key),
    value,
  }));
  const normalizedAliases = aliases.map(normalize);

  for (const alias of normalizedAliases) {
    const exact = entries.find((entry) => entry.normalized === alias);
    if (exact && exact.value !== "") return exact.value;
  }

  for (const alias of normalizedAliases) {
    if (alias.length < 5) continue;
    const partial = entries.find(
      (entry) =>
        entry.value !== "" &&
        (entry.normalized.includes(alias) || alias.includes(entry.normalized))
    );
    if (partial) return partial.value;
  }

  return "";
}

const PROVINCE_META: Record<string, { name: string; region: string }> = {
  AG: { name: "Agrigento", region: "Sicilia" },
  AL: { name: "Alessandria", region: "Piemonte" },
  AN: { name: "Ancona", region: "Marche" },
  AO: { name: "Aosta", region: "Valle d'Aosta" },
  AP: { name: "Ascoli Piceno", region: "Marche" },
  AQ: { name: "L'Aquila", region: "Abruzzo" },
  AR: { name: "Arezzo", region: "Toscana" },
  AT: { name: "Asti", region: "Piemonte" },
  AV: { name: "Avellino", region: "Campania" },
  BA: { name: "Bari", region: "Puglia" },
  BG: { name: "Bergamo", region: "Lombardia" },
  BI: { name: "Biella", region: "Piemonte" },
  BL: { name: "Belluno", region: "Veneto" },
  BN: { name: "Benevento", region: "Campania" },
  BO: { name: "Bologna", region: "Emilia-Romagna" },
  BR: { name: "Brindisi", region: "Puglia" },
  BS: { name: "Brescia", region: "Lombardia" },
  BT: { name: "Barletta-Andria-Trani", region: "Puglia" },
  BZ: { name: "Bolzano", region: "Trentino-Alto Adige" },
  CA: { name: "Cagliari", region: "Sardegna" },
  CB: { name: "Campobasso", region: "Molise" },
  CE: { name: "Caserta", region: "Campania" },
  CH: { name: "Chieti", region: "Abruzzo" },
  CI: { name: "Carbonia-Iglesias", region: "Sardegna" },
  CL: { name: "Caltanissetta", region: "Sicilia" },
  CN: { name: "Cuneo", region: "Piemonte" },
  CO: { name: "Como", region: "Lombardia" },
  CR: { name: "Cremona", region: "Lombardia" },
  CS: { name: "Cosenza", region: "Calabria" },
  CT: { name: "Catania", region: "Sicilia" },
  CZ: { name: "Catanzaro", region: "Calabria" },
  EN: { name: "Enna", region: "Sicilia" },
  FC: { name: "Forlì-Cesena", region: "Emilia-Romagna" },
  FE: { name: "Ferrara", region: "Emilia-Romagna" },
  FG: { name: "Foggia", region: "Puglia" },
  FI: { name: "Firenze", region: "Toscana" },
  FM: { name: "Fermo", region: "Marche" },
  FR: { name: "Frosinone", region: "Lazio" },
  GE: { name: "Genova", region: "Liguria" },
  GO: { name: "Gorizia", region: "Friuli-Venezia Giulia" },
  GR: { name: "Grosseto", region: "Toscana" },
  IM: { name: "Imperia", region: "Liguria" },
  IS: { name: "Isernia", region: "Molise" },
  KR: { name: "Crotone", region: "Calabria" },
  LC: { name: "Lecco", region: "Lombardia" },
  LE: { name: "Lecce", region: "Puglia" },
  LI: { name: "Livorno", region: "Toscana" },
  LO: { name: "Lodi", region: "Lombardia" },
  LT: { name: "Latina", region: "Lazio" },
  LU: { name: "Lucca", region: "Toscana" },
  MB: { name: "Monza e della Brianza", region: "Lombardia" },
  MC: { name: "Macerata", region: "Marche" },
  ME: { name: "Messina", region: "Sicilia" },
  MI: { name: "Milano", region: "Lombardia" },
  MN: { name: "Mantova", region: "Lombardia" },
  MO: { name: "Modena", region: "Emilia-Romagna" },
  MS: { name: "Massa-Carrara", region: "Toscana" },
  MT: { name: "Matera", region: "Basilicata" },
  NA: { name: "Napoli", region: "Campania" },
  NO: { name: "Novara", region: "Piemonte" },
  NU: { name: "Nuoro", region: "Sardegna" },
  OG: { name: "Ogliastra", region: "Sardegna" },
  OR: { name: "Oristano", region: "Sardegna" },
  OT: { name: "Olbia-Tempio", region: "Sardegna" },
  PA: { name: "Palermo", region: "Sicilia" },
  PC: { name: "Piacenza", region: "Emilia-Romagna" },
  PD: { name: "Padova", region: "Veneto" },
  PE: { name: "Pescara", region: "Abruzzo" },
  PG: { name: "Perugia", region: "Umbria" },
  PI: { name: "Pisa", region: "Toscana" },
  PN: { name: "Pordenone", region: "Friuli-Venezia Giulia" },
  PO: { name: "Prato", region: "Toscana" },
  PR: { name: "Parma", region: "Emilia-Romagna" },
  PT: { name: "Pistoia", region: "Toscana" },
  PU: { name: "Pesaro e Urbino", region: "Marche" },
  PV: { name: "Pavia", region: "Lombardia" },
  PZ: { name: "Potenza", region: "Basilicata" },
  RA: { name: "Ravenna", region: "Emilia-Romagna" },
  RC: { name: "Reggio Calabria", region: "Calabria" },
  RE: { name: "Reggio Emilia", region: "Emilia-Romagna" },
  RG: { name: "Ragusa", region: "Sicilia" },
  RI: { name: "Rieti", region: "Lazio" },
  RM: { name: "Roma", region: "Lazio" },
  RN: { name: "Rimini", region: "Emilia-Romagna" },
  RO: { name: "Rovigo", region: "Veneto" },
  SA: { name: "Salerno", region: "Campania" },
  SI: { name: "Siena", region: "Toscana" },
  SO: { name: "Sondrio", region: "Lombardia" },
  SP: { name: "La Spezia", region: "Liguria" },
  SR: { name: "Siracusa", region: "Sicilia" },
  SS: { name: "Sassari", region: "Sardegna" },
  SU: { name: "Sud Sardegna", region: "Sardegna" },
  SV: { name: "Savona", region: "Liguria" },
  TA: { name: "Taranto", region: "Puglia" },
  TE: { name: "Teramo", region: "Abruzzo" },
  TN: { name: "Trento", region: "Trentino-Alto Adige" },
  TO: { name: "Torino", region: "Piemonte" },
  TP: { name: "Trapani", region: "Sicilia" },
  TR: { name: "Terni", region: "Umbria" },
  TS: { name: "Trieste", region: "Friuli-Venezia Giulia" },
  TV: { name: "Treviso", region: "Veneto" },
  UD: { name: "Udine", region: "Friuli-Venezia Giulia" },
  VA: { name: "Varese", region: "Lombardia" },
  VB: { name: "Verbano-Cusio-Ossola", region: "Piemonte" },
  VC: { name: "Vercelli", region: "Piemonte" },
  VE: { name: "Venezia", region: "Veneto" },
  VI: { name: "Vicenza", region: "Veneto" },
  VR: { name: "Verona", region: "Veneto" },
  VS: { name: "Medio Campidano", region: "Sardegna" },
  VT: { name: "Viterbo", region: "Lazio" },
  VV: { name: "Vibo Valentia", region: "Calabria" },
};

function deriveLegalSeatGeo(raw: Record<string, string>) {
  const sede =
    raw["CAP_LOCALITA_SEDE_LEGALE"] ||
    findRawValue(raw, ["CAP_LOCALITA_SEDE_LEGALE", "CAP LOCALITA SEDE LEGALE"]);

  const text = String(sede || "").trim().toUpperCase();
  const match = text.match(/\(([A-Z]{2})\)\s*$/) || text.match(/\b([A-Z]{2})\s*$/);
  const provinceCode = match?.[1] || "";
  const meta = provinceCode ? PROVINCE_META[provinceCode] : undefined;

  return {
    provinceCode,
    provinceLabel: meta ? `${meta.name} (${provinceCode})` : provinceCode,
    region: meta?.region || "",
  };
}

function parseNumber(value: unknown): number | null {
  let text = String(value ?? "").trim();
  if (!text) return null;

  text = text.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  const build = (year: number, month: number, day: number) => ({
    display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    monthKey: `${year}-${String(month).padStart(2, "0")}`,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  });

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return build(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded?.y && decoded?.m && decoded?.d) {
      return build(decoded.y, decoded.m, decoded.d);
    }
  }

  const text = String(value ?? "").trim();
  if (!text) return { display: "", monthKey: "", dateKey: "" };

  const ita = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (ita) {
    const day = Number(ita[1]);
    const month = Number(ita[2]);
    let year = Number(ita[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return build(year, month, day);
    }
  }

  const iso = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (iso) {
    return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return build(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return { display: text, monthKey: "", dateKey: "" };
}

function friendlyCustomerType(value: string, commodity: Commodity) {
  const code = normalize(value);

  if (commodity === "LUCE") {
    if (code === "RES") return "RESIDENZIALE (RES)";
    if (code === "ALTRE") return "ALTRI USI (ALTRE)";
  }

  if (commodity === "GAS") {
    if (code === "CIV") return "CIVILE (CIV)";
    if (code === "ART") return "ARTIGIANALE (ART)";
    if (code === "IND") return "INDUSTRIALE (IND)";
  }

  return String(value || "").trim();
}

function inferCommodity(sheetName: string, raw: Record<string, string>): Commodity {
  const explicit = findRawValue(raw, aliasGroups.commodity);
  const probe = `${sheetName} ${explicit}`.toUpperCase();
  const rawKeys = Object.keys(raw).map(normalize);

  if (/\bGAS\b|METANO|PDR/.test(probe) || rawKeys.some((key) => key === "PDR")) return "GAS";
  if (/\bLUCE\b|ENERGIA|ELETTRIC/.test(probe) || rawKeys.some((key) => key === "POD")) return "LUCE";
  return "N/D";
}

function monthLabel(monthKey: string) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "N/D";
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${MONTHS_IT[month - 1] || ""} ${year}`.trim();
}

function createDedupKey(
  commodity: Commodity,
  denominazione: string,
  podPdr: string,
  validitaMonth: string,
  fallback: string
) {
  const customer = normalize(denominazione);
  const point = normalize(podPdr);
  const month = String(validitaMonth || "").trim();

  if (customer && point && month) {
    return `${commodity}|${customer}|${point}|${month}`;
  }

  return `ROW|${normalize(fallback)}`;
}

function toRowFromRaw(
  raw: Record<string, string>,
  sourceFile: string,
  sourceSheet: string,
  rowFallback: string
): RecessoRow {
  const commodity = inferCommodity(sourceSheet, raw);
  const dateRaw = findRawValue(raw, aliasGroups.validita);
  const parsedDate = parseDate(dateRaw);
  const referenceMonth = recessReferenceMonth(raw);
  const agente = findRawValue(raw, aliasGroups.agente);
  const denominazione = findRawValue(raw, aliasGroups.denominazione);
  const podPdr = findRawValue(raw, aliasGroups.podPdr);
  const tipoClienteRaw = findRawValue(raw, aliasGroups.tipoCliente);
  const tipoCliente = friendlyCustomerType(tipoClienteRaw, commodity);

  const consumptionAliases =
    commodity === "GAS"
      ? ["CONSUMO_ANNUO", "CONSUMO ANNUO", "CONSUMO ANNUO SMC", "CONSUMO SMC", "SMC", ...aliasGroups.consumo]
      : commodity === "LUCE"
      ? ["KWH_ANNUI", "KWH ANNUI", "CONSUMO ANNUO KWH", "CONSUMO KWH", "KWH", ...aliasGroups.consumo]
      : aliasGroups.consumo;

  const consumo = parseNumber(findRawValue(raw, consumptionAliases));
  const dedupKey = createDedupKey(
    commodity,
    denominazione,
    podPdr,
    referenceMonth,
    `${sourceFile}|${sourceSheet}|${rowFallback}`
  );

  return {
    id: dedupKey,
    dedupKey,
    sourceFile,
    sourceFiles: [sourceFile],
    sourceSheet,
    commodity,
    validita: parsedDate.display || dateRaw,
    validitaDate: parsedDate.dateKey,
    monthKey: referenceMonth,
    agente,
    denominazione,
    podPdr,
    tipoCliente,
    consumo,
    raw,
  };
}

async function parseRecessiFile(file: File): Promise<ParsedFile> {
  const data = await file.arrayBuffer();

  // Lascia al browser il tempo di aggiornare la UI prima delle operazioni
  // XLSX più pesanti, soprattutto quando vengono selezionati molti file.
  await yieldToBrowser();

  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: true,
    dense: true,
  });

  await yieldToBrowser();

  const byKey = new Map<string, RecessoRow>();
  let originalRowCount = 0;
  const ROW_CHUNK = 200;

  for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex += 1) {
    const sheetName = workbook.SheetNames[sheetIndex];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];

    if (!matrix.length) {
      await yieldToBrowser();
      continue;
    }

    const headerIndex = findHeaderRow(matrix);
    const headers = makeHeaders(matrix[headerIndex] || []);

    for (let matrixIndex = headerIndex + 1; matrixIndex < matrix.length; matrixIndex += 1) {
      const sourceRow = matrix[matrixIndex];
      if (!sourceRow || sourceRow.every((cell) => stringifyCell(cell) === "")) {
        continue;
      }

      originalRowCount += 1;
      const raw: Record<string, string> = {};

      headers.forEach((header, colIndex) => {
        const value = stringifyCell(sourceRow[colIndex]);
        if (value !== "") raw[header] = value;
      });

      const rowIndex = matrixIndex - headerIndex - 1;
      const row = toRowFromRaw(
        raw,
        file.name,
        sheetName,
        `${sheetIndex}-${rowIndex}`
      );

      if (!byKey.has(row.dedupKey)) {
        byKey.set(row.dedupKey, row);
      }

      if (originalRowCount % ROW_CHUNK === 0) {
        await yieldToBrowser();
      }
    }

    await yieldToBrowser();
  }

  const rows = Array.from(byKey.values());

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: file.name,
    uploadedAt: new Date().toISOString(),
    rows,
    originalRowCount,
    duplicateRowsInFile: originalRowCount - rows.length,
  };
}

function dbRowToRecesso(row: any): RecessoRow {
  const sourceFiles = Array.isArray(row.source_files) ? row.source_files : [];
  const sourceSheets = Array.isArray(row.source_sheets) ? row.source_sheets : [];

  return {
    id: String(row.id),
    dedupKey: String(row.dedup_key || ""),
    sourceFile: sourceFiles[0] || "",
    sourceFiles,
    sourceSheet: sourceSheets.join(", "),
    commodity: (row.commodity || "N/D") as Commodity,
    validita: String(row.validita_text || ""),
    validitaDate: String(row.validita_date || ""),
    monthKey: recessReferenceMonth(row.raw as Record<string, unknown>) || String(row.month_key || ""),
    agente: String(row.agente || ""),
    denominazione: String(row.denominazione || ""),
    podPdr: String(row.pod_pdr || ""),
    tipoCliente: String(row.tipo_cliente || ""),
    consumo: row.consumo === null || row.consumo === undefined ? null : Number(row.consumo),
    raw: (row.raw || {}) as Record<string, string>,
  };
}

function normalizeLegacyArchive(saved: any): LegacyArchive {
  if (!saved || saved.version !== 1 || !Array.isArray(saved.files)) {
    return { version: 1, files: [] };
  }

  return {
    version: 1,
    files: saved.files.map((file: any, fileIndex: number) => {
      const name = String(file?.name || `File ${fileIndex + 1}`);
      const rows = Array.isArray(file?.rows)
        ? file.rows.map((old: any, rowIndex: number) => {
            if (old?.podPdr !== undefined) {
              const dedupKey = createDedupKey(
                (old?.commodity || "N/D") as Commodity,
                String(old?.denominazione || ""),
                String(old?.podPdr || ""),
                recessReferenceMonth(old?.raw) || String(old?.monthKey || ""),
                `${name}|${String(old?.sourceSheet || "")}|${fileIndex}-${rowIndex}`
              );

              return {
                ...old,
                monthKey: recessReferenceMonth(old?.raw) || String(old?.monthKey || ""),
                id: dedupKey,
                dedupKey,
                sourceFile: name,
                sourceFiles:
                  Array.isArray(old?.sourceFiles) && old.sourceFiles.length
                    ? old.sourceFiles
                    : [name],
              };
            }

            const raw = (old?.raw || {}) as Record<string, string>;
            const rebuilt = toRowFromRaw(
              raw,
              name,
              String(old?.sourceSheet || ""),
              `${fileIndex}-${rowIndex}`
            );

            return {
              ...rebuilt,
              sourceFile: name,
              sourceFiles: [name],
            };
          })
        : [];

      return {
        id: String(file?.id || `legacy-${fileIndex}`),
        name,
        uploadedAt: String(file?.uploadedAt || new Date().toISOString()),
        rows,
      };
    }),
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "white",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  marginBottom: 5,
};

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 16,
};

type MultiSelectOption = {
  value: string;
  label: string;
};

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  allLabel,
  containerStyle,
  menuMinWidth,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel: string;
  containerStyle?: React.CSSProperties;
  menuMinWidth?: number;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [filterSearch, setFilterSearch] = useState("");

  const normalizedFilterSearch = filterSearch
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const visibleOptions = normalizedFilterSearch
    ? options.filter((option) =>
        `${option.label} ${option.value}`
          .toLocaleLowerCase("it")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(normalizedFilterSearch)
      )
    : options;

  useEffect(() => {
    const closeIfOutside = (event: MouseEvent | TouchEvent) => {
      const details = detailsRef.current;
      if (!details?.open) return;

      const target = event.target as Node | null;
      if (target && !details.contains(target)) {
        details.removeAttribute("open");
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        detailsRef.current?.removeAttribute("open");
      }
    };

    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("touchstart", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("touchstart", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selectedLabels = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);

  const summary =
    selectedLabels.length === 0
      ? allLabel
      : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels.length} selezionati`;

  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>{label}</div>
      <details
        ref={detailsRef}
        style={{
          position: "relative",
          width: "100%",
        }}
      >
        <summary
          style={{
            ...inputStyle,
            cursor: "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {summary}
        </summary>

        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            minWidth: menuMinWidth ? `${menuMinWidth}px` : undefined,
            maxWidth: "calc(100vw - 48px)",
            maxHeight: 240,
            overflowY: "auto",
            overflowX: "auto",
            padding: 8,
            background: "white",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.14)",
          }}
        >
          <div style={{ padding: "2px 2px 8px" }}>
            <input
              type="search"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder={`Cerca in ${label.toLocaleLowerCase("it")}...`}
              aria-label={`Cerca in ${label}`}
              style={{
                ...inputStyle,
                padding: "8px 10px",
                background: "#f8fafc",
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 6px",
              cursor: "pointer",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
            />
            {allLabel}
          </label>

          {visibleOptions.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 6px",
                cursor: "pointer",
                borderTop: "1px solid #f1f5f9",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}

          {visibleOptions.length === 0 && (
            <div
              style={{
                padding: "10px 6px",
                color: "#64748b",
                fontSize: 13,
                borderTop: "1px solid #f1f5f9",
              }}
            >
              Nessun risultato
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export default function Archive({ reportAdminPanel = null, adminToken = "" }: { reportAdminPanel?: React.ReactNode; adminToken?: string }) {
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [rows, setRows] = useState<RecessoRow[]>([]);
  const [excludedGeneralAgents,setExcludedGeneralAgents]=useState<Set<string>>(()=>new Set());
  const normalizeGeneralAgent=(value:string)=>String(value||"").trim().toLocaleUpperCase("it-IT").replace(/\s+/g," ");
  useEffect(()=>{
    let active=true;
    const load=async()=>{const {data,error}=await supabase.from("production_agent_zones").select("agent_key,include_in_report");if(!error&&active)setExcludedGeneralAgents(new Set((data||[]).filter(x=>x.include_in_report===false).map(x=>normalizeGeneralAgent(x.agent_key))));};
    void load();
    const onFocus=()=>void load();
    window.addEventListener("focus",onFocus);
    return()=>{active=false;window.removeEventListener("focus",onFocus);};
  },[]);
  const isGeneralAgentIncluded=(name:string)=>!excludedGeneralAgents.has(normalizeGeneralAgent(name));

  const [legacyArchive, setLegacyArchive] = useState<LegacyArchive>({ version: 1, files: [] });
  const [pendingFiles, setPendingFiles] = useState<ParsedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastImportMessage, setLastImportMessage] = useState("");
  type ArchiveSection = "recessi" | "dettaglioProduzione" | "produzione" | "attivo" | "dettaglioRecessi" | "reportAdmin" | "zone" | "insoluti";
  const [archiveSection, setArchiveSection] = useState<ArchiveSection>(() => {
    const value = window.sessionStorage.getItem("ge_archive_section");
    return value === "produzione" || value === "dettaglioProduzione" || value === "attivo" || value === "dettaglioRecessi" ||
      value === "reportAdmin" || value === "insoluti" ? value : "recessi";
  });
  useEffect(() => {
    window.sessionStorage.setItem("ge_archive_section", archiveSection);
  }, [archiveSection]);

  const [detailAgent, setDetailAgent] = useState("");
  const [detailAgents,setDetailAgents]=useState<string[]>([]);
  const [detailRegion, setDetailRegion] = useState("");
  const [detailProvince, setDetailProvince] = useState("");
  const [detailMonth, setDetailMonth] = useState("");
  const [detailMonths,setDetailMonths]=useState<string[]>([]);
  const [detailCommodity, setDetailCommodity] = useState("");
  const [detailSearch, setDetailSearch] = useState("");
  const [detailExpanded, setDetailExpanded] = useState<string | null>(null);
  const [detailLimit, setDetailLimit] = useState(100);
  const [detailSourceIds, setDetailSourceIds] = useState<Set<string> | null>(null);
  const [detailModal, setDetailModal] = useState<RecessoRow | null>(null);
  const [detailNotesRow, setDetailNotesRow] = useState<RecessoRow | null>(null);
  const [detailNotesText, setDetailNotesText] = useState("");
  const [detailSubsection, setDetailSubsection] = useState<"list" | "notes">("list");
  const [detailNoteHistory, setDetailNoteHistory] = useState<Array<{id:number;recesso_id:number;note:string;created_at:string}>>([]);
  const [detailNotesLoading, setDetailNotesLoading] = useState(false);
  const loadDetailNoteHistory = async () => {
    setDetailNotesLoading(true);
    const {data,error}=await supabase.from("archive_recessi_note_history")
      .select("id,recesso_id,note,created_at").order("created_at",{ascending:false}).limit(5000);
    if(error)setDetailMessage("Errore caricamento storico note: "+error.message);
    else setDetailNoteHistory(data||[]);
    setDetailNotesLoading(false);
  };
  useEffect(()=>{if(archiveSection==="dettaglioRecessi")void loadDetailNoteHistory();},[archiveSection]);
  const [detailNotes, setDetailNotes] = useState<Record<string,string>>({});
  const [detailRecovered, setDetailRecovered] = useState<Record<string,boolean>>({});
  const [detailRecovering, setDetailRecovering] = useState<string | null>(null);
  const [detailCalendarRow, setDetailCalendarRow] = useState<RecessoRow | null>(null);
  const [detailCalendarDate, setDetailCalendarDate] = useState("");
  const [detailCalendarTime, setDetailCalendarTime] = useState("");
  const [detailCalendarType, setDetailCalendarType] = useState("ALTRO");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMessage, setDetailMessage] = useState("");
  useEffect(() => {
    void supabase.from("archive_recessi_notes").select("recesso_id,note,recuperato").then(({data,error}) => {
      if(error) {setDetailMessage("Errore caricamento stato recuperi: "+error.message);return;}
      if(data) {
        setDetailNotes(Object.fromEntries(data.map(x=>[String(x.recesso_id),x.note])));
        setDetailRecovered(Object.fromEntries(data.map(x=>[String(x.recesso_id),Boolean(x.recuperato)])));
      }
    });
  }, []);
  const toggleDetailRecovered = async (row: RecessoRow, recovered: boolean) => {
    if(detailRecovering)return;
    setDetailRecovering(row.id);
    setDetailMessage("");
    const {error}=await supabase.from("archive_recessi_notes").upsert({
      recesso_id:Number(row.id),
      note:detailNotes[row.id]||"",
      recuperato:recovered,
      updated_at:new Date().toISOString()
    },{onConflict:"recesso_id"});
    if(error)setDetailMessage("Impossibile salvare lo stato RECUPERATO: "+error.message);
    else setDetailRecovered(v=>({...v,[row.id]:recovered}));
    setDetailRecovering(null);
  };
  const saveDetailNote = async () => {
    if (!detailNotesRow) return;
    setDetailBusy(true);
    const oldNote=detailNotes[detailNotesRow.id]||"";
    if(detailNotesText.trim() && detailNotesText.trim()!==oldNote.trim()){
      const {error:historyError}=await supabase.from("archive_recessi_note_history").insert({
        recesso_id:Number(detailNotesRow.id),note:detailNotesText.trim()
      });
      if(historyError){setDetailBusy(false);setDetailMessage("Errore salvataggio storico note: "+historyError.message);return;}
    }
    const {error}=await supabase.from("archive_recessi_notes").upsert({
      recesso_id:Number(detailNotesRow.id),note:detailNotesText,recuperato:Boolean(detailRecovered[detailNotesRow.id]),updated_at:new Date().toISOString()
    },{onConflict:"recesso_id"});
    setDetailBusy(false);
    if(error) setDetailMessage("Errore salvataggio note: "+error.message);
    else {setDetailNotes(v=>({...v,[detailNotesRow.id]:detailNotesText}));setDetailNotesRow(null);setDetailMessage("Nota salvata.");void loadDetailNoteHistory();}
  };
  const saveDetailCalendar = async () => {
    if(!detailCalendarRow || !detailCalendarDate || !detailCalendarTime)return;
    setDetailBusy(true);
    try {
      const ctx=await getRecruitingContext();
      const {error}=await ctx.client.from("recruiting_events").insert({
        owner_key:ctx.ownerKey,candidate_id:null,event_date:detailCalendarDate,
        event_time:detailCalendarTime,event_type:detailCalendarType,
        custom_type:detailCalendarType==="ALTRO"?"RECESSO":"",
        notes:["RECESSO · "+detailCalendarRow.denominazione,
          "POD/PDR: "+detailCalendarRow.podPdr,"Agente: "+detailCalendarRow.agente,
          "Fornitura: "+detailCalendarRow.commodity,"Mese recesso: "+detailCalendarRow.monthKey].join("\\n")
      });
      if(error)throw error;
      setDetailCalendarRow(null);setDetailMessage("Recesso inserito nel Calendario.");
    } catch(error:any) {setDetailMessage("Errore Calendario: "+(error?.message||error));}
    finally {setDetailBusy(false);}
  };
  const [detailSort, setDetailSort] = useState<"month" | "agent" | "name" | "pod" | "commodity" | "consumption" | "province">("month");
  const [detailSortAsc, setDetailSortAsc] = useState(false);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [monthsSelected, setMonthsSelected] = useState<string[]>([]);
  const [agentsSelected, setAgentsSelected] = useState<string[]>([]);
  const [agentsSearch,setAgentsSearch]=useState("");
  const [provincesSelected, setProvincesSelected] = useState<string[]>([]);
  const [regionsSelected, setRegionsSelected] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerTypesSelected, setCustomerTypesSelected] = useState<string[]>([]);
  const [consumptionMin, setConsumptionMin] = useState("");
  const [consumptionMax, setConsumptionMax] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [search, setSearch] = useState("");

  const loadLegacy = async () => {
    let value: any = null;
    try {
      value = await adminGetSetting(LEGACY_KEY);
    } catch (error) {
      console.error("LOAD LEGACY ARCHIVE ERROR:", error);
      setLegacyArchive({ version: 1, files: [] });
      setRows([]);
      return;
    }

    const archive = normalizeLegacyArchive(value);
    setLegacyArchive(archive);
    setRows(archive.files.flatMap((file) => file.rows as RecessoRow[]));
  };

  const fetchDatabaseRows = async () => {
    const loaded: RecessoRow[] = [];

    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(DB_TABLE)
        .select(
          "id,dedup_key,commodity,validita_date,validita_text,month_key,agente,denominazione,pod_pdr,tipo_cliente,consumo,raw,source_files,source_sheets,first_seen_at,updated_at"
        )
        .order("id", { ascending: true })
        .range(start, start + PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data || []).map(dbRowToRecesso);
      loaded.push(...page);

      if (page.length < PAGE_SIZE) break;
    }

    setRows(loaded);
    return loaded;
  };

  const importRowsToDatabase = async (fileName: string, importRows: RecessoRow[]) => {
    let inserted = 0;
    let duplicates = 0;

    for (let start = 0; start < importRows.length; start += IMPORT_CHUNK) {
      const chunk = importRows.slice(start, start + IMPORT_CHUNK).map((row) => ({
        dedup_key: row.dedupKey,
        commodity: row.commodity,
        validita_date: row.validitaDate || null,
        validita_text: row.validita,
        month_key: row.monthKey,
        agente: row.agente,
        denominazione: row.denominazione,
        pod_pdr: row.podPdr,
        tipo_cliente: row.tipoCliente,
        consumo: row.consumo,
        raw: row.raw,
        source_sheet: row.sourceSheet,
      }));

      const { data, error } = await supabase.rpc("archive_recessi_import_rows", {
        p_file_name: fileName,
        p_rows: chunk,
      });

      if (error) throw error;

      inserted += Number(data?.inserted || 0);
      duplicates += Number(data?.duplicates || 0);
    }

    return { inserted, duplicates };
  };

  const migrateLegacyIfNeeded = async (databaseRows: RecessoRow[]) => {
    let value: any = null;
    try {
      value = await adminGetSetting(LEGACY_KEY);
    } catch {
      return;
    }

    const legacy = normalizeLegacyArchive(value);
    if (!legacy.files.length) return;

    let migrated = 0;
    let duplicates = 0;

    try {
      for (const file of legacy.files) {
        const normalizedRows = (file.rows as RecessoRow[]).map((row, index) => {
          const dedupKey = createDedupKey(
            row.commodity,
            row.denominazione,
            row.podPdr,
            row.monthKey,
            `${file.name}|${row.sourceSheet || ""}|legacy-${index}`
          );

          return {
            ...row,
            id: dedupKey,
            dedupKey,
          };
        });

        const result = await importRowsToDatabase(file.name, normalizedRows);
        migrated += result.inserted;
        duplicates += result.duplicates;
      }

      let clearError: any = null;
      try {
        await adminUpsertSettings([
          { key: LEGACY_KEY, value_json: { version: 1, files: [] } },
        ]);
      } catch (error) {
        clearError = error;
      }

      if (!clearError) {
        await fetchDatabaseRows();
        setLastImportMessage(
          `Archivio precedente migrato nel database: ${migrated} righe importate, ${duplicates} duplicati già presenti.`
        );
      }
    } catch (migrationError) {
      console.error("LEGACY MIGRATION ERROR:", migrationError);
      if (!databaseRows.length) {
        setLastImportMessage("La nuova tabella è attiva, ma la migrazione automatica del vecchio archivio non è riuscita.");
      }
    }
  };

  const loadArchive = async () => {
    setLoading(true);

    try {
      const databaseRows = await fetchDatabaseRows();
      setStorageMode("database");

      // La migrazione può modificare il database dopo il primo caricamento.
      // Rileggiamo sempre l'archivio al termine per evitare che la UI
      // rimanga ferma sul risultato iniziale vuoto.
      await migrateLegacyIfNeeded(databaseRows);
      await fetchDatabaseRows();
    } catch (error: any) {
      console.warn("ARCHIVE DB NOT READY, FALLBACK LEGACY:", error);
      setStorageMode("legacy");
      await loadLegacy();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadArchive();
  }, []);

  const months = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.monthKey).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [rows]
  );

  const agents = useMemo(
    () =>
      Array.from(new Set(rows.filter(row=>isGeneralAgentIncluded(row.agente)).map((row) => row.agente.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it")
      ),
    [rows,excludedGeneralAgents]
  );

  const provinces = useMemo(() => {
    const map = new Map<string, { code: string; label: string; region: string }>();

    rows.forEach((row) => {
      const geo = deriveLegalSeatGeo(row.raw);
      if (!geo.provinceCode) return;
      map.set(geo.provinceCode, {
        code: geo.provinceCode,
        label: geo.provinceLabel || geo.provinceCode,
        region: geo.region,
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "it")
    );
  }, [rows]);

  const regions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => deriveLegalSeatGeo(row.raw).region)
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [rows]
  );

  const customerNames = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.denominazione.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it")
      ),
    [rows]
  );

  const customerTypes = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.tipoCliente.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it")
      ),
    [rows]
  );

  const fileStats = useMemo(() => {
    const map = new Map<string, number>();

    rows.forEach((row) => {
      const sources = row.sourceFiles.length ? row.sourceFiles : row.sourceFile ? [row.sourceFile] : [];
      sources.forEach((name) => {
        map.set(name, (map.get(name) || 0) + 1);
      });
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [rows]);

  const detailRows = useMemo(() => rows.filter(row => {
    if (!isGeneralAgentIncluded(row.agente)) return false;
    if (detailSourceIds && !detailSourceIds.has(row.id)) return false;
    const geo = deriveLegalSeatGeo(row.raw);
    if (detailAgents.length&&!detailAgents.includes(row.agente)) return false;
    if (detailAgent && !row.agente.toLocaleLowerCase("it").includes(detailAgent.toLocaleLowerCase("it"))) return false;
    if (detailRegion && geo.region !== detailRegion) return false;
    if (detailProvince && geo.provinceCode !== detailProvince) return false;
    if (detailMonths.length&&!detailMonths.includes(row.monthKey)) return false;
    if (detailMonth && row.monthKey !== detailMonth) return false;
    if (detailCommodity && !detailCommodity.split(",").includes(row.commodity)) return false;
    if (detailSearch) {
      const needle = detailSearch.toLocaleLowerCase("it").trim();
      const haystack = [row.denominazione, row.podPdr, row.agente, row.tipoCliente,
        row.validita, row.sourceFiles.join(" "), geo.region, geo.provinceLabel,
        ...Object.values(row.raw)].join(" ").toLocaleLowerCase("it");
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }).sort((a,b) => {
    if (detailSort === "consumption") {
      const av = a.consumo, bv = b.consumo;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * (detailSortAsc ? 1 : -1);
    }
    const value = (row: RecessoRow) => detailSort === "month" ? row.monthKey :
      detailSort === "agent" ? row.agente : detailSort === "name" ? row.denominazione :
      detailSort === "pod" ? row.podPdr : detailSort === "commodity" ? row.commodity :
      deriveLegalSeatGeo(row.raw).provinceLabel;
    const comparison = value(a).localeCompare(value(b), "it", { numeric: true, sensitivity: "base" });
    return comparison * (detailSortAsc ? 1 : -1) || a.denominazione.localeCompare(b.denominazione, "it");
  }),
  [rows, excludedGeneralAgents, detailSourceIds, detailAgent, detailAgents, detailRegion, detailProvince, detailMonth, detailMonths, detailCommodity, detailSearch, detailSort, detailSortAsc]);

  const filteredRows = useMemo(() => {
    const min = consumptionMin.trim() === "" ? null : Number(consumptionMin.replace(",", "."));
    const max = consumptionMax.trim() === "" ? null : Number(consumptionMax.replace(",", "."));
    const customerNeedle = customerName.trim().toLocaleLowerCase("it");
    const needle = search.trim().toLocaleLowerCase("it");

    return rows.filter((row) => {
      if (!isGeneralAgentIncluded(row.agente)) return false;
      if (commodities.length && !commodities.includes(row.commodity)) return false;
      if (monthsSelected.length && !monthsSelected.includes(row.monthKey)) return false;
      if (agentsSelected.length && !agentsSelected.includes(row.agente)) return false;

      const geo = deriveLegalSeatGeo(row.raw);
      if (provincesSelected.length && !provincesSelected.includes(geo.provinceCode)) return false;
      if (regionsSelected.length && !regionsSelected.includes(geo.region)) return false;

      if (
        customerNeedle &&
        !String(row.denominazione || "").toLocaleLowerCase("it").includes(customerNeedle)
      ) {
        return false;
      }
      if (customerTypesSelected.length && !customerTypesSelected.includes(row.tipoCliente)) return false;
      if (min !== null && Number.isFinite(min) && (row.consumo === null || row.consumo < min)) return false;
      if (max !== null && Number.isFinite(max) && (row.consumo === null || row.consumo > max)) return false;
      if (periodStart && (!row.monthKey || row.monthKey < periodStart)) return false;
      if (periodEnd && (!row.monthKey || row.monthKey > periodEnd)) return false;

      if (needle) {
        const haystack = [
          row.sourceFiles.join(" "),
          row.sourceSheet,
          row.commodity,
          row.validita,
          row.agente,
          geo.provinceLabel,
          geo.region,
          row.denominazione,
          row.podPdr,
          row.tipoCliente,
          row.consumo ?? "",
          ...Object.values(row.raw),
        ]
          .join(" ")
          .toLocaleLowerCase("it");

        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [
    rows,
    excludedGeneralAgents,
    commodities,
    monthsSelected,
    agentsSelected,
    provincesSelected,
    regionsSelected,
    customerName,
    customerTypesSelected,
    consumptionMin,
    consumptionMax,
    periodStart,
    periodEnd,
    search,
  ]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        if (row.commodity === "LUCE") {
          acc.luceCount += 1;
          if (row.consumo !== null) acc.luce += row.consumo;
        }

        if (row.commodity === "GAS") {
          acc.gasCount += 1;
          if (row.consumo !== null) acc.gas += row.consumo;
        }

        return acc;
      },
      { luce: 0, gas: 0, luceCount: 0, gasCount: 0 }
    );
  }, [filteredRows]);

  const onChooseFiles = async (files?: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    setParsing(true);
    setParsingProgress("");
    setLastImportMessage("");

    try {
      const parsedFiles: ParsedFile[] = [];
      const emptyFiles: string[] = [];

      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        setParsingProgress(
          `Analizzo file ${index + 1} di ${selected.length}: ${file.name}`
        );

        // Forza il repaint prima di iniziare l'analisi del file successivo.
        await yieldToBrowser();

        const parsed = await parseRecessiFile(file);
        if (parsed.rows.length) {
          parsedFiles.push(parsed);
        } else {
          emptyFiles.push(file.name);
        }

        await yieldToBrowser();
      }

      setPendingFiles(parsedFiles);

      if (emptyFiles.length) {
        alert(
          `Questi file sono stati letti ma non contengono righe dati riconosciute:\n${emptyFiles.join("\n")}`
        );
      }
    } catch (error: any) {
      console.error(error);
      alert("Errore nella lettura dei file: " + (error?.message || error));
      setPendingFiles([]);
    } finally {
      setParsing(false);
      setParsingProgress("");
    }
  };

  const saveLegacyArchive = async (next: LegacyArchive) => {
    await adminUpsertSettings([{ key: LEGACY_KEY, value_json: next }]);

    setLegacyArchive(next);
    setRows(next.files.flatMap((file) => file.rows as RecessoRow[]));
  };

  const addPendingFiles = async () => {
    if (!pendingFiles.length) return;

    setSaving(true);

    try {
      let insertedTotal = 0;
      let duplicateTotal = 0;

      if (storageMode === "database") {
        for (const pendingFile of pendingFiles) {
          const result = await importRowsToDatabase(pendingFile.name, pendingFile.rows);
          insertedTotal += result.inserted;
          duplicateTotal += result.duplicates + pendingFile.duplicateRowsInFile;
        }

        await fetchDatabaseRows();

        setLastImportMessage(
          `Import completato: ${pendingFiles.length} file elaborati, ${insertedTotal} nuove righe salvate, ${duplicateTotal} duplicati ignorati.`
        );
      } else {
        let nextArchive: LegacyArchive = {
          version: 1,
          files: [...legacyArchive.files],
        };
        const existingKeys = new Set(rows.map((row) => row.dedupKey));

        for (const pendingFile of pendingFiles) {
          const uniqueNewRows = pendingFile.rows.filter((row) => {
            if (existingKeys.has(row.dedupKey)) return false;
            existingKeys.add(row.dedupKey);
            return true;
          });

          const duplicateDb = pendingFile.rows.length - uniqueNewRows.length;
          duplicateTotal += duplicateDb + pendingFile.duplicateRowsInFile;
          insertedTotal += uniqueNewRows.length;

          nextArchive = {
            version: 1,
            files: [
              ...nextArchive.files.filter(
                (file) => file.name.toLocaleLowerCase("it") !== pendingFile.name.toLocaleLowerCase("it")
              ),
              {
                id: pendingFile.id,
                name: pendingFile.name,
                uploadedAt: pendingFile.uploadedAt,
                rows: uniqueNewRows,
              },
            ],
          };
        }

        await saveLegacyArchive(nextArchive);

        setLastImportMessage(
          `Import completato in modalità compatibilità: ${pendingFiles.length} file elaborati, ${insertedTotal} nuove righe salvate, ${duplicateTotal} duplicati ignorati.`
        );
      }

      setPendingFiles([]);
    } catch (error: any) {
      console.error("SAVE ARCHIVE ERROR:", error);
      alert("Errore nel salvataggio dell'archivio: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (row: RecessoRow) => {
    const customer = row.denominazione || "Cliente non indicato";
    const point = row.podPdr || "POD/PDR non indicato";
    const validity = row.validita || monthLabel(row.monthKey);

    const confirmed = window.confirm(
      `Eliminare questa voce dall'archivio RECESSI?\n\nCliente: ${customer}\nPOD/PDR: ${point}\nValidità: ${validity}`
    );
    if (!confirmed) return;

    setSaving(true);

    try {
      if (storageMode === "database") {
        const { data, error } = await supabase.rpc("archive_recessi_delete_row", {
          p_id: Number(row.id),
        });

        if (error) throw error;

        await fetchDatabaseRows();

        const deleted = Number(data?.deleted || 0);
        if (!deleted) {
          alert("La voce non è stata trovata nel database.");
        }
      } else {
        const nextFiles = legacyArchive.files
          .map((file) => ({
            ...file,
            rows: (file.rows as RecessoRow[]).filter(
              (item) => item.dedupKey !== row.dedupKey
            ),
          }))
          .filter((file) => file.rows.length > 0);

        await saveLegacyArchive({
          version: 1,
          files: nextFiles,
        });
      }

      setLastImportMessage("Voce eliminata dall'archivio.");
    } catch (error: any) {
      console.error("REMOVE ARCHIVE ROW ERROR:", error);
      alert("Errore nell'eliminazione della voce: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const removeFile = async (fileName: string) => {
    if (!window.confirm(`Rimuovere "${fileName}" dall'archivio RECESSI?`)) return;

    setSaving(true);

    try {
      if (storageMode === "database") {
        const { error } = await supabase.rpc("archive_recessi_remove_file", {
          p_file_name: fileName,
        });

        if (error) throw error;
        await fetchDatabaseRows();
      } else {
        const next: LegacyArchive = {
          version: 1,
          files: legacyArchive.files.filter((file) => file.name !== fileName),
        };
        await saveLegacyArchive(next);
      }
    } catch (error: any) {
      console.error("REMOVE ARCHIVE FILE ERROR:", error);
      alert("Errore nella rimozione del file: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => {
    setCommodities([]);
    setMonthsSelected([]);
    setAgentsSelected([]);
    setAgentsSearch("");
    setProvincesSelected([]);
    setRegionsSelected([]);
    setCustomerName("");
    setCustomerTypesSelected([]);
    setConsumptionMin("");
    setConsumptionMax("");
    setPeriodStart("");
    setPeriodEnd("");
    setSearch("");
  };

  const exportMonthlyPdf = async () => {
    if(!filteredRows.length||exportingPdf)return;
    setExportingPdf(true);
    try{
      const grouped=filteredRows.reduce((map,row)=>{const month=row.monthKey||"SENZA MESE";const g=map.get(month)||{month,luceCount:0,luce:0,gasCount:0,gas:0};if(row.commodity==="LUCE"){g.luceCount++;g.luce+=Number(row.consumo||0);}else if(row.commodity==="GAS"){g.gasCount++;g.gas+=Number(row.consumo||0);}map.set(month,g);return map;},new Map<string,{month:string;luceCount:number;luce:number;gasCount:number;gas:number}>());
      const monthly=[...grouped.values()].sort((a,b)=>b.month.localeCompare(a.month));
      await exportFilteredA4Pdf({title:"RECESSI MENSILI - LUCE E GAS",subtitle:"Riepilogo per mese, con Luce e Gas affiancati come nella schermata.",filename:"RECESSI_MENSILI.pdf",filters:[pdfSelection("Fornitura",commodities,"Luce e Gas"),pdfSelection("Mesi",monthsSelected.map(monthLabel),"Tutti i mesi"),pdfSelection("Agenti",agentsSelected,"Tutti"),"Totale recessi filtrati: "+filteredRows.length],stats:[{label:"RECESSI LUCE",value:pdfNumber(totals.luceCount,0)},{label:"CONSUMO LUCE",value:pdfNumber(totals.luce)+" kWh"},{label:"RECESSI GAS",value:pdfNumber(totals.gasCount,0)},{label:"CONSUMO GAS",value:pdfNumber(totals.gas)+" Smc"}],columns:[{label:"MESE",width:32},{label:"LUCE - N. RECESSI",width:25,align:"right"},{label:"LUCE - CONSUMO kWh",width:42,align:"right"},{label:"GAS - N. RECESSI",width:25,align:"right"},{label:"GAS - CONSUMO Smc",width:42,align:"right"}],rows:monthly.map(g=>[g.month==="SENZA MESE"?g.month:monthLabel(g.month),pdfNumber(g.luceCount,0),pdfNumber(g.luce),pdfNumber(g.gasCount,0),pdfNumber(g.gas)])});
    }catch(e){alert("Errore PDF riepilogo recessi: "+(e instanceof Error?e.message:String(e)));}finally{setExportingPdf(false);}
  };
  const recessContactNumber=(raw:Record<string,unknown>):string=>{
    const fields=Object.entries(raw||{});
    const normalized=(v:string)=>v.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]/g,"");
    const find=(names:string[])=>{for(const name of names){const entry=fields.find(([key])=>normalized(key)===normalized(name));if(entry&&entry[1]!=null&&String(entry[1]).trim())return String(entry[1]).trim();}return "";};
    return find(["CELLULARE","NUMERO CELLULARE","TELEFONO CELLULARE","MOBILE","NUMERO MOBILE","TEL CELL","CELL","RECAPITO CELLULARE"])||find(["TELEFONO","NUMERO TELEFONO","TELEFONO FISSO","NUMERO FISSO","TEL","RECAPITO TELEFONICO"])||"";
  };
  const exportDetailPdf = async () => {
    if (!detailRows.length || exportingPdf) return;
    setExportingPdf(true);
    try {
      const ordered = [...detailRows].sort((a, b) =>
        b.monthKey.localeCompare(a.monthKey) ||
        a.agente.localeCompare(b.agente, "it") ||
        a.denominazione.localeCompare(b.denominazione, "it")
      );
      const provinceLabels = (detailProvince?[detailProvince]:[]).map((key) =>
        provinces.find((p) => p.code === key)?.label || key
      );
      const from = ordered[ordered.length - 1].monthKey;
      const to = ordered[0].monthKey;
      const filePeriod = from === to ? to : from + "_a_" + to;
      await exportFilteredA4Pdf({
        title: "RECESSI - ARCHIVIO FILTRATO",
        subtitle: "Recessi associati al mese della data in NOTA_RECESSO. La data di validità resta informativa.",
        filename: "RECESSI_" + filePeriod + ".pdf",
        filters: [
          pdfSelection("Periodo selezionato", detailMonths.map(monthLabel), periodStart || periodEnd
            ? (periodStart || "Inizio") + " / " + (periodEnd || "Fine") : "Tutti i mesi"),
          "Mese dettaglio: " + (detailMonth || "Tutti") + " · Filtro importato: " + (detailSourceIds?detailSourceIds.size+" righe":"nessuno"),
          pdfSelection("Fornitura", detailCommodity?[detailCommodity]:[], "Luce e Gas"),
          pdfSelection("Agente", detailAgents.length?detailAgents:(detailAgent?[detailAgent]:[]), "Tutti gli agenti"),
          pdfSelection("Provincia", provinceLabels, "Tutte"),
          pdfSelection("Regione", detailRegion?[detailRegion]:[], "Tutte"),
          "Cliente: " + ("Tutti") +
            "   /   Tipologia: " + ("" || "Tutte"),
          "Consumo min/max: " + ("-") + " / " + ("-") +
            "   /   Ricerca: " + (detailSearch || "Nessuna"),
          "Risultati esportati: " + pdfNumber(ordered.length, 0) + " su " + pdfNumber(rows.length, 0),
        ],
        stats: [
          { label: "RECESSI LUCE", value: pdfNumber(detailRows.filter(r=>r.commodity==="LUCE").length, 0), detail: "Contratti" },
          { label: "CONSUMI LUCE", value: pdfNumber(detailRows.filter(r=>r.commodity==="LUCE").reduce((n,r)=>n+(r.consumo||0),0)) + " kWh", detail: "Consumo annuo" },
          { label: "RECESSI GAS", value: pdfNumber(detailRows.filter(r=>r.commodity==="GAS").length, 0), detail: "Contratti" },
          { label: "CONSUMI GAS", value: pdfNumber(detailRows.filter(r=>r.commodity==="GAS").reduce((n,r)=>n+(r.consumo||0),0)) + " Smc", detail: "Consumo annuo" },
        ],
        columns: [
          { label: "MESE NOTA RECESSO", width: 25 },
          { label: "LUCE/GAS", width: 16 },
          { label: "DENOMINAZIONE CLIENTE", width: 48 },
          { label: "POD / PDR", width: 35 },
          { label: "CELLULARE / TELEFONO", width: 34 },
          { label: "AGENTE", width: 36 },
          { label: "NOTA RECESSO", width: 45 },
          { label: "DATA VALIDITA", width: 23 },
          { label: "TIPO CLIENTE", width: 26 },
          { label: "CONSUMO", width: 25, align: "right" },
          { label: "PROVINCIA", width: 24 },
        ],
        rows: ordered.map((row) => [
          monthLabel(row.monthKey),
          row.commodity,
          row.denominazione,
          row.podPdr,
          recessContactNumber(row.raw),
          row.agente,
          recessNoteText(row.raw),
          row.validita,
          row.tipoCliente,
          row.consumo === null ? "N/D" : pdfNumber(row.consumo),
          deriveLegalSeatGeo(row.raw).provinceLabel,
        ]),
        note: "Il mese di riferimento deriva dalla data in NOTA_RECESSO, non dalla data di validità. I consumi LUCE (kWh) e GAS (Smc) sono riepilogati separatamente. Sono esportati tutti i risultati filtrati, non soltanto i primi 500 visualizzati.",
      });
    } catch (error) {
      console.error("PDF RECESSI ERROR", error);
      alert("Non è stato possibile creare il PDF Recessi: " +
        (error instanceof Error ? error.message : "Errore sconosciuto"));
    } finally {
      setExportingPdf(false);
    }
  };

  const exportFiltered = () => {
    if (!filteredRows.length) return;

    const exportRows = filteredRows.map((row) => {
      const geo = deriveLegalSeatGeo(row.raw);

      return {
        "LUCE/GAS": row.commodity,
        "POD/PDR": row.podPdr,
        "DATA VALIDITA": row.validita,
        "NOTA RECESSO": recessNoteText(row.raw),
        "MESE RIFERIMENTO (NOTA)": monthLabel(row.monthKey),
        AGENTE: row.agente,
        PROVINCIA: geo.provinceLabel,
        REGIONE: geo.region,
        "DENOMINAZIONE CLIENTE": row.denominazione,
        "TIPOLOGIA CLIENTE": row.tipoCliente,
        CONSUMO: row.consumo ?? "",
        "FILE ORIGINE": row.sourceFiles.join(", "),
        FOGLIO: row.sourceSheet,
        ...row.raw,
      };
    });

    const sheet = XLSX.utils.json_to_sheet(exportRows);

    // Larghezze colonne automatiche, con minimi leggibili e un limite
    // massimo per evitare colonne enormi in presenza di testi molto lunghi.
    const headers = Object.keys(exportRows[0] || {});
    const minWidths: Record<string, number> = {
      "LUCE/GAS": 12,
      "POD/PDR": 20,
      "DATA VALIDITA": 15,
      "NOTA RECESSO": 34,
      "MESE RIFERIMENTO (NOTA)": 24,
      AGENTE: 18,
      PROVINCIA: 22,
      REGIONE: 20,
      "DENOMINAZIONE CLIENTE": 28,
      "TIPOLOGIA CLIENTE": 22,
      CONSUMO: 16,
      "FILE ORIGINE": 28,
      FOGLIO: 18,
    };

    sheet["!cols"] = headers.map((header) => {
      let maxLength = header.length;

      for (const row of exportRows) {
        const value = (row as Record<string, unknown>)[header];
        const text = String(value ?? "");
        if (text.length > maxLength) maxLength = text.length;
      }

      const minWidth = minWidths[header] ?? 14;
      return {
        wch: Math.min(42, Math.max(minWidth, maxLength + 2)),
      };
    });

    const validMonths = filteredRows
      .map((row) => row.monthKey)
      .filter((value) => /^\d{4}-\d{2}$/.test(value))
      .sort();

    const shortMonth = (monthKey: string) => {
      const match = monthKey.match(/^(\d{4})-(\d{2})$/);
      if (!match) return "";

      const monthNames = [
        "gen",
        "feb",
        "mar",
        "apr",
        "mag",
        "giu",
        "lug",
        "ago",
        "set",
        "ott",
        "nov",
        "dic",
      ];

      const year = match[1].slice(-2);
      const monthIndex = Number(match[2]) - 1;
      return `${monthNames[monthIndex] || ""}${year}`;
    };

    let periodPart = "";
    if (validMonths.length) {
      const oldest = shortMonth(validMonths[0]);
      const newest = shortMonth(validMonths[validMonths.length - 1]);
      periodPart = oldest === newest ? oldest : `${oldest}-${newest}`;
    }

    const rowAgents = filteredRows.map((row) => row.agente.trim());
    const uniqueAgents = Array.from(new Set(rowAgents.filter(Boolean)));
    const singleAgent =
      uniqueAgents.length === 1 &&
      rowAgents.every((value) => value === uniqueAgents[0])
        ? uniqueAgents[0]
        : "";

    const sanitizeFilePart = (value: string) =>
      value
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 60);

    const fileParts = ["RECESSI"];
    if (periodPart) fileParts.push(periodPart);
    if (singleAgent) fileParts.push(sanitizeFilePart(singleAgent));

    const fileName = `${fileParts.filter(Boolean).join("_")}.xlsx`;

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "RECESSI");
    XLSX.writeFile(book, fileName);
  };

  if (loading || storageMode === "loading") {
    return <div style={cardStyle}>Caricamento archivio...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", minWidth: 0 }}>
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>DATI PRODUZIONE</h2>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
              {archiveSection === "recessi"
                ? "RECESSI · archivio cumulativo con eliminazione automatica dei duplicati."
                : archiveSection === "produzione"
                ? "PRODUZIONE · storico report e zone commerciali."
                : archiveSection === "dettaglioProduzione"
                ? "DETTAGLIO PRODUZIONE · elenco completo dei report per agente."
                : archiveSection === "attivo"
                ? "ATTIVO PRODUZIONE · confronto produzione / recessi per agente."
                : archiveSection === "dettaglioRecessi"
                ? "DETTAGLIO RECESSI · elenco completo dei singoli recessi archiviati."
                : archiveSection === "reportAdmin"
                ? "REPORT ADMIN · stessa vista dei report agenti, con dati sempre aggiornati."
                : "AGENTI / ZONE · assegnazione territoriale degli agenti della produzione."}
            </div>
          </div>

          <div
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              background: storageMode === "database" ? "#dcfce7" : "#fff7ed",
              color: storageMode === "database" ? "#166534" : "#9a3412",
            }}
          >
            {storageMode === "database" ? "Database Supabase" : "Modalità compatibilità"}
          </div>
        </div>
      </div>

      <div className="ge-archive-main-tabs" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,width:"100%"}}>
        {([["recessi","RECESSI"],["insoluti","💶 INSOLUTI"],["produzione","PRODUZIONE"],["attivo","ATTIVO PRODUZIONE"],...(reportAdminPanel?[["reportAdmin","REPORT ADMIN"]]:[])] as [string,string][]).map(([key,label])=><button key={key} type="button" onClick={()=>setArchiveSection(key as typeof archiveSection)} style={{width:"100%",minWidth:0,minHeight:46,padding:"10px 8px",borderRadius:11,border:archiveSection===key?"1px solid #0f172a":"1px solid #cbd5e1",background:archiveSection===key?"#0f172a":"white",color:archiveSection===key?"white":"#0f172a",fontWeight:850,fontSize:13,lineHeight:1.25,cursor:"pointer",boxShadow:archiveSection===key?"0 3px 8px #0f172a22":"none"}}>{label}</button>)}
      </div>
      {(archiveSection==="recessi"||archiveSection==="dettaglioRecessi"||archiveSection==="produzione"||archiveSection==="dettaglioProduzione")&&<div className="ge-archive-sub-tabs" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,width:"100%"}}>
        {(archiveSection==="recessi"||archiveSection==="dettaglioRecessi"?([["recessi","RIEPILOGO RECESSI"],["dettaglioRecessi","DETTAGLIO RECESSI"]] as const):([["produzione","RIEPILOGO PRODUZIONE"],["dettaglioProduzione","DETTAGLIO PRODUZIONE"]] as const)).map(([key,label])=><button type="button" key={key} onClick={()=>setArchiveSection(key)} style={{width:"100%",minWidth:0,minHeight:44,padding:"9px 8px",borderRadius:10,border:"1px solid "+(archiveSection===key?"#1d4ed8":"#cbd5e1"),background:archiveSection===key?"#1d4ed8":"white",color:archiveSection===key?"white":"#0f172a",fontSize:12,fontWeight:850,lineHeight:1.25,cursor:"pointer"}}>{label}</button>)}
      </div>}
      {archiveSection === "insoluti" ? (<Insoluti token={adminToken} isAdmin />) : archiveSection === "recessi" ? (
        <>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>RECESSI · Carica file</h3>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
          Puoi selezionare e caricare più file insieme. Il mese di riferimento viene dalla data nella colonna NOTA_RECESSO (es. NOTIFICA SW OUT_31/10/2026 = OTTOBRE 2026). La data di validità resta separata. I recessi dello stesso cliente e POD/PDR nello stesso mese di Nota recesso vengono deduplicati.
        </div>

        <label style={{display:"inline-flex",alignItems:"center",gap:10,padding:"12px 18px",borderRadius:12,background:parsing||saving?"#94a3b8":"#0f172a",color:"white",fontWeight:850,cursor:parsing||saving?"not-allowed":"pointer",boxShadow:"0 4px 12px #0f172a22",border:"1px solid #334155"}}>
          <span aria-hidden="true">📤</span> SELEZIONA FILE EXCEL / CSV
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            disabled={parsing || saving}
            aria-label="Seleziona file recessi"
            style={{position:"absolute",width:1,height:1,opacity:0,overflow:"hidden"}}
            onChange={(event) => {
              void onChooseFiles(event.target.files || undefined);
              event.currentTarget.value = "";
            }}
          />
        </label>

        {parsing && (
          <div style={{ marginTop: 10, fontWeight: 700 }}>
            {parsingProgress || "Analizzo i file..."}
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
            }}
          >
            <div style={{ fontWeight: 800 }}>
              {pendingFiles.length.toLocaleString("it-IT")} file pronti per l'importazione
            </div>

            <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
              {pendingFiles.map((pendingFile) => (
                <div
                  key={pendingFile.id}
                  style={{
                    padding: "8px 9px",
                    borderRadius: 8,
                    background: "white",
                    border: "1px solid #dbeafe",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{pendingFile.name}</div>
                  <div style={{ marginTop: 3, color: "#475569", fontSize: 12 }}>
                    {pendingFile.originalRowCount.toLocaleString("it-IT")} righe lette ·{" "}
                    {pendingFile.rows.length.toLocaleString("it-IT")} righe uniche ·{" "}
                    {pendingFile.duplicateRowsInFile.toLocaleString("it-IT")} duplicati interni esclusi
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 9, color: "#475569", fontSize: 13 }}>
              Totale righe uniche nei file:{" "}
              {pendingFiles
                .reduce((sum, file) => sum + file.rows.length, 0)
                .toLocaleString("it-IT")}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void addPendingFiles()}
                disabled={saving}
                style={{
                  padding: "9px 13px",
                  borderRadius: 8,
                  border: 0,
                  background: "#16a34a",
                  color: "white",
                  fontWeight: 800,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving
                  ? "Salvataggio..."
                  : `Salva ${pendingFiles.length} file nell'archivio`}
              </button>

              <button
                type="button"
                onClick={() => setPendingFiles([])}
                disabled={saving}
                style={{
                  padding: "9px 13px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {lastImportMessage && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 9,
              background: "#f0fdf4",
              color: "#166534",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {lastImportMessage}
          </div>
        )}

        {fileStats.length > 0 && (
          <details
            style={{
              marginTop: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              background: "#f8fafc",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                padding: "11px 12px",
                fontSize: 12,
                fontWeight: 800,
                color: "#475569",
                userSelect: "none",
              }}
            >
              FILE PRESENTI NELL'ARCHIVIO ({fileStats.length})
            </summary>

            <div style={{ display: "grid", gap: 7, padding: "0 12px 12px" }}>
              {fileStats.map((file) => (
                <div
                  key={file.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    background: "white",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{file.name}</strong>
                    <span style={{ color: "#64748b", marginLeft: 8, fontSize: 12 }}>
                      {file.count.toLocaleString("it-IT")} righe collegate
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void removeFile(file.name)}
                    disabled={saving}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fff1f2",
                      color: "#b91c1c",
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Rimuovi file
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

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
          <h3 style={{ margin: 0 }}>Ricerca RECESSI</h3>
          <button
            type="button"
            onClick={resetFilters}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Azzera filtri
          </button>
        </div>

        <div className="ge-totals-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:14}}>
          {(["LUCE","GAS"] as const).map(kind=>{const gas=kind==="GAS";const count=gas?totals.gasCount:totals.luceCount;const consumption=gas?totals.gas:totals.luce;return <div key={kind} className="ge-total-card" style={{padding:"16px 20px",borderRadius:15,border:"1px solid "+(gas?"#bae6fd":"#fed7aa"),background:gas?"#edf9ff":"#fff7ed",boxShadow:"0 2px 8px #0f172a0b"}}>
            <div style={{fontSize:18,fontWeight:950,color:gas?"#0369a1":"#c2410c",marginBottom:14}}>{gas?"♨ GAS":"⚡ LUCE"}</div>
            <div className="ge-total-card__metrics" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 1px minmax(0,1.5fr)",gap:18,alignItems:"center"}}>
              <div style={{display:"grid",gap:6}}><span style={{fontSize:12,fontWeight:900,color:"#64748b",letterSpacing:".04em"}}>N° RECESSI</span><strong style={{fontFamily:"Arial, sans-serif",fontSize:29,fontWeight:900,color:gas?"#0369a1":"#1d4ed8",letterSpacing:"-.035em"}}>{count.toLocaleString("it-IT")}</strong></div>
              <div style={{width:1,height:48,background:gas?"#38bdf8":"#fb923c"}}/>
              <div style={{display:"grid",gap:6,minWidth:0}}><span style={{fontSize:12,fontWeight:900,color:"#64748b",letterSpacing:".04em"}}>CONSUMO TOTALE</span><strong style={{fontFamily:"Arial, sans-serif",fontSize:"clamp(18px,1.7vw,29px)",fontWeight:900,color:"#0f172a",letterSpacing:"-.035em",overflowWrap:"anywhere"}}>{consumption.toLocaleString("it-IT",{maximumFractionDigits:2})} <span style={{fontSize:13,color:"#64748b",fontWeight:850}}>{gas?"Smc":"kWh"}</span></strong></div>
            </div>
          </div>;})}
        </div>

        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>
          {(["LUCE","GAS"] as const).map(kind=><button key={kind} type="button" aria-pressed={commodities.includes(kind)} onClick={()=>setCommodities(current=>current.includes(kind)?current.filter(v=>v!==kind):[...current,kind])} style={{padding:"8px 15px",borderRadius:9,border:"1px solid "+(kind==="LUCE"?"#fdba74":"#7dd3fc"),background:commodities.includes(kind)?(kind==="LUCE"?"#ffedd5":"#dbeafe"):"white",color:kind==="LUCE"?"#c2410c":"#0369a1",fontWeight:900,cursor:"pointer"}}>{kind==="LUCE"?"⚡ LUCE":"♨ GAS"}</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:10,marginTop:12}}>
          <label style={{display:"grid",gap:5,fontSize:12,fontWeight:850,gridColumn:"1 / -1"}}>🔎 CERCA AGENTE<input list="recess-agent-suggestions" value={agentsSearch} placeholder="Digita il nome agente..." onChange={e=>{const value=e.target.value;setAgentsSearch(value);setAgentsSelected(agents.includes(value)?[value]:[]);}} style={{padding:"10px 12px",border:"1px solid #cbd5e1",borderRadius:9,width:"100%",boxSizing:"border-box"}}/><datalist id="recess-agent-suggestions">{agents.filter(a=>a.toLowerCase().includes(agentsSearch.toLowerCase())).map(a=><option key={a} value={a}/>)}</datalist></label>
          <MultiSelectFilter label="Luce / Gas" allLabel="Tutte le forniture" selected={commodities} onChange={setCommodities} options={[{value:"LUCE",label:"Luce"},{value:"GAS",label:"Gas"}]}/>
          <MultiSelectFilter label="Mese di riferimento" allLabel="Tutti i mesi" selected={monthsSelected} onChange={setMonthsSelected} options={months.map(m=>({value:m,label:monthLabel(m)}))}/>
          <MultiSelectFilter label="Nome agente" allLabel="Tutti gli agenti" selected={agentsSelected} onChange={setAgentsSelected} wide options={agents.map(a=>({value:a,label:a}))}/>
          <MultiSelectFilter label="Provincia" allLabel="Tutte le province" selected={provincesSelected} onChange={setProvincesSelected} options={provinces.map(p=>({value:p.code,label:p.label}))}/>
          <MultiSelectFilter label="Regione" allLabel="Tutte le regioni" selected={regionsSelected} onChange={setRegionsSelected} options={regions.map(x=>({value:x,label:x}))}/>
          <label style={{fontSize:12,fontWeight:850}}>Denominazione cliente<input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Nome cliente..." style={{display:"block",padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,marginTop:5}}/></label>
          <MultiSelectFilter label="Tipologia cliente" allLabel="Tutte le tipologie" selected={customerTypesSelected} onChange={setCustomerTypesSelected} options={customerTypes.map(x=>({value:x,label:x}))}/>
          <label style={{fontSize:12,fontWeight:850}}>Consumo minimo<input type="number" value={consumptionMin} onChange={e=>setConsumptionMin(e.target.value)} placeholder="Da" style={{display:"block",padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,marginTop:5}}/></label>
          <label style={{fontSize:12,fontWeight:850}}>Consumo massimo<input type="number" value={consumptionMax} onChange={e=>setConsumptionMax(e.target.value)} placeholder="A" style={{display:"block",padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,marginTop:5}}/></label>
          <label style={{fontSize:12,fontWeight:850}}>Periodo iniziale<input type="month" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} style={{display:"block",padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,marginTop:5}}/></label>
          <label style={{fontSize:12,fontWeight:850}}>Periodo finale<input type="month" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} style={{display:"block",padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,marginTop:5}}/></label>
          <label style={{fontSize:12,fontWeight:850,gridColumn:"1 / -1"}}>Ricerca libera<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca cliente, POD/PDR, indirizzo, codice fiscale o altro testo..." style={{display:"block",padding:10,width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,marginTop:5}}/></label>
        </div>
        {!rows.length ? (
          <div style={{ marginTop: 16, color: "#64748b" }}>
            Nessun dato presente nell'archivio RECESSI.
          </div>
        ) : (
          <>
            <div style={{marginTop:20}}>
              <h3 style={{margin:"0 0 14px",fontSize:18,fontWeight:950,letterSpacing:"-.02em"}}>📅 RECESSI MENSILI · LUCE E GAS</h3>
              <div style={{display:"grid",gap:10}}>
              {Array.from(filteredRows.reduce((map,row)=>{const month=row.monthKey||"SENZA MESE";const entry=map.get(month)||{month,luce:{count:0,consumo:0,ids:[] as number[]},gas:{count:0,consumo:0,ids:[] as number[]}};const target=row.commodity==="LUCE"?entry.luce:row.commodity==="GAS"?entry.gas:null;if(target){target.count++;target.consumo+=Number(row.consumo||0);target.ids.push(row.id);}map.set(month,entry);return map;},new Map<string,{month:string;luce:{count:number;consumo:number;ids:number[]};gas:{count:number;consumo:number;ids:number[]}}>()).values()).sort((a,b)=>b.month.localeCompare(a.month)).map((g,i)=><div key={g.month} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,alignItems:"stretch",padding:"9px 12px",minHeight:94,borderRadius:15,border:"1px solid "+(i%2===0?"#dbe4ee":"#c9def5"),background:i%2===0?"#f8fafc":"#eaf3ff",boxShadow:"0 2px 8px #0f172a0b"}}>
                <div style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",padding:"2px 10px",fontSize:17,fontWeight:950,color:"#0f172a",letterSpacing:"-.02em"}}>{g.month==="SENZA MESE"?"SENZA MESE":monthLabel(g.month)}</div>
                {(["LUCE","GAS"] as const).map(kind=>{const data=kind==="LUCE"?g.luce:g.gas;const gas=kind==="GAS";return <div key={kind} style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,background:gas?"#edf9ff":"#fff7ed",border:"1px solid "+(gas?"#bae6fd":"#fed7aa")}}>
                  <div style={{display:"grid",gap:5}}>
                    <span style={{fontSize:13,fontWeight:900,color:gas?"#0369a1":"#c2410c"}}>{gas?"♨ GAS":"⚡ LUCE"}</span>
                    <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}><div style={{display:"grid",gap:2,minWidth:70}}><span style={{fontSize:10,fontWeight:900,letterSpacing:".07em",color:"#64748b"}}>N° RECESSI</span><strong style={{fontSize:24,fontWeight:850,fontFamily:"Arial, sans-serif",letterSpacing:"-.035em",color:"#0f172a",lineHeight:1.1}}>{data.count.toLocaleString("it-IT")}</strong></div><div style={{width:1,height:34,background:gas?"#7dd3fc":"#fdba74"}}/><div style={{display:"grid",gap:2}}><span style={{fontSize:10,fontWeight:900,letterSpacing:".07em",color:"#64748b"}}>CONSUMO TOTALE</span><strong style={{fontSize:20,fontWeight:850,fontFamily:"Arial, sans-serif",letterSpacing:"-.025em",color:"#0f172a"}}>{data.consumo.toLocaleString("it-IT",{maximumFractionDigits:2})} <span style={{fontSize:12,fontWeight:800,color:"#64748b"}}>{gas?"Smc":"kWh"}</span></strong></div></div>
                  </div>
                  <button type="button" disabled={!data.count} onClick={()=>{setDetailSourceIds(new Set(data.ids));setDetailAgent("");setDetailRegion("");setDetailProvince("");setDetailMonth("");setDetailMonths([]);setDetailAgents([]);setDetailAgent("");setDetailCommodity(kind);setDetailSearch("");setDetailLimit(100);setArchiveSection("dettaglioRecessi");}} style={{padding:"10px 13px",borderRadius:10,border:"1px solid "+(gas?"#7dd3fc":"#fdba74"),background:data.count?"white":"#e2e8f0",color:gas?"#0369a1":"#9a3412",fontWeight:900,cursor:data.count?"pointer":"default",whiteSpace:"nowrap"}}>VEDI CLIENTI ↗</button>
                </div>;})}
              </div>)}
              </div>
              {!filteredRows.length&&<p>Nessun recesso per i filtri selezionati.</p>}
            </div>
            <details style={{marginTop:14}}><summary style={{cursor:"pointer",fontWeight:850,color:"#475569",padding:"12px 0"}}>MOSTRA ELENCO COMPLETO DEI SINGOLI CLIENTI</summary>
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1210 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Luce/Gas",
                      "POD/PDR",
                      "Data validità",
                      "Nota recesso",
                      "Mese rif. (nota)",
                      "Agente",
                      "Denominazione cliente",
                      "Tipologia cliente",
                      "Consumo",
                      "File origine",
                      "Azioni",
                    ].map((header) => (
                      <th
                        key={header}
                        style={{
                          textAlign: "left",
                          padding: "9px 10px",
                          borderBottom: "1px solid #cbd5e1",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.slice(0, 500).map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>
                        {row.commodity}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        {row.podPdr || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        {row.validita || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        {recessNoteText(row.raw) || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        {monthLabel(row.monthKey)}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.agente || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.denominazione || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.tipoCliente || "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f1f5f9",
                          textAlign: "right",
                        }}
                      >
                        {row.consumo === null
                          ? "—"
                          : row.consumo.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.sourceFiles.join(", ") || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => void removeRow(row)}
                          disabled={saving}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #fecaca",
                            background: "#fff1f2",
                            color: "#b91c1c",
                            fontWeight: 800,
                            cursor: saving ? "default" : "pointer",
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          Elimina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 500 && (
              <div style={{ marginTop: 10, color: "#b45309", fontSize: 13, fontWeight: 700 }}>
                A video mostro le prime 500 righe. L'esportazione Excel contiene tutti i{" "}
                {filteredRows.length.toLocaleString("it-IT")} risultati filtrati.
              </div>
            )}
            </details>
          </>
        )}
      </div>
        </>
      ) : archiveSection === "dettaglioRecessi" ? (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>DETTAGLIO RECESSI</h3>
          <button type="button" onClick={()=>void exportDetailPdf()} disabled={exportingPdf||!detailRows.length} style={{padding:"10px 15px",borderRadius:9,border:0,background:"#b91c1c",color:"white",fontWeight:900,marginBottom:12,cursor:"pointer"}}>📄 ESPORTA PDF NOMINATIVI</button>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
            <button type="button" onClick={()=>setDetailSubsection("list")} style={{padding:"10px 16px",borderRadius:10,border:"1px solid #cbd5e1",background:detailSubsection==="list"?"#0f172a":"white",color:detailSubsection==="list"?"white":"#0f172a",fontWeight:850,cursor:"pointer"}}>ELENCO RECESSI</button>
            <button type="button" onClick={()=>{setDetailSubsection("notes");void loadDetailNoteHistory();}} style={{padding:"10px 16px",borderRadius:10,border:"1px solid #cbd5e1",background:detailSubsection==="notes"?"#0f172a":"white",color:detailSubsection==="notes"?"white":"#0f172a",fontWeight:850,cursor:"pointer"}}>📝 NOTE RECESSI</button>
            {([["LUCE","⚡","Energia elettrica"],["GAS","🔥","Gas"]] as const).map(([value,symbol,label])=>{const active=detailCommodity.split(",").includes(value);return <button key={value} type="button" aria-pressed={active} title={"Filtra "+label} onClick={()=>{setDetailCommodity(current=>{const chosen=current.split(",").filter(x=>x==="LUCE"||x==="GAS");const next=chosen.includes(value)?chosen.filter(x=>x!==value):[...chosen,value];return ["LUCE","GAS"].filter(x=>next.includes(x)).join(",");});setDetailLimit(100);}} style={{padding:"9px 15px",borderRadius:10,border:active?"2px solid "+(value==="LUCE"?"#f59e0b":"#0284c7"):"1px solid #cbd5e1",background:active?(value==="LUCE"?"#fef3c7":"#e0f2fe"):"white",color:value==="GAS"?"#0284c7":"#0f172a",fontSize:20,fontWeight:850,cursor:"pointer",boxShadow:active?"0 0 0 2px #0000000b":"none"}}>{value==="GAS"?<span style={{display:"inline-flex",color:"#0284c7"}}><svg width="21" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.1 22c4.9 0 8-3.3 8-7.6 0-3.4-2-5.9-4.2-8.1.3 2.4-1.2 3.7-1.2 3.7C14.8 6.3 12.5 3.5 9.4 1c.4 3.2-1.1 5.2-3.1 7.6C4.6 10.7 4 12.5 4 14.5 4 18.8 7.3 22 12.1 22Z"/></svg></span>:symbol}</button>})}
          </div>
          {detailSubsection==="notes" ? <div>
            <h3 style={{marginTop:0}}>NOTE RECESSI · DALLA PIÙ RECENTE</h3>
            <p style={{color:"#64748b",fontSize:13}}>Storico cronologico delle note aggiunte. Clicca SCHEDA per aprire il recesso e consultare la sequenza completa.</p>
            {detailNotesLoading && <p>Caricamento note...</p>}
            {!detailNotesLoading && !detailNoteHistory.length && <p>Nessuna nota nello storico. Le nuove note salvate compariranno qui.</p>}
            <div style={{display:"grid",gap:10}}>
              {detailNoteHistory.filter(item=>{if(!detailCommodity)return true;const row=rows.find(r=>Number(r.id)===item.recesso_id);return detailCommodity.split(",").includes(String(row?.commodity));}).map(item=>{
                const row=rows.find(r=>Number(r.id)===item.recesso_id);
                return <div key={item.id} style={{border:"1px solid #e2e8f0",borderRadius:12,padding:14,background:"#f8fafc"}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                    <div><strong>{row?.denominazione||"Recesso #"+item.recesso_id}</strong>
                      <div style={{fontSize:12,color:"#64748b"}}>{new Date(item.created_at).toLocaleString("it-IT")} · {row?.agente||"—"} · {row?.podPdr||"—"}</div></div>
                    <button type="button" disabled={!row} onClick={()=>{if(row){setDetailModal(row);}}}
                      style={{border:0,borderRadius:9,padding:"9px 14px",background:"#2563eb",color:"white",fontWeight:850,cursor:"pointer"}}>SCHEDA</button>
                  </div>
                  <p style={{whiteSpace:"pre-wrap",marginBottom:0}}>{item.note}</p>
                </div>;
              })}
            </div>
          </div> : <>
          {detailSourceIds && <div style={{padding:10,background:"#eff6ff",borderRadius:10,marginBottom:12}}>
            Filtri importati dalla scheda RECESSI ({detailSourceIds.size} righe).
            <button type="button" onClick={()=>setDetailSourceIds(null)} style={{marginLeft:10,cursor:"pointer"}}>RIMUOVI FILTRO IMPORTATO</button>
          </div>}
          {detailMessage && <p role="status" style={{color:"#1d4ed8"}}>{detailMessage}</p>}
          <div style={{ color: "#64748b", marginBottom: 14, fontSize: 13 }}>
            Tutti i recessi salvati nell'archivio, con filtri indipendenti e dettaglio originale di ogni riga.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10, marginBottom: 14 }}>
            <label style={{display:"grid",gap:4}}>🔎 CERCA AGENTE<input list="archive-detail-agent-suggestions" value={detailAgent} placeholder="Digita nome agente..." onChange={e=>{setDetailAgent(e.target.value);setDetailLimit(100);}} style={{width:"100%",padding:10,borderRadius:8,border:"1px solid #cbd5e1",boxSizing:"border-box"}}/><datalist id="archive-detail-agent-suggestions">{agents.map(a=><option key={a} value={a}/>)}</datalist></label>
            <MultiSelectFilter label="AGENTI" allLabel="Tutti gli agenti" options={agents.map(x=>({value:x,label:x}))} selected={detailAgents} onChange={v=>{setDetailAgents(v);setDetailLimit(100);}} />
            <MultiSelectFilter label="MESI RECESSO" allLabel="Tutti i mesi" options={months.map(x=>({value:x,label:monthLabel(x)}))} selected={detailMonths} onChange={v=>{setDetailMonths(v);setDetailLimit(100);}} />
            <label>RICERCA GENERALE<input style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box" }} placeholder="Cliente, POD/PDR, note..." value={detailSearch} onChange={e => {setDetailSearch(e.target.value);setDetailLimit(100);}} /></label>
            {([
              ["REGIONE", detailRegion, setDetailRegion, regions.map(x=>[x,x])],
              ["PROVINCIA / ZONA", detailProvince, setDetailProvince, provinces.map(x=>[x.code,x.label])],
              ["FORNITURA", detailCommodity, setDetailCommodity, [["LUCE","LUCE"],["GAS","GAS"],["LUCE,GAS","LUCE + GAS"],["N/D","N/D"]]]
            ] as Array<[string,string,(value:string)=>void,string[][]]>).map(([label,value,setValue,options])=>(
              <label key={label}>{label}<select value={value} onChange={e=>{setValue(e.target.value);setDetailLimit(100);}}
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box" }}>
                <option value="">TUTTI</option>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}
              </select></label>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <button type="button" onClick={()=>{setDetailSearch("");setDetailAgent("");setDetailRegion("");setDetailProvince("");setDetailMonth("");setDetailCommodity("");setDetailSourceIds(null);setDetailLimit(100);}}
              style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontWeight: 800 }}>AZZERA FILTRI</button>
            <strong>{detailRows.length.toLocaleString("it-IT")} recessi trovati</strong>
            <strong style={{color:"#b45309",background:"#fffbeb",padding:"7px 11px",borderRadius:9,border:"1px solid #fcd34d"}}>⚡ {detailRows.filter(r=>String(r.commodity).toUpperCase()==="LUCE").reduce((total,r)=>total+(Number(r.consumo)||0),0).toLocaleString("it-IT",{maximumFractionDigits:2})} kWh totali</strong>
            <strong style={{color:"#0369a1",background:"#eff6ff",padding:"7px 11px",borderRadius:9,border:"1px solid #bae6fd"}}>🔥 {detailRows.filter(r=>String(r.commodity).toUpperCase()==="GAS").reduce((total,r)=>total+(Number(r.consumo)||0),0).toLocaleString("it-IT",{maximumFractionDigits:2})} Smc totali</strong>
            <span style={{ color: "#64748b", fontSize: 13 }}>su {rows.length.toLocaleString("it-IT")} archiviati</span>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 13 }}>
              <thead style={{ background: "#f1f5f9" }}><tr>
                {([["MESE RECESSO","month"],["AGENTE","agent"],["NOMINATIVO","name"],["POD / PDR","pod"],["CELLULARE / TELEFONO",""],["LUCE / GAS","commodity"],["CONSUMO","consumption"],["PROVINCIA","province"],["DETTAGLI",""]] as const).map(([label,key])=>
                  <th key={label} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
                    {key ? <button type="button" title={"Ordina per " + label}
                      onClick={()=>{if(detailSort===key)setDetailSortAsc(v=>!v);else {setDetailSort(key);setDetailSortAsc(key==="name"||key==="agent"||key==="province"||key==="pod"||key==="commodity");}setDetailLimit(100);}}
                      style={{ background: "transparent", border: 0, cursor: "pointer", fontWeight: 900, color: detailSort===key?"#2563eb":"#0f172a", padding: 0 }}>
                      {label} {detailSort===key?(detailSortAsc?"▲":"▼"):"↕"}
                    </button> : label}
                  </th>)}
              </tr></thead>
              <tbody>{detailRows.slice(0,detailLimit).map(row=>{
                const geo=deriveLegalSeatGeo(row.raw);
                return <React.Fragment key={row.id}>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: detailRecovered[row.id] ? "#bbf7d0" : "transparent", color: detailRecovered[row.id] ? "#14532d" : "inherit" }}>
                    <td style={{ padding: 9, whiteSpace: "nowrap" }}>{row.monthKey || "—"}</td>
                    <td style={{ padding: 9 }}>{row.agente || "—"}</td>
                    <td style={{ padding: 9, fontWeight: 750 }}>{row.denominazione || "—"}</td>
                    <td style={{ padding: 9 }}>{row.podPdr || "—"}</td>
                    <td style={{ padding: 9,whiteSpace:"nowrap" }}>{recessContactNumber(row.raw)||"—"}</td>
                    <td style={{ padding: 9 }}>{row.commodity}</td>
                    <td style={{ padding: 9 }}>{row.consumo === null ? "—" : row.consumo.toLocaleString("it-IT")}</td>
                    <td style={{ padding: 9 }}>{geo.provinceLabel || geo.provinceCode || "—"}</td>
                    <td style={{ padding: 9, minWidth:340, whiteSpace:"nowrap" }}><div style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"nowrap",whiteSpace:"nowrap"}}>
                      <button type="button" onClick={()=>setDetailModal(row)} style={{border:"1px solid #bfdbfe",borderRadius:8,padding:"7px 10px",background:"#eff6ff",color:"#1d4ed8",fontWeight:800,cursor:"pointer"}}>SCHEDA</button>
                      <button type="button" onClick={()=>{setDetailNotesRow(row);setDetailNotesText(detailNotes[row.id]||"");}} style={{border:"1px solid #fed7aa",borderRadius:8,padding:"7px 10px",background:"#fff7ed",color:"#c2410c",fontWeight:800,cursor:"pointer"}}>📝 NOTE{detailNotes[row.id]?" ●":""}</button>
                      <label style={{display:"inline-flex",alignItems:"center",gap:5,padding:"7px 9px",borderRadius:8,background:detailRecovered[row.id]?"#16a34a":"#f1f5f9",color:detailRecovered[row.id]?"white":"#334155",fontWeight:850,cursor:detailRecovering?"wait":"pointer"}}>
                        <input type="checkbox" checked={Boolean(detailRecovered[row.id])} disabled={Boolean(detailRecovering)}
                          onChange={e=>void toggleDetailRecovered(row,e.target.checked)} style={{width:17,height:17,accentColor:"#15803d"}}/>
                        RECUPERATO
                      </label></div>
                    </td>
                  </tr>
                </React.Fragment>;
              })}</tbody>
            </table>
          </div>
          {detailRows.length>detailLimit && <button type="button" onClick={()=>setDetailLimit(v=>v+100)}
            style={{ marginTop: 14, padding: "11px 18px", background: "#2563eb", color: "white", border: 0, borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
            MOSTRA ALTRI 100 · {Math.min(detailLimit,detailRows.length)} di {detailRows.length}
          </button>}
          {!detailRows.length && <p>Nessun recesso corrisponde ai filtri selezionati.</p>}
          </>}
        </div>
      ) : archiveSection === "attivo" ? (
        <ActiveProduction />
      ) : archiveSection === "reportAdmin" && reportAdminPanel ? (
        <div style={{ width: "100%", minWidth: 0 }}>{reportAdminPanel}</div>
      ) : (
        <Production view={archiveSection === "zone" ? "zone" : archiveSection === "dettaglioProduzione" ? "dettaglio" : "produzione"} onOpenDetail={(period,commodity)=>{setArchiveSection("dettaglioProduzione");sessionStorage.setItem("ge_production_detail_period",period);sessionStorage.setItem("ge_production_detail_commodity",commodity);}} />
      )}
      {(detailModal || detailNotesRow || detailCalendarRow) && (
        <div role="presentation" onClick={()=>{if(!detailBusy){setDetailModal(null);setDetailNotesRow(null);setDetailCalendarRow(null);}}}
          style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(15,23,42,.65)",display:"grid",placeItems:"center",padding:14}}>
          <div role="dialog" aria-modal="true" aria-label="Dettaglio recesso" onClick={e=>e.stopPropagation()}
            style={{width:"min(760px,100%)",maxHeight:"90vh",overflowY:"auto",background:"white",borderRadius:18,padding:22,boxSizing:"border-box",boxShadow:"0 20px 70px #0004"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
              <h3 style={{margin:0}}>{detailCalendarRow?"📅 INSERISCI NEL CALENDARIO":detailNotesRow?"📝 NOTE RECESSO":"📋 SCHEDA RECESSO"}</h3>
              <button type="button" disabled={detailBusy} onClick={()=>{setDetailModal(null);setDetailNotesRow(null);setDetailCalendarRow(null);}}
                style={{border:0,borderRadius:9,padding:"9px 13px",background:"#e2e8f0",cursor:"pointer"}}>✕ CHIUDI</button>
            </div>
            <p style={{fontWeight:800,color:"#334155"}}>{(detailCalendarRow||detailNotesRow||detailModal)?.denominazione}</p>
            {detailModal && !detailCalendarRow && !detailNotesRow && <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
                {Object.entries(detailModal.raw).map(([key,value])=><div key={key} style={{overflowWrap:"anywhere",padding:9,background:"#f8fafc",borderRadius:9}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>{key}</div><div>{String(value||"—")}</div>
                </div>)}
              </div>
              <div style={{marginTop:16,padding:12,background:"#f0f9ff",borderRadius:10}}>
                <strong>STORICO NOTE · DALLA PIÙ RECENTE</strong>
                {detailNoteHistory.filter(x=>Number(detailModal.id)===x.recesso_id).map(x=>
                  <div key={x.id} style={{padding:"9px 0",borderBottom:"1px solid #cbd5e1"}}>
                    <div style={{fontSize:12,color:"#64748b"}}>{new Date(x.created_at).toLocaleString("it-IT")}</div>
                    <div style={{whiteSpace:"pre-wrap"}}>{x.note}</div>
                  </div>)}
                {!detailNoteHistory.some(x=>Number(detailModal.id)===x.recesso_id) && <p style={{fontSize:13,color:"#64748b"}}>Nessuna nota nello storico.</p>}
              </div>
              <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
                <button type="button" onClick={()=>{setDetailCalendarRow(detailModal);setDetailCalendarDate("");setDetailCalendarTime("");setDetailCalendarType("ALTRO");setDetailModal(null);}}
                  style={{border:0,borderRadius:10,padding:"12px 16px",background:"#2563eb",color:"white",fontWeight:850,cursor:"pointer"}}>📅 AGGIUNGI AL CALENDARIO</button>
                <button type="button" onClick={()=>{setDetailNotesRow(detailModal);setDetailNotesText(detailNotes[detailModal.id]||"");setDetailModal(null);}}
                  style={{border:0,borderRadius:10,padding:"12px 16px",background:"#ffedd5",color:"#9a3412",fontWeight:850,cursor:"pointer"}}>📝 NOTE</button>
              </div>
            </>}
            {detailNotesRow && <div style={{display:"grid",gap:12}}>
              <textarea rows={6} value={detailNotesText} onChange={e=>setDetailNotesText(e.target.value)}
                placeholder="Scrivi qui le note relative al recesso..." style={{width:"100%",padding:12,borderRadius:10,border:"1px solid #cbd5e1",boxSizing:"border-box",font:"inherit"}}/>
              <button type="button" disabled={detailBusy} onClick={()=>void saveDetailNote()}
                style={{border:0,borderRadius:10,padding:12,background:"#16a34a",color:"white",fontWeight:850,cursor:"pointer"}}>SALVA NOTE</button>
            </div>}
            {detailCalendarRow && <div style={{display:"grid",gap:12}}>
              <label>TIPOLOGIA DI CALENDARIO<select value={detailCalendarType} onChange={e=>setDetailCalendarType(e.target.value)} style={inputStyle}>
                <option value="ALTRO">COSE DA FARE GENERICHE / RECESSO</option>
                <option value="CHIAMARE">CHIAMARE</option><option value="APPUNTAMENTO_ZONA">APPUNTAMENTO IN ZONA</option>
                <option value="APPUNTAMENTO_SEDE">APPUNTAMENTO IN SEDE</option><option value="VIDEOCALL">VIDEOCALL</option>
              </select></label>
              <label>DATA<input type="date" value={detailCalendarDate} onChange={e=>setDetailCalendarDate(e.target.value)} style={inputStyle}/></label>
              <label>ORARIO<input type="time" value={detailCalendarTime} onChange={e=>setDetailCalendarTime(e.target.value)} style={inputStyle}/></label>
              <button type="button" disabled={detailBusy||!detailCalendarDate||!detailCalendarTime} onClick={()=>void saveDetailCalendar()}
                style={{border:0,borderRadius:10,padding:12,background:"#2563eb",color:"white",fontWeight:850,cursor:"pointer"}}>CONFERMA E INSERISCI NEL CALENDARIO</button>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}
