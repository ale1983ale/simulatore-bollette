import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

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
    parsedDate.monthKey,
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
    monthKey: parsedDate.monthKey,
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
    monthKey: String(row.month_key || ""),
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
                String(old?.monthKey || ""),
                `${name}|${String(old?.sourceSheet || "")}|${fileIndex}-${rowIndex}`
              );

              return {
                ...old,
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

export default function Archive() {
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [rows, setRows] = useState<RecessoRow[]>([]);
  const [legacyArchive, setLegacyArchive] = useState<LegacyArchive>({ version: 1, files: [] });
  const [pendingFiles, setPendingFiles] = useState<ParsedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastImportMessage, setLastImportMessage] = useState("");

  const [commodity, setCommodity] = useState("ALL");
  const [month, setMonth] = useState("ALL");
  const [agent, setAgent] = useState("ALL");
  const [customerName, setCustomerName] = useState("");
  const [customerType, setCustomerType] = useState("ALL");
  const [consumptionMin, setConsumptionMin] = useState("");
  const [consumptionMax, setConsumptionMax] = useState("");
  const [search, setSearch] = useState("");

  const loadLegacy = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value_json")
      .eq("key", LEGACY_KEY)
      .limit(1);

    if (error) {
      console.error("LOAD LEGACY ARCHIVE ERROR:", error);
      setLegacyArchive({ version: 1, files: [] });
      setRows([]);
      return;
    }

    const archive = normalizeLegacyArchive(data?.[0]?.value_json);
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
    const { data, error } = await supabase
      .from("app_settings")
      .select("value_json")
      .eq("key", LEGACY_KEY)
      .limit(1);

    if (error) return;

    const legacy = normalizeLegacyArchive(data?.[0]?.value_json);
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

      const { error: clearError } = await supabase
        .from("app_settings")
        .upsert([{ key: LEGACY_KEY, value_json: { version: 1, files: [] } }]);

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
      Array.from(new Set(rows.map((row) => row.agente.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it")
      ),
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

  const filteredRows = useMemo(() => {
    const min = consumptionMin.trim() === "" ? null : Number(consumptionMin.replace(",", "."));
    const max = consumptionMax.trim() === "" ? null : Number(consumptionMax.replace(",", "."));
    const customerNeedle = customerName.trim().toLocaleLowerCase("it");
    const needle = search.trim().toLocaleLowerCase("it");

    return rows.filter((row) => {
      if (commodity !== "ALL" && row.commodity !== commodity) return false;
      if (month !== "ALL" && row.monthKey !== month) return false;
      if (agent !== "ALL" && row.agente !== agent) return false;
      if (
        customerNeedle &&
        !String(row.denominazione || "").toLocaleLowerCase("it").includes(customerNeedle)
      ) {
        return false;
      }
      if (customerType !== "ALL" && row.tipoCliente !== customerType) return false;
      if (min !== null && Number.isFinite(min) && (row.consumo === null || row.consumo < min)) return false;
      if (max !== null && Number.isFinite(max) && (row.consumo === null || row.consumo > max)) return false;

      if (needle) {
        const haystack = [
          row.sourceFiles.join(" "),
          row.sourceSheet,
          row.commodity,
          row.validita,
          row.agente,
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
    commodity,
    month,
    agent,
    customerName,
    customerType,
    consumptionMin,
    consumptionMax,
    search,
  ]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        if (row.consumo === null) return acc;
        if (row.commodity === "LUCE") acc.luce += row.consumo;
        if (row.commodity === "GAS") acc.gas += row.consumo;
        return acc;
      },
      { luce: 0, gas: 0 }
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
    const { error } = await supabase
      .from("app_settings")
      .upsert([{ key: LEGACY_KEY, value_json: next }]);

    if (error) throw error;

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
    setCommodity("ALL");
    setMonth("ALL");
    setAgent("ALL");
    setCustomerName("");
    setCustomerType("ALL");
    setConsumptionMin("");
    setConsumptionMax("");
    setSearch("");
  };

  const exportFiltered = () => {
    if (!filteredRows.length) return;

    const exportRows = filteredRows.map((row) => ({
      "LUCE/GAS": row.commodity,
      "POD/PDR": row.podPdr,
      "DATA VALIDITA": row.validita,
      "MESE RIFERIMENTO": monthLabel(row.monthKey),
      AGENTE: row.agente,
      "DENOMINAZIONE CLIENTE": row.denominazione,
      "TIPOLOGIA CLIENTE": row.tipoCliente,
      CONSUMO: row.consumo ?? "",
      "FILE ORIGINE": row.sourceFiles.join(", "),
      FOGLIO: row.sourceSheet,
      ...row.raw,
    }));

    const sheet = XLSX.utils.json_to_sheet(exportRows);

    // Larghezze colonne automatiche, con minimi leggibili e un limite
    // massimo per evitare colonne enormi in presenza di testi molto lunghi.
    const headers = Object.keys(exportRows[0] || {});
    const minWidths: Record<string, number> = {
      "LUCE/GAS": 12,
      "POD/PDR": 20,
      "DATA VALIDITA": 15,
      "MESE RIFERIMENTO": 18,
      AGENTE: 18,
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
      .filter((value) => /^\\d{4}-\\d{2}$/.test(value))
      .sort();

    const shortMonth = (monthKey: string) => {
      const match = monthKey.match(/^(\\d{4})-(\\d{2})$/);
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
        .replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, "")
        .replace(/\\s+/g, "_")
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            <h2 style={{ margin: 0 }}>ARCHIVIO</h2>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
              RECESSI · archivio cumulativo con eliminazione automatica dei duplicati.
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

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>RECESSI · Carica file</h3>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
          Puoi selezionare e caricare più file insieme. Se una riga ha lo stesso cliente, lo stesso POD/PDR e lo stesso mese/anno di validità di una riga già presente, viene riconosciuta come duplicato e non viene creata una seconda voce.
        </div>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          disabled={parsing || saving}
          onChange={(event) => {
            void onChooseFiles(event.target.files || undefined);
            event.currentTarget.value = "";
          }}
        />

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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <div>
            <div style={labelStyle}>Luce / Gas</div>
            <select value={commodity} onChange={(e) => setCommodity(e.target.value)} style={inputStyle}>
              <option value="ALL">Tutti</option>
              <option value="LUCE">Luce</option>
              <option value="GAS">Gas</option>
              <option value="N/D">Non riconosciuti</option>
            </select>
          </div>

          <div>
            <div style={labelStyle}>Mese di riferimento</div>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle}>
              <option value="ALL">Tutti i mesi</option>
              {months.map((item) => (
                <option key={item} value={item}>
                  {monthLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Nome agente</div>
            <select value={agent} onChange={(e) => setAgent(e.target.value)} style={inputStyle}>
              <option value="ALL">Tutti gli agenti</option>
              {agents.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Denominazione cliente</div>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              list="recessi-customer-names"
              placeholder="Digita anche solo una parte del nome"
              style={inputStyle}
            />
            <datalist id="recessi-customer-names">
              {customerNames.slice(0, 1000).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          <div>
            <div style={labelStyle}>Tipologia cliente</div>
            <select value={customerType} onChange={(e) => setCustomerType(e.target.value)} style={inputStyle}>
              <option value="ALL">Tutte le tipologie</option>
              {customerTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Consumo minimo</div>
            <input
              type="number"
              value={consumptionMin}
              onChange={(e) => setConsumptionMin(e.target.value)}
              placeholder="Da"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Consumo massimo</div>
            <input
              type="number"
              value={consumptionMax}
              onChange={(e) => setConsumptionMax(e.target.value)}
              placeholder="A"
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={labelStyle}>Ricerca libera</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca cliente, POD/PDR, indirizzo, codice fiscale o altro testo..."
              style={inputStyle}
            />
          </div>
        </div>
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
          <div>
            <h3 style={{ margin: 0 }}>Risultati</h3>
            <div style={{ marginTop: 5, color: "#64748b", fontSize: 13 }}>
              {filteredRows.length.toLocaleString("it-IT")} risultati su {rows.length.toLocaleString("it-IT")} righe uniche
            </div>
          </div>

          <button
            type="button"
            onClick={exportFiltered}
            disabled={!filteredRows.length}
            style={{
              padding: "9px 13px",
              borderRadius: 8,
              border: 0,
              background: filteredRows.length ? "#0f172a" : "#cbd5e1",
              color: "white",
              fontWeight: 800,
              cursor: filteredRows.length ? "pointer" : "default",
            }}
          >
            Esporta risultati Excel
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <div style={{ padding: 12, borderRadius: 10, background: "#eff6ff" }}>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>CONSUMO LUCE</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3 }}>
              {totals.luce.toLocaleString("it-IT", { maximumFractionDigits: 2 })} kWh
            </div>
          </div>

          <div style={{ padding: 12, borderRadius: 10, background: "#f0fdf4" }}>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>CONSUMO GAS</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3 }}>
              {totals.gas.toLocaleString("it-IT", { maximumFractionDigits: 2 })} Smc
            </div>
          </div>
        </div>

        {!rows.length ? (
          <div style={{ marginTop: 16, color: "#64748b" }}>
            Nessun dato presente nell'archivio RECESSI.
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1210 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Luce/Gas",
                      "POD/PDR",
                      "Data validità",
                      "Mese",
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
          </>
        )}
      </div>
    </div>
  );
}
