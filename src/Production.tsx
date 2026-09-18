import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

type Commodity = "LUCE" | "GAS";

type ProductionRow = {
  id: string;
  dedupKey: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  commodity: Commodity;
  agente: string;
  agentKey: string;
  inAttivazioneCount: number;
  inAttivazioneConsumo: number;
  consumoTotale: number;
  sourceFiles: string[];
};

type ParsedProductionFile = {
  id: string;
  name: string;
  originalFile: File;
  rows: ProductionRow[];
  originalRowCount: number;
  duplicateRowsInFile: number;
};

type AgentZone = {
  agentKey: string;
  agente: string;
  regione: string;
  includeInReport: boolean;
};

type MultiSelectOption = { value: string; label: string };

const PROD_TABLE = "archive_produzione";
const AGENT_ZONE_TABLE = "production_agent_zones";
const SOURCE_FILES_TABLE = "production_source_files";
const STORAGE_BUCKET = "production-reports";
const PAGE_SIZE = 1000;
const IMPORT_CHUNK = 200;

const ITALIAN_REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
];

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
    return dd + "/" + mm + "/" + value.getFullYear();
  }
  return String(value ?? "").trim();
};

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

function parseNumber(value: unknown): number {
  let valueText = String(value ?? "").trim();
  if (!valueText) return 0;
  valueText = valueText.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!valueText) return 0;
  if (valueText.includes(",") && valueText.includes(".")) {
    if (valueText.lastIndexOf(",") > valueText.lastIndexOf(".")) {
      valueText = valueText.replace(/\./g, "").replace(",", ".");
    } else {
      valueText = valueText.replace(/,/g, "");
    }
  } else if (valueText.includes(",")) {
    valueText = valueText.replace(",", ".");
  }
  const num = Number(valueText);
  return Number.isFinite(num) ? num : 0;
}

function parseItalianDate(value: string) {
  const match = String(value || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) return "";
  const dd = match[1].padStart(2, "0");
  const mm = match[2].padStart(2, "0");
  return match[3] + "-" + mm + "-" + dd;
}

function formatIsoDate(iso: string) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return match[3] + "/" + match[2] + "/" + match[1];
}

function parseReportTitle(value: unknown) {
  const valueText = stringifyCell(value);
  const match = valueText.match(
    /REPORT\s+(LUCE|GAS)\b.*?(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*-\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i
  );
  if (!match) return null;
  const commodity = match[1].toUpperCase() as Commodity;
  const periodStart = parseItalianDate(match[2]);
  const periodEnd = parseItalianDate(match[3]);
  if (!periodStart || !periodEnd) return null;
  return {
    commodity,
    periodStart,
    periodEnd,
    periodLabel: formatIsoDate(periodStart) + " - " + formatIsoDate(periodEnd),
  };
}

function isGroupOrTotalRow(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return true;
  if (/^totale\s+complessivo$/i.test(trimmed)) return true;
  const upper = trimmed.toUpperCase();
  return ITALIAN_REGIONS.some((region) => upper.startsWith(region.toUpperCase() + " -"));
}

async function parseProductionFile(file: File): Promise<ParsedProductionFile> {
  const data = await file.arrayBuffer();
  await yieldToBrowser();
  const workbook = XLSX.read(data, { type: "array", cellDates: true, dense: true });
  await yieldToBrowser();

  const byKey = new Map<string, ProductionRow>();
  let originalRowCount = 0;

  for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex += 1) {
    const sheetName = workbook.SheetNames[sheetIndex];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];

    let report: ReturnType<typeof parseReportTitle> = null;
    let inData = false;

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      const sourceRow = matrix[rowIndex] || [];
      const firstCell = stringifyCell(sourceRow[0]);
      const parsedTitle = parseReportTitle(firstCell);

      if (parsedTitle) {
        report = parsedTitle;
        inData = false;
        continue;
      }

      if (!report) continue;

      if (normalize(firstCell) === normalize("SOTTOGR.-AGENTE")) {
        inData = true;
        continue;
      }

      if (!inData || !firstCell) continue;
      if (/^totale\s+complessivo$/i.test(firstCell)) {
        inData = false;
        continue;
      }
      if (isGroupOrTotalRow(firstCell)) continue;

      originalRowCount += 1;
      const agente = firstCell.trim();
      const agentKey = normalize(agente);
      if (!agentKey) continue;

      const inAttivazioneCount = Math.round(parseNumber(sourceRow[1]));
      const dedupKey = [
        report.periodStart,
        report.periodEnd,
        report.commodity,
        agentKey,
        inAttivazioneCount,
      ].join("|");

      const row: ProductionRow = {
        id: dedupKey,
        dedupKey,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        periodLabel: report.periodLabel,
        commodity: report.commodity,
        agente,
        agentKey,
        inAttivazioneCount,
        inAttivazioneConsumo: parseNumber(sourceRow[2]),
        consumoTotale: parseNumber(sourceRow[6]),
        sourceFiles: [file.name],
      };

      if (!byKey.has(dedupKey)) byKey.set(dedupKey, row);
      if (originalRowCount % 150 === 0) await yieldToBrowser();
    }

    await yieldToBrowser();
  }

  const rows = Array.from(byKey.values());
  return {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 9),
    name: file.name,
    originalFile: file,
    rows,
    originalRowCount,
    duplicateRowsInFile: originalRowCount - rows.length,
  };
}

function dbRowToProduction(row: any): ProductionRow {
  return {
    id: String(row.id),
    dedupKey: String(row.dedup_key || ""),
    periodStart: String(row.period_start || ""),
    periodEnd: String(row.period_end || ""),
    periodLabel: String(row.period_label || ""),
    commodity: String(row.commodity || "LUCE") as Commodity,
    agente: String(row.agente || ""),
    agentKey: String(row.agent_key || ""),
    inAttivazioneCount: Number(row.in_attivazione_count || 0),
    inAttivazioneConsumo: Number(row.in_attivazione_consumo || 0),
    consumoTotale: Number(row.consumo_totale || 0),
    sourceFiles: Array.isArray(row.source_files) ? row.source_files : [],
  };
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  allLabel,
  wide,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel: string;
  wide?: boolean;
}) {
  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const summary =
    selectedLabels.length === 0
      ? allLabel
      : selectedLabels.length === 1
      ? selectedLabels[0]
      : String(selectedLabels.length) + " selezionati";

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div style={wide ? { gridColumn: "span 2", minWidth: 360 } : undefined}>
      <div style={labelStyle}>{label}</div>
      <details style={{ position: "relative", width: "100%" }}>
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
            zIndex: 40,
            top: "calc(100% + 4px)",
            left: 0,
            right: wide ? "auto" : 0,
            minWidth: wide ? 430 : undefined,
            maxWidth: "calc(100vw - 48px)",
            maxHeight: 250,
            overflow: "auto",
            padding: 8,
            background: "white",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(15,23,42,.14)",
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 6px", fontWeight: 800, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            {allLabel}
          </label>
          {options.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "7px 6px",
                borderTop: "1px solid #f1f5f9",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export default function Production() {
  const [section, setSection] = useState<"produzione" | "zone">("produzione");
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [agentZones, setAgentZones] = useState<AgentZone[]>([]);
  const [pendingFiles, setPendingFiles] = useState<ParsedProductionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [zonesDirty, setZonesDirty] = useState(false);
  const [savingZones, setSavingZones] = useState(false);
  const [zoneMessage, setZoneMessage] = useState("");

  const [periodsSelected, setPeriodsSelected] = useState<string[]>([]);
  const [commoditiesSelected, setCommoditiesSelected] = useState<string[]>([]);
  const [agentsSelected, setAgentsSelected] = useState<string[]>([]);
  const [zonesSelected, setZonesSelected] = useState<string[]>([]);

  const fetchRows = async () => {
    const loaded: ProductionRow[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(PROD_TABLE)
        .select("id,dedup_key,period_start,period_end,period_label,commodity,agente,agent_key,in_attivazione_count,in_attivazione_consumo,consumo_totale,source_files")
        .order("period_start", { ascending: false })
        .order("agente", { ascending: true })
        .range(start, start + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data || []).map(dbRowToProduction);
      loaded.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    setRows(loaded);
    return loaded;
  };

  const fetchAgentZones = async () => {
    const { data, error } = await supabase
      .from(AGENT_ZONE_TABLE)
      .select("agent_key,agente,regione,include_in_report")
      .order("agente", { ascending: true });
    if (error) throw error;
    const loaded = (data || []).map((item: any) => ({
      agentKey: String(item.agent_key || ""),
      agente: String(item.agente || ""),
      regione: String(item.regione || ""),
      includeInReport: item.include_in_report !== false,
    }));
    setAgentZones(loaded);
    setZonesDirty(false);
    return loaded;
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchRows(), fetchAgentZones()]);
      } catch (error: any) {
        console.error("LOAD PRODUCTION ERROR", error);
        setMessage("Errore nel caricamento della PRODUZIONE: " + (error?.message || error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const periods = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => map.set(row.periodStart + "|" + row.periodEnd, row.periodLabel));
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [rows]);

  const includedByAgentKey = useMemo(() => {
    const map = new Map<string, boolean>();
    agentZones.forEach((item) => map.set(item.agentKey, item.includeInReport));
    return map;
  }, [agentZones]);

  const agents = useMemo(
    () =>
      Array.from(
        new Set<string>(
          rows
            .filter((row) => includedByAgentKey.get(row.agentKey) !== false)
            .map((row) => row.agente)
            .filter(Boolean) as string[]
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [rows, includedByAgentKey]
  );

  const zoneByAgentKey = useMemo(() => {
    const map = new Map<string, string>();
    agentZones.forEach((item) => map.set(item.agentKey, item.regione));
    return map;
  }, [agentZones]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (includedByAgentKey.get(row.agentKey) === false) return false;

      const periodKey = row.periodStart + "|" + row.periodEnd;
      if (periodsSelected.length && !periodsSelected.includes(periodKey)) return false;
      if (commoditiesSelected.length && !commoditiesSelected.includes(row.commodity)) return false;
      if (agentsSelected.length && !agentsSelected.includes(row.agente)) return false;
      const zone = zoneByAgentKey.get(row.agentKey) || "";
      if (zonesSelected.length && !zonesSelected.includes(zone)) return false;
      return true;
    });
  }, [rows, periodsSelected, commoditiesSelected, agentsSelected, zonesSelected, zoneByAgentKey, includedByAgentKey]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const key = row.commodity === "LUCE" ? "luce" : "gas";
        acc[key].righe += 1;
        acc[key].attivazioni += row.inAttivazioneCount;
        acc[key].consumoAttivazione += row.inAttivazioneConsumo;
        acc[key].consumoTotale += row.consumoTotale;
        return acc;
      },
      {
        luce: { righe: 0, attivazioni: 0, consumoAttivazione: 0, consumoTotale: 0 },
        gas: { righe: 0, attivazioni: 0, consumoAttivazione: 0, consumoTotale: 0 },
      }
    );
  }, [filteredRows]);

  const fileStats = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => row.sourceFiles.forEach((name) => map.set(name, (map.get(name) || 0) + 1)));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [rows]);

  const onChooseFiles = async (files?: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setParsing(true);
    setMessage("");
    const parsed: ParsedProductionFile[] = [];
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const file = selected[i];
        setParsingProgress("Analizzo file " + (i + 1) + " di " + selected.length + ": " + file.name);
        await yieldToBrowser();
        const result = await parseProductionFile(file);
        if (result.rows.length) parsed.push(result);
      }
      setPendingFiles(parsed);
      if (!parsed.length) alert("Non ho trovato righe PRODUZIONE valide nei file selezionati.");
    } catch (error: any) {
      console.error("PARSE PRODUCTION ERROR", error);
      setPendingFiles([]);
      alert("Errore nella lettura dei file PRODUZIONE: " + (error?.message || error));
    } finally {
      setParsing(false);
      setParsingProgress("");
    }
  };

  const ensureAgents = async (productionRows: ProductionRow[]) => {
    const unique = new Map<string, string>();
    productionRows.forEach((row) => unique.set(row.agentKey, row.agente));
    const payload = Array.from(unique.entries()).map(([agent_key, agente]) => ({ agent_key, agente }));
    if (!payload.length) return;
    const { error } = await supabase
      .from(AGENT_ZONE_TABLE)
      .upsert(payload, { onConflict: "agent_key", ignoreDuplicates: true });
    if (error) throw error;
  };

  const storagePathForFile = (fileName: string) => {
    const safeName = fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    return "reports/" + (safeName || "report.xlsx");
  };

  const uploadOriginalFileToCloud = async (parsedFile: ParsedProductionFile) => {
    const storagePath = storagePathForFile(parsedFile.name);
    const contentType =
      parsedFile.originalFile.type ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, parsedFile.originalFile, {
        upsert: true,
        cacheControl: "3600",
        contentType,
      });

    if (uploadError) throw uploadError;

    const { error: metadataError } = await supabase
      .from(SOURCE_FILES_TABLE)
      .upsert(
        {
          file_name: parsedFile.name,
          storage_path: storagePath,
          file_size: parsedFile.originalFile.size,
          content_type: contentType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "file_name" }
      );

    if (metadataError) throw metadataError;

    return storagePath;
  };

  const removeOriginalFileFromCloud = async (fileName: string) => {
    const { data, error: lookupError } = await supabase
      .from(SOURCE_FILES_TABLE)
      .select("storage_path")
      .eq("file_name", fileName)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const storagePath = String(data?.storage_path || "");
    if (storagePath) {
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);
      if (removeError) throw removeError;
    }

    const { error: metadataDeleteError } = await supabase
      .from(SOURCE_FILES_TABLE)
      .delete()
      .eq("file_name", fileName);

    if (metadataDeleteError) throw metadataDeleteError;
  };

  const importRows = async (fileName: string, importRows: ProductionRow[]) => {
    let inserted = 0;
    let duplicates = 0;
    await ensureAgents(importRows);

    for (let start = 0; start < importRows.length; start += IMPORT_CHUNK) {
      const chunk = importRows.slice(start, start + IMPORT_CHUNK);
      const keys = chunk.map((row) => row.dedupKey);
      const { data: existingData, error: existingError } = await supabase
        .from(PROD_TABLE)
        .select("dedup_key,source_files")
        .in("dedup_key", keys);
      if (existingError) throw existingError;

      const existing = new Map<string, string[]>();
      (existingData || []).forEach((item: any) => {
        existing.set(String(item.dedup_key || ""), Array.isArray(item.source_files) ? item.source_files : []);
      });

      const payload = chunk.map((row) => {
        const already = existing.get(row.dedupKey) || [];
        const sourceFiles = Array.from(new Set([...already, fileName])).sort();
        if (existing.has(row.dedupKey)) duplicates += 1;
        else inserted += 1;
        return {
          dedup_key: row.dedupKey,
          period_start: row.periodStart,
          period_end: row.periodEnd,
          period_label: row.periodLabel,
          commodity: row.commodity,
          agente: row.agente,
          agent_key: row.agentKey,
          in_attivazione_count: row.inAttivazioneCount,
          in_attivazione_consumo: row.inAttivazioneConsumo,
          consumo_totale: row.consumoTotale,
          source_files: sourceFiles,
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase.from(PROD_TABLE).upsert(payload, { onConflict: "dedup_key" });
      if (error) throw error;
    }

    return { inserted, duplicates };
  };

  const savePendingFiles = async () => {
    if (!pendingFiles.length) return;
    setSaving(true);
    setMessage("");
    try {
      let inserted = 0;
      let duplicates = 0;
      const fileCount = pendingFiles.length;
      let cloudUploaded = 0;

      for (const file of pendingFiles) {
        await uploadOriginalFileToCloud(file);
        cloudUploaded += 1;

        const result = await importRows(file.name, file.rows);
        inserted += result.inserted;
        duplicates += result.duplicates + file.duplicateRowsInFile;
      }

      await Promise.all([fetchRows(), fetchAgentZones()]);
      setPendingFiles([]);
      setMessage(
        "Import PRODUZIONE completato: " +
          fileCount +
          " file elaborati, " +
          cloudUploaded +
          " file originali salvati nel cloud, " +
          inserted +
          " righe nuove, " +
          duplicates +
          " duplicati ignorati."
      );
    } catch (error: any) {
      console.error("SAVE PRODUCTION ERROR", error);
      alert("Errore nel salvataggio PRODUZIONE: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (row: ProductionRow) => {
    if (!window.confirm("Eliminare questa riga PRODUZIONE?\n\n" + row.agente + "\n" + row.commodity + "\n" + row.periodLabel)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from(PROD_TABLE).delete().eq("id", Number(row.id));
      if (error) throw error;
      await fetchRows();
      setMessage("Riga PRODUZIONE eliminata.");
    } catch (error: any) {
      alert("Errore nell'eliminazione: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const removeFile = async (fileName: string) => {
    if (!window.confirm('Rimuovere il file "' + fileName + '" dall\'archivio PRODUZIONE?')) return;
    setSaving(true);
    try {
      await removeOriginalFileFromCloud(fileName);

      const affected = rows.filter((row) => row.sourceFiles.includes(fileName));
      for (const row of affected) {
        const remaining = row.sourceFiles.filter((name) => name !== fileName);
        if (!remaining.length) {
          const { error } = await supabase.from(PROD_TABLE).delete().eq("id", Number(row.id));
          if (error) throw error;
        } else {
          const { error } = await supabase.from(PROD_TABLE).update({ source_files: remaining }).eq("id", Number(row.id));
          if (error) throw error;
        }
      }
      await fetchRows();
    } catch (error: any) {
      alert("Errore nella rimozione del file: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const updateAgentRegion = (agent: AgentZone, regione: string) => {
    setAgentZones((current) =>
      current.map((item) =>
        item.agentKey === agent.agentKey ? { ...item, regione } : item
      )
    );
    setZonesDirty(true);
    setZoneMessage("");
  };

  const updateAgentInReport = (agent: AgentZone, includeInReport: boolean) => {
    setAgentZones((current) =>
      current.map((item) =>
        item.agentKey === agent.agentKey ? { ...item, includeInReport } : item
      )
    );

    if (!includeInReport) {
      setAgentsSelected((current) =>
        current.filter((name) => name !== agent.agente)
      );
    }

    setZonesDirty(true);
    setZoneMessage("");
  };

  const saveAgentZones = async () => {
    if (!zonesDirty || savingZones) return;

    setSavingZones(true);
    setZoneMessage("");

    try {
      const payload = agentZones.map((agent) => ({
        agent_key: agent.agentKey,
        agente: agent.agente,
        regione: agent.regione || null,
        include_in_report: agent.includeInReport,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from(AGENT_ZONE_TABLE)
        .upsert(payload, { onConflict: "agent_key" });

      if (error) throw error;

      setZonesDirty(false);
      setZoneMessage("Zone agenti salvate correttamente.");
    } catch (error: any) {
      console.error("SAVE AGENT ZONES ERROR", error);
      alert("Errore nel salvataggio delle zone: " + (error?.message || error));
    } finally {
      setSavingZones(false);
    }
  };

  const resetFilters = () => {
    setPeriodsSelected([]);
    setCommoditiesSelected([]);
    setAgentsSelected([]);
    setZonesSelected([]);
  };

  const exportFiltered = () => {
    if (!filteredRows.length) return;
    const exportRows = filteredRows.map((row) => ({
      "PERIODO REPORT": row.periodLabel,
      "LUCE/GAS": row.commodity,
      AGENTE: row.agente,
      ZONA: zoneByAgentKey.get(row.agentKey) || "",
      "IN ATTIVAZIONE - N° POD/PDR": row.inAttivazioneCount,
      "IN ATTIVAZIONE - CONSUMO KWH/SMC": row.inAttivazioneConsumo,
      "CONSUMO TOTALE KWH/SMC": row.consumoTotale,
    }));

    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const headers = Object.keys(exportRows[0]);
    sheet["!cols"] = headers.map((header) => {
      let maxLength = header.length;
      exportRows.forEach((row) => {
        const value = String((row as Record<string, unknown>)[header] ?? "");
        if (value.length > maxLength) maxLength = value.length;
      });
      return { wch: Math.min(38, Math.max(14, maxLength + 2)) };
    });

    const sorted = [...filteredRows].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const compact = (iso: string) => {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return "";
      const names = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
      return m[3] + names[Number(m[2]) - 1] + m[1].slice(-2);
    };
    const agentsInExport = Array.from(new Set<string>(filteredRows.map((row) => row.agente).filter(Boolean) as string[]));
    let fileName = "PRODUZIONE_" + compact(first.periodStart) + "-" + compact(last.periodEnd);
    if (agentsInExport.length === 1) fileName += "_" + agentsInExport[0].replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    fileName += ".xlsx";

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "PRODUZIONE");
    XLSX.writeFile(book, fileName);
  };

  if (loading) return <div style={cardStyle}>Caricamento PRODUZIONE...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setSection("produzione")}
          style={{
            padding: "9px 15px",
            borderRadius: 8,
            border: section === "produzione" ? "1px solid #0f172a" : "1px solid #cbd5e1",
            background: section === "produzione" ? "#0f172a" : "white",
            color: section === "produzione" ? "white" : "#0f172a",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          PRODUZIONE
        </button>
        <button
          type="button"
          onClick={() => setSection("zone")}
          style={{
            padding: "9px 15px",
            borderRadius: 8,
            border: section === "zone" ? "1px solid #0f172a" : "1px solid #cbd5e1",
            background: section === "zone" ? "#0f172a" : "white",
            color: section === "zone" ? "white" : "#0f172a",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          AGENTI / ZONE
        </button>
      </div>

      {section === "zone" ? (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <h3 style={{ margin: 0 }}>AGENTI / ZONE</h3>

            <button
              type="button"
              onClick={() => void saveAgentZones()}
              disabled={!zonesDirty || savingZones}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                border: 0,
                background: zonesDirty ? "#16a34a" : "#cbd5e1",
                color: "white",
                fontWeight: 900,
                cursor: !zonesDirty || savingZones ? "default" : "pointer",
                opacity: savingZones ? 0.7 : 1,
              }}
            >
              {savingZones ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>

          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
            Gli agenti vengono aggiunti automaticamente quando importi i report. Assegna la regione e usa la spunta Report generale per decidere quali agenti devono concorrere ai risultati PRODUZIONE e comparire nel filtro Agente.
          </div>

          {zonesDirty && (
            <div
              style={{
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#fff7ed",
                color: "#9a3412",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Hai modifiche non ancora salvate.
            </div>
          )}

          {zoneMessage && !zonesDirty && (
            <div
              style={{
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#f0fdf4",
                color: "#166534",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {zoneMessage}
            </div>
          )}
          <div style={{ display: "grid", gap: 7 }}>
            {agentZones.length === 0 ? (
              <div style={{ color: "#64748b" }}>Nessun agente ancora presente. Importa almeno un report PRODUZIONE.</div>
            ) : (
              agentZones.map((agent) => (
                <div
                  key={agent.agentKey}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(280px,1fr) minmax(220px,320px) minmax(160px,190px)",
                    gap: 12,
                    alignItems: "center",
                    padding: "9px 10px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                  }}
                >
                  <strong>{agent.agente}</strong>

                  <select
                    value={agent.regione}
                    onChange={(e) => updateAgentRegion(agent, e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Zona non assegnata</option>
                    {ITALIAN_REGIONS.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={agent.includeInReport}
                      onChange={(e) =>
                        updateAgentInReport(agent, e.target.checked)
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    Report generale
                  </label>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>PRODUZIONE · Carica file</h3>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              Puoi selezionare più report insieme. Una riga è considerata duplicata quando coincidono Periodo + Luce/Gas + Agente + N° POD/PDR in attivazione. Il file Excel originale viene salvato anche nel cloud.
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              disabled={parsing || saving}
              onChange={(event) => {
                void onChooseFiles(event.target.files || undefined);
                event.currentTarget.value = "";
              }}
            />
            {parsing && <div style={{ marginTop: 10, fontWeight: 800 }}>{parsingProgress || "Analizzo i file..."}</div>}

            {pendingFiles.length > 0 && (
              <div style={{ marginTop: 14, padding: 12, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10 }}>
                <div style={{ fontWeight: 900 }}>{pendingFiles.length} file pronti per l'importazione</div>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  {pendingFiles.map((file) => (
                    <div key={file.id} style={{ background: "white", border: "1px solid #dbeafe", borderRadius: 8, padding: "8px 9px" }}>
                      <strong>{file.name}</strong>
                      <div style={{ color: "#475569", fontSize: 12, marginTop: 3 }}>
                        {file.originalRowCount} righe lette · {file.rows.length} righe uniche · {file.duplicateRowsInFile} duplicati interni esclusi
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void savePendingFiles()}
                    disabled={saving}
                    style={{ padding: "9px 13px", border: 0, borderRadius: 8, background: "#16a34a", color: "white", fontWeight: 900 }}
                  >
                    {saving ? "Salvataggio..." : "Salva " + pendingFiles.length + " file nell'archivio"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingFiles([])}
                    disabled={saving}
                    style={{ padding: "9px 13px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", fontWeight: 800 }}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {message && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 9, background: "#f0fdf4", color: "#166534", fontWeight: 800, fontSize: 13 }}>
                {message}
              </div>
            )}

            {fileStats.length > 0 && (
              <details style={{ marginTop: 16, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
                <summary style={{ cursor: "pointer", padding: "11px 12px", fontSize: 12, fontWeight: 900, color: "#475569" }}>
                  FILE PRESENTI NELL'ARCHIVIO PRODUZIONE ({fileStats.length})
                </summary>
                <div style={{ display: "grid", gap: 7, padding: "0 12px 12px" }}>
                  {fileStats.map((file) => (
                    <div key={file.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "9px 10px", border: "1px solid #e2e8f0", borderRadius: 8, background: "white" }}>
                      <div><strong>{file.name}</strong><span style={{ color: "#64748b", marginLeft: 8, fontSize: 12 }}>{file.count} righe collegate</span></div>
                      <button type="button" disabled={saving} onClick={() => void removeFile(file.name)} style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", borderRadius: 8, padding: "6px 10px", fontWeight: 800 }}>
                        Rimuovi file
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Ricerca PRODUZIONE</h3>
              <button type="button" onClick={resetFilters} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", fontWeight: 800 }}>
                Azzera filtri
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
              <MultiSelectFilter label="Periodo report" allLabel="Tutti i periodi" selected={periodsSelected} onChange={setPeriodsSelected} options={periods} />
              <MultiSelectFilter
                label="Luce / Gas"
                allLabel="Tutti"
                selected={commoditiesSelected}
                onChange={setCommoditiesSelected}
                options={[{ value: "LUCE", label: "Luce" }, { value: "GAS", label: "Gas" }]}
              />
              <MultiSelectFilter label="Agente" allLabel="Tutti gli agenti" selected={agentsSelected} onChange={setAgentsSelected} wide options={agents.map((agent) => ({ value: agent, label: agent }))} />
              <MultiSelectFilter label="Zona" allLabel="Tutte le zone" selected={zonesSelected} onChange={setZonesSelected} options={ITALIAN_REGIONS.map((region) => ({ value: region, label: region }))} />
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Risultati PRODUZIONE</h3>
                <div style={{ marginTop: 5, color: "#64748b", fontSize: 13 }}>{filteredRows.length} risultati su {rows.length} righe uniche</div>
              </div>
              <button type="button" onClick={exportFiltered} disabled={!filteredRows.length} style={{ padding: "9px 13px", borderRadius: 8, border: 0, background: filteredRows.length ? "#0f172a" : "#cbd5e1", color: "white", fontWeight: 900 }}>
                Esporta risultati Excel
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginTop: 14 }}>
              <div style={{ padding: 13, borderRadius: 10, background: "#eff6ff" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1e40af" }}>PRODUZIONE LUCE</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>{totals.luce.attivazioni.toLocaleString("it-IT")} POD in attivazione</div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>{totals.luce.consumoAttivazione.toLocaleString("it-IT", { maximumFractionDigits: 2 })} kWh in attivazione</div>
                <div style={{ marginTop: 3, fontWeight: 800 }}>{totals.luce.consumoTotale.toLocaleString("it-IT", { maximumFractionDigits: 2 })} kWh consumo totale</div>
              </div>
              <div style={{ padding: 13, borderRadius: 10, background: "#f0fdf4" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#166534" }}>PRODUZIONE GAS</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>{totals.gas.attivazioni.toLocaleString("it-IT")} PDR in attivazione</div>
                <div style={{ marginTop: 4, fontWeight: 800 }}>{totals.gas.consumoAttivazione.toLocaleString("it-IT", { maximumFractionDigits: 2 })} Smc in attivazione</div>
                <div style={{ marginTop: 3, fontWeight: 800 }}>{totals.gas.consumoTotale.toLocaleString("it-IT", { maximumFractionDigits: 2 })} Smc consumo totale</div>
              </div>
            </div>

            {!rows.length ? (
              <div style={{ marginTop: 16, color: "#64748b" }}>Nessun dato presente nell'archivio PRODUZIONE.</div>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Periodo report", "Luce/Gas", "Agente", "Zona", "In attivazione N° POD/PDR", "In attivazione consumo", "Consumo totale", "File origine", "Azioni"].map((header) => (
                        <th key={header} style={{ textAlign: "left", padding: "9px 10px", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 500).map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{row.periodLabel}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>{row.commodity}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.agente}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{zoneByAgentKey.get(row.agentKey) || "—"}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{row.inAttivazioneCount.toLocaleString("it-IT")}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{row.inAttivazioneConsumo.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{row.consumoTotale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.sourceFiles.join(", ")}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
                          <button type="button" disabled={saving} onClick={() => void removeRow(row)} style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", borderRadius: 8, padding: "6px 10px", fontWeight: 900 }}>
                            Elimina
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length > 500 && <div style={{ marginTop: 10, color: "#b45309", fontSize: 13, fontWeight: 800 }}>A video mostro le prime 500 righe. L'export Excel contiene tutti i risultati filtrati.</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
