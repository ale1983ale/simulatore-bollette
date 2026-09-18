import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

type Commodity = "LUCE" | "GAS" | "N/D";

type RecessoRow = {
  id: string;
  sourceFile: string;
  sourceSheet: string;
  commodity: Commodity;
  validita: string;
  monthKey: string;
  agente: string;
  tipoCliente: string;
  consumo: number | null;
  raw: Record<string, string>;
};

type RecessiFile = {
  id: string;
  name: string;
  uploadedAt: string;
  rows: RecessoRow[];
};

type RecessiArchive = {
  version: 1;
  files: RecessiFile[];
};

const ARCHIVE_KEY = "archive_recessi_v1";

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
    "DATA VALIDITA",
    "DATA VALIDITÀ",
    "VALIDITA",
    "VALIDITÀ",
    "DATA VALIDITA RECESSO",
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
  tipoCliente: [
    "TIPOLOGIA CLIENTE",
    "TIPO CLIENTE",
    "CATEGORIA CLIENTE",
    "TIPOLOGIA",
    "TIPOLOGIA UTENZA",
    "TIPO USO",
    "USO",
    "DESTINAZIONE USO",
    "CATEGORIA",
  ],
  consumo: [
    "CONSUMO ANNUO",
    "CONSUMO ANNUALE",
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
    key,
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
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return {
      display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
      monthKey: `${year}-${String(month).padStart(2, "0")}`,
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded?.y && decoded?.m && decoded?.d) {
      return {
        display: `${String(decoded.d).padStart(2, "0")}/${String(decoded.m).padStart(2, "0")}/${decoded.y}`,
        monthKey: `${decoded.y}-${String(decoded.m).padStart(2, "0")}`,
      };
    }
  }

  const text = String(value ?? "").trim();
  if (!text) return { display: "", monthKey: "" };

  const ita = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (ita) {
    const day = Number(ita[1]);
    const month = Number(ita[2]);
    let year = Number(ita[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
        monthKey: `${year}-${String(month).padStart(2, "0")}`,
      };
    }
  }

  const iso = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return {
      display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
      monthKey: `${year}-${String(month).padStart(2, "0")}`,
    };
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      display: `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`,
      monthKey: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`,
    };
  }

  return { display: text, monthKey: "" };
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
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "N/D";
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${MONTHS_IT[month - 1] || ""} ${year}`.trim();
}

async function parseRecessiFile(file: File): Promise<RecessiFile> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const rows: RecessoRow[] = [];
  const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];

    if (!matrix.length) return;
    const headerIndex = findHeaderRow(matrix);
    const headers = makeHeaders(matrix[headerIndex] || []);

    matrix.slice(headerIndex + 1).forEach((sourceRow, rowIndex) => {
      if (!sourceRow || sourceRow.every((cell) => stringifyCell(cell) === "")) return;

      const raw: Record<string, string> = {};
      headers.forEach((header, colIndex) => {
        raw[header] = stringifyCell(sourceRow[colIndex]);
      });

      const commodity = inferCommodity(sheetName, raw);
      const dateRaw = findRawValue(raw, aliasGroups.validita);
      const parsedDate = parseDate(sourceRow[headers.findIndex((h) => normalize(h) === normalize(Object.keys(raw).find((key) => raw[key] === dateRaw) || ""))] ?? dateRaw);
      const agente = findRawValue(raw, aliasGroups.agente);
      const tipoCliente = findRawValue(raw, aliasGroups.tipoCliente);

      const consumptionAliases =
        commodity === "GAS"
          ? ["CONSUMO ANNUO SMC", "CONSUMO SMC", "SMC", ...aliasGroups.consumo]
          : commodity === "LUCE"
          ? ["CONSUMO ANNUO KWH", "CONSUMO KWH", "KWH", ...aliasGroups.consumo]
          : aliasGroups.consumo;
      const consumo = parseNumber(findRawValue(raw, consumptionAliases));

      rows.push({
        id: `${fileId}-${sheetIndex}-${rowIndex}`,
        sourceFile: file.name,
        sourceSheet: sheetName,
        commodity,
        validita: parsedDate.display || dateRaw,
        monthKey: parsedDate.monthKey,
        agente,
        tipoCliente,
        consumo,
        raw,
      });
    });
  });

  return {
    id: fileId,
    name: file.name,
    uploadedAt: new Date().toISOString(),
    rows,
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
  const [subTab, setSubTab] = useState<"recessi">("recessi");
  const [archive, setArchive] = useState<RecessiArchive>({ version: 1, files: [] });
  const [pendingFile, setPendingFile] = useState<RecessiFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [commodity, setCommodity] = useState("ALL");
  const [month, setMonth] = useState("ALL");
  const [agent, setAgent] = useState("ALL");
  const [customerType, setCustomerType] = useState("ALL");
  const [consumptionMin, setConsumptionMin] = useState("");
  const [consumptionMax, setConsumptionMax] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("app_settings")
        .select("value_json")
        .eq("key", ARCHIVE_KEY)
        .limit(1);

      if (error) {
        console.error("LOAD ARCHIVE RECESSI ERROR:", error);
      } else {
        const saved = data?.[0]?.value_json as RecessiArchive | undefined;
        if (saved?.version === 1 && Array.isArray(saved.files)) {
          setArchive(saved);
        }
      }
      setLoading(false);
    };

    void load();
  }, []);

  const allRows = useMemo(() => archive.files.flatMap((file) => file.rows || []), [archive]);

  const months = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.monthKey).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [allRows]
  );

  const agents = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.agente.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it")
      ),
    [allRows]
  );

  const customerTypes = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.tipoCliente.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it")
      ),
    [allRows]
  );

  const filteredRows = useMemo(() => {
    const min = consumptionMin.trim() === "" ? null : Number(consumptionMin.replace(",", "."));
    const max = consumptionMax.trim() === "" ? null : Number(consumptionMax.replace(",", "."));
    const needle = search.trim().toLocaleLowerCase("it");

    return allRows.filter((row) => {
      if (commodity !== "ALL" && row.commodity !== commodity) return false;
      if (month !== "ALL" && row.monthKey !== month) return false;
      if (agent !== "ALL" && row.agente !== agent) return false;
      if (customerType !== "ALL" && row.tipoCliente !== customerType) return false;
      if (min !== null && Number.isFinite(min) && (row.consumo === null || row.consumo < min)) return false;
      if (max !== null && Number.isFinite(max) && (row.consumo === null || row.consumo > max)) return false;

      if (needle) {
        const haystack = [
          row.sourceFile,
          row.sourceSheet,
          row.commodity,
          row.validita,
          row.agente,
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
  }, [allRows, commodity, month, agent, customerType, consumptionMin, consumptionMax, search]);

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

  const saveArchive = async (next: RecessiArchive) => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert([{ key: ARCHIVE_KEY, value_json: next }]);
    setSaving(false);

    if (error) {
      console.error("SAVE ARCHIVE RECESSI ERROR:", error);
      alert("Errore nel salvataggio online dell'archivio");
      return false;
    }

    setArchive(next);
    return true;
  };

  const onChooseFile = async (file?: File) => {
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseRecessiFile(file);
      setPendingFile(parsed);
      if (!parsed.rows.length) {
        alert("Il file è stato letto ma non trovo righe dati.");
      }
    } catch (error: any) {
      console.error(error);
      alert("Errore nella lettura del file: " + (error?.message || error));
      setPendingFile(null);
    } finally {
      setParsing(false);
    }
  };

  const addPendingFile = async () => {
    if (!pendingFile) return;

    let files = [...archive.files];
    const duplicateIndex = files.findIndex(
      (item) => item.name.toLocaleLowerCase("it") === pendingFile.name.toLocaleLowerCase("it")
    );

    if (duplicateIndex >= 0) {
      const ok = window.confirm(
        `Esiste già un file chiamato "${pendingFile.name}". Vuoi sostituirlo con quello appena caricato?`
      );
      if (!ok) return;
      files.splice(duplicateIndex, 1, pendingFile);
    } else {
      files.push(pendingFile);
    }

    const ok = await saveArchive({ version: 1, files });
    if (ok) {
      setPendingFile(null);
      alert("File salvato nell'archivio RECESSI");
    }
  };

  const removeFile = async (id: string) => {
    const target = archive.files.find((file) => file.id === id);
    if (!target) return;
    if (!window.confirm(`Eliminare "${target.name}" dall'archivio RECESSI?`)) return;
    await saveArchive({
      version: 1,
      files: archive.files.filter((file) => file.id !== id),
    });
  };

  const resetFilters = () => {
    setCommodity("ALL");
    setMonth("ALL");
    setAgent("ALL");
    setCustomerType("ALL");
    setConsumptionMin("");
    setConsumptionMax("");
    setSearch("");
  };

  const exportFiltered = () => {
    if (!filteredRows.length) return;
    const exportRows = filteredRows.map((row) => ({
      "LUCE/GAS": row.commodity,
      "DATA VALIDITA": row.validita,
      "MESE RIFERIMENTO": monthLabel(row.monthKey),
      AGENTE: row.agente,
      "TIPOLOGIA CLIENTE": row.tipoCliente,
      CONSUMO: row.consumo ?? "",
      "FILE ORIGINE": row.sourceFile,
      FOGLIO: row.sourceSheet,
      ...row.raw,
    }));

    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "RECESSI");
    XLSX.writeFile(book, `RECESSI_FILTRATI_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) {
    return <div style={cardStyle}>Caricamento archivio...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>ARCHIVIO</h2>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
              Archivio dati amministrativi con ricerca e filtri.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setSubTab("recessi")}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid #0f172a",
                background: subTab === "recessi" ? "#0f172a" : "white",
                color: subTab === "recessi" ? "white" : "#0f172a",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              RECESSI
            </button>
          </div>
        </div>
      </div>

      {subTab === "recessi" && (
        <>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Carica file RECESSI</h3>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              Puoi caricare Excel .xlsx/.xls oppure CSV. Se il file contiene fogli Energia/Luce e Gas, la tipologia viene riconosciuta automaticamente.
            </div>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={parsing || saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                void onChooseFile(file);
                event.currentTarget.value = "";
              }}
            />

            {parsing && <div style={{ marginTop: 10, fontWeight: 700 }}>Analizzo il file...</div>}

            {pendingFile && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                }}
              >
                <div style={{ fontWeight: 800 }}>{pendingFile.name}</div>
                <div style={{ marginTop: 4, color: "#475569", fontSize: 13 }}>
                  {pendingFile.rows.length.toLocaleString("it-IT")} righe lette · LUCE{" "}
                  {pendingFile.rows.filter((row) => row.commodity === "LUCE").length.toLocaleString("it-IT")} · GAS{" "}
                  {pendingFile.rows.filter((row) => row.commodity === "GAS").length.toLocaleString("it-IT")} · N/D{" "}
                  {pendingFile.rows.filter((row) => row.commodity === "N/D").length.toLocaleString("it-IT")}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void addPendingFile()}
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
                    {saving ? "Salvataggio..." : "Salva file nell'archivio"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
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

            {archive.files.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 7 }}>
                  FILE PRESENTI NELL'ARCHIVIO
                </div>
                <div style={{ display: "grid", gap: 7 }}>
                  {archive.files.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 10px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong>{file.name}</strong>
                        <span style={{ color: "#64748b", marginLeft: 8, fontSize: 12 }}>
                          {file.rows.length.toLocaleString("it-IT")} righe ·{" "}
                          {new Date(file.uploadedAt).toLocaleString("it-IT")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeFile(file.id)}
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
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                  placeholder="Cerca cliente, POD/PDR, indirizzo o qualsiasi testo presente nel file..."
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Risultati</h3>
                <div style={{ marginTop: 5, color: "#64748b", fontSize: 13 }}>
                  {filteredRows.length.toLocaleString("it-IT")} risultati su {allRows.length.toLocaleString("it-IT")}
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

            {!allRows.length ? (
              <div style={{ marginTop: 16, color: "#64748b" }}>
                Nessun file presente nell'archivio RECESSI.
              </div>
            ) : (
              <>
                <div style={{ overflowX: "auto", marginTop: 14 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Luce/Gas", "Data validità", "Mese", "Agente", "Tipologia cliente", "Consumo", "File origine", "Foglio"].map(
                          (header) => (
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
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.slice(0, 500).map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>
                            {row.commodity}
                          </td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                            {row.validita || "—"}
                          </td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                            {monthLabel(row.monthKey)}
                          </td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.agente || "—"}</td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.tipoCliente || "—"}</td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>
                            {row.consumo === null
                              ? "—"
                              : row.consumo.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.sourceFile}</td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.sourceSheet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredRows.length > 500 && (
                  <div style={{ marginTop: 10, color: "#b45309", fontSize: 13, fontWeight: 700 }}>
                    A video mostro le prime 500 righe. L'esportazione Excel contiene tutti i {filteredRows.length.toLocaleString("it-IT")} risultati.
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
