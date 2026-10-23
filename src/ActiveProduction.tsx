import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { recessReferenceMonth } from "./recessPeriod";
import { exportFilteredA4Pdf, pdfNumber } from "./filteredReportsPdf";
import "./activeProduction.css";

type EnergyKind = "LUCE" | "GAS";
type ProductionRecord = {
  id: number;
  period_start: string;
  period_end: string;
  period_label: string | null;
  commodity: string;
  agente: string;
  agent_key: string | null;
  in_attivazione_count: number | null;
  in_attivazione_consumo: number | string | null;
  consumo_totale: number | string | null;
};
type AgentReportFlag = { agent_key: string; include_in_report: boolean | null };
type RecessRecord = {
  id: number;
  month_key: string | null;
  raw: Record<string, unknown> | null;
  commodity: string;
  agente: string;
  consumo: number | string | null;
};
type Period = {
  key: string; start: string; end: string;
  label: string; valid: boolean;
};
type Values = { contracts: number; consumption: number; missingConsumption: number };
type AgentSummary = {
  key: string;
  name: string;
  luce: { production: Values; recess: Values };
  gas: { production: Values; recess: Values };
};
const num = (value: unknown) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};
const keyForAgent = (value: unknown) => String(value || "").trim()
  .toLocaleUpperCase("it-IT").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Z0-9]/g, "") || "SENZAAGENTE";
const formatValue = (value: number, decimals = 0) =>
  value.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
const signed = (value: number, decimals = 0) =>
  (value > 0 ? "+" : "") + formatValue(value, decimals);
const kind = (value: string): EnergyKind | null =>
  value === "LUCE" || value === "GAS" ? value : null;
const empty = (): Values => ({ contracts: 0, consumption: 0, missingConsumption: 0 });
const freshAgent = (key: string, name: string): AgentSummary => ({
  key, name,
  luce: { production: empty(), recess: empty() },
  gas: { production: empty(), recess: empty() },
});
const padDate = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return iso.substring(8, 10) + "/" + iso.substring(5, 7) + "/" + iso.substring(0, 4);
};
const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isValidPeriod = (start: string, end: string) => {
  const s = Date.parse(start + "T00:00:00Z");
  const e = Date.parse(end + "T00:00:00Z");
  const days = (e - s) / 86400000;
  return Number.isFinite(days) && days >= 20 && days <= 45;
};
const card: React.CSSProperties = {
  background: "white", border: "1px solid #cbd5e1", borderRadius: 12, padding: 14,
};
const field: React.CSSProperties = {
  width: "100%", maxWidth: "100%", border: "1px solid #cbd5e1", borderRadius: 8,
  background: "white", padding: "10px 12px", fontSize: 14, boxSizing: "border-box",
};
const headerCell: React.CSSProperties = {
  padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap", fontSize: 12,
};
const dataCell: React.CSSProperties = {
  padding: "9px 12px", textAlign: "right", borderBottom: "1px solid #f1f5f9",
  fontVariantNumeric: "tabular-nums", fontSize: 13, whiteSpace: "nowrap",
};

async function readEntireTable<T>(table: string, columns: string, order: string) {
  const result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(table).select(columns)
      .order(order, { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(table + ": " + error.message);
    const page = (data || []) as T[];
    result.push(...page);
    if (page.length < 1000) break;
  }
  return result;
}

export default function ActiveProduction() {
  const [production, setProduction] = useState<ProductionRecord[]>([]);
  const [recesses, setRecesses] = useState<RecessRecord[]>([]);
  const [excludedAgentKeys, setExcludedAgentKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [periodSelected, setPeriodSelected] = useState<string>("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [agentQuery,setAgentQuery]=useState("");
  const [agentSelected, setAgentSelected] = useState<string>("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [p, r, flags] = await Promise.all([
        readEntireTable<ProductionRecord>(
          "archive_produzione",
          "id,period_start,period_end,period_label,commodity,agente,agent_key,in_attivazione_count,in_attivazione_consumo,consumo_totale",
          "id",
        ),
        readEntireTable<RecessRecord>(
          "archive_recessi", "id,month_key,raw,commodity,agente,consumo", "id",
        ),
        readEntireTable<AgentReportFlag>(
          "production_agent_zones", "agent_key,include_in_report", "agent_key",
        ),
      ]);
      setExcludedAgentKeys(new Set(
        flags.filter((item) => item.include_in_report === false)
          .map((item) => keyForAgent(item.agent_key))
      ));
      setProduction(p);
      setRecesses(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento degli archivi");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const periods = useMemo(() => {
    const distinct = new Map<string, Period>();
    for (const record of production) {
      const start = String(record.period_start || "");
      const end = String(record.period_end || "");
      if (!start || !end) continue;
      const key = start + "|" + end;
      if (!distinct.has(key)) distinct.set(key, {
        key, start, end, label: padDate(start) + " – " + padDate(end),
        valid: isValidPeriod(start, end),
      });
    }
    return [...distinct.values()].sort((a, b) =>
      b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
  }, [production]);
  const validPeriods = useMemo(() => periods.filter((x) => x.valid), [periods]);
  const activePeriod = periodSelected === "ALL" || periodSelected === "CUSTOM"
    ? periodSelected
    : validPeriods.some((x) => x.key === periodSelected)
      ? periodSelected
      : validPeriods[0]?.key || "";
  const customMode = activePeriod === "CUSTOM";
  const customValid = isIsoDate(customStart) && isIsoDate(customEnd) &&
    customStart <= customEnd;
  const currentPeriod = periods.find((x) => x.key === activePeriod);
  // I report di Produzione sono totali indivisibili: nel periodo libero
  // si includono soltanto i report la cui data FINE cade nell'intervallo.
  // Non si ripartiscono artificialmente contratti o consumi per giorno.
  const intervals = useMemo(
    () => activePeriod === "ALL"
      ? validPeriods
      : activePeriod === "CUSTOM"
        ? (customValid ? validPeriods.filter(
            (period) => period.end >= customStart && period.end <= customEnd
          ) : [])
        : currentPeriod ? [currentPeriod] : [],
    [activePeriod, currentPeriod, validPeriods, customValid, customStart, customEnd]
  );
  const intervalSet = useMemo(() => new Set(intervals.map((p) => p.key)), [intervals]);
  // Ogni report 11 mese precedente - 10 mese corrente confronta
  // i recessi del mese della data finale (es. 10/10 = ottobre).
  const referenceMonths = useMemo(
    () => new Set(intervals.map((p) => p.end.substring(0, 7))),
    [intervals]
  );

  const agentSummaries = useMemo(() => {
    const map = new Map<string, AgentSummary>();
    const ensure = (rawName: string) => {
      const id = keyForAgent(rawName);
      if (!map.has(id)) map.set(id, freshAgent(id, rawName.trim().toLocaleUpperCase("it-IT") || "SENZA AGENTE"));
      return map.get(id)!;
    };

    for (const row of production) {
      if (excludedAgentKeys.has(keyForAgent(row.agent_key || row.agente))) continue;
      if (!intervalSet.has(row.period_start + "|" + row.period_end)) continue;
      const commodity = kind(row.commodity);
      if (!commodity) continue;
      const item = ensure(row.agente || "");
      const value = item[commodity === "LUCE" ? "luce" : "gas"].production;
      value.contracts += num(row.in_attivazione_count);
      // Inattivazione consumo = kWh/Smc associati ai contratti conteggiati.
      // I "consumi totali" storici sono in alcune annate su colonne diverse,
      // perciò non vanno sostituiti tacitamente in questa metrica.
      value.consumption += num(row.in_attivazione_consumo);
    }
    for (const row of recesses) {
      if (excludedAgentKeys.has(keyForAgent(row.agente))) continue;
      // Anche nel periodo libero, il recesso appartiene al mese di FINE
      // del report Produzione selezionato (es. 11/09-10/10 => ottobre
      // intero, compreso NOTA_RECESSO 31/10).
      const month = recessReferenceMonth(row.raw) || String(row.month_key || "");
      if (!month || !referenceMonths.has(month)) continue;
      const commodity = kind(row.commodity);
      if (!commodity) continue;
      const item = ensure(row.agente || "");
      const value = item[commodity === "LUCE" ? "luce" : "gas"].recess;
      value.contracts += 1;
      if (row.consumo === null || row.consumo === undefined || row.consumo === "") {
        value.missingConsumption += 1;
      } else {
        value.consumption += num(row.consumo);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [production, recesses, excludedAgentKeys, intervalSet, referenceMonths]);

  const agentOptions = useMemo(() => agentSummaries.map((item) => ({
    key: item.key, name: item.name,
  })), [agentSummaries]);

  const selectedAgentExists = !!agentSelected && agentSummaries.some((a) => a.key === agentSelected);
  const selectedAgent = selectedAgentExists ? agentSelected : "";
  const displayed = selectedAgent
    ? agentSummaries.filter((a) => a.key === selectedAgent)
    : agentSummaries;
  const aggregate = useMemo(() => {
    const overall = freshAgent("ALL", "TUTTI GLI AGENTI");
    for (const agent of displayed) {
      for (const energy of ["luce", "gas"] as const) {
        for (const data of ["production", "recess"] as const) {
          overall[energy][data].contracts += agent[energy][data].contracts;
          overall[energy][data].consumption += agent[energy][data].consumption;
          overall[energy][data].missingConsumption += agent[energy][data].missingConsumption;
        }
      }
    }
    return overall;
  }, [displayed]);

  const missingTotal = aggregate.luce.recess.missingConsumption +
    aggregate.gas.recess.missingConsumption;

  const exportPdf = async () => {
    if (loading || error || !displayed.length || exportingPdf || (customMode && !customValid)) return;
    setExportingPdf(true);
    try {
      const periodLabel = customMode && customValid
        ? padDate(customStart) + " - " + padDate(customEnd)
        : currentPeriod?.label || "Tutti i periodi validi";
      const periodFile = customMode && customValid
        ? customStart + "_" + customEnd
        : currentPeriod ? currentPeriod.start + "_" + currentPeriod.end : "tutti";
      const dataRows = displayed.flatMap((agent) =>
        (["luce", "gas"] as const).map((sector) => {
          const v = agent[sector];
          return [
            agent.name, sector === "luce" ? "LUCE" : "GAS",
            pdfNumber(v.production.contracts, 0),
            pdfNumber(v.production.consumption),
            pdfNumber(v.recess.contracts, 0),
            pdfNumber(v.recess.consumption),
            (v.production.contracts - v.recess.contracts > 0 ? "+" : "") +
              pdfNumber(v.production.contracts - v.recess.contracts, 0),
            (v.production.consumption - v.recess.consumption > 0 ? "+" : "") +
              pdfNumber(v.production.consumption - v.recess.consumption),
          ];
        })
      );
      await exportFilteredA4Pdf({
        title: "ATTIVO PRODUZIONE - STORICO",
        subtitle: "Confronto tra produzione, recessi e saldo netto per agente e settore.",
        filename: "ATTIVO_PRODUZIONE_" + periodFile +
          (selectedAgent ? "_" + selectedAgent : "") + ".pdf",
        filters: [
          "Periodo: " + periodLabel,
          "Agente: " + (selectedAgent
            ? displayed[0]?.name || "Selezionato" : "Tutti"),
          customMode
            ? "Periodo libero: report Produzione inclusi per data finale; recessi di tutti i giorni del mese finale di ciascun report, da NOTA_RECESSO."
            : "Recessi attribuiti al mese in NOTA_RECESSO, corrispondente al mese finale del report.",
          "Report produzione compresi: " + intervals.length +
            "   /   Agenti: " + displayed.length,
        ],
        stats: [
          { label: "LUCE - SALDO CONTRATTI", value: (aggregate.luce.production.contracts - aggregate.luce.recess.contracts > 0 ? "+" : "") +
              pdfNumber(aggregate.luce.production.contracts - aggregate.luce.recess.contracts, 0), detail: "POD in attivazione - recessi" },
          { label: "LUCE - SALDO CONSUMO", value: pdfNumber(aggregate.luce.production.consumption - aggregate.luce.recess.consumption) + " kWh" },
          { label: "GAS - SALDO CONTRATTI", value: (aggregate.gas.production.contracts - aggregate.gas.recess.contracts > 0 ? "+" : "") +
              pdfNumber(aggregate.gas.production.contracts - aggregate.gas.recess.contracts, 0), detail: "PDR in attivazione - recessi" },
          { label: "GAS - SALDO CONSUMO", value: pdfNumber(aggregate.gas.production.consumption - aggregate.gas.recess.consumption) + " Smc" },
        ],
        columns: [
          { label: "AGENTE", width: 52 },
          { label: "LUCE / GAS", width: 22 },
          { label: "PROD. CONTRATTI", width: 30, align: "right" },
          { label: "PROD. kWh / Smc", width: 35, align: "right" },
          { label: "RECESSI CONTRATTI", width: 30, align: "right" },
          { label: "RECESSI kWh / Smc", width: 35, align: "right" },
          { label: "SALDO CONTRATTI", width: 30, align: "right" },
          { label: "SALDO kWh / Smc", width: 35, align: "right" },
        ],
        rows: dataRows,
        note: "Saldo = produzione meno recessi. I consumi dei report sono indivisibili: nel periodo libero non sono stimati giorni intermedi. LUCE e GAS sono riportati separatamente.",
      });
    } catch (err) {
      console.error("PDF ATTIVO PRODUZIONE ERROR", err);
      alert("Non è stato possibile esportare il PDF: " +
        (err instanceof Error ? err.message : "Errore sconosciuto"));
    } finally {
      setExportingPdf(false);
    }
  };

  const metricCards = (commodity: "luce" | "gas") => {
    const values = aggregate[commodity];
    const unit = commodity === "luce" ? "kWh" : "Smc";
    const netContracts = values.production.contracts - values.recess.contracts;
    const netConsumption = values.production.consumption - values.recess.consumption;
    return (
      <div className="ap-summary-card" style={{ ...card, minWidth: 0, borderColor: commodity === "luce" ? "#fdba74" : "#93c5fd" }}>
        <div style={{ color: commodity === "luce" ? "#c2410c" : "#1d4ed8", fontWeight: 900, fontSize: 17 }}>
          {commodity === "luce" ? "⚡ LUCE" : "🔥 GAS"}
        </div>
        <div className="ap-summary-split" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 10, marginTop: 12 }}>
          <div className="ap-metric-block" style={{ padding: 12, background: "#f0fdf4", borderRadius: 9 }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>PRODUZIONE</div>
            <div style={{ fontWeight: 900, fontSize: 22 }}>{formatValue(values.production.contracts)}</div>
            <div style={{ fontSize: 12 }}>contratti</div>
            <div style={{ marginTop: 7, fontWeight: 850 }}>{formatValue(values.production.consumption, 2)} {unit}</div>
          </div>
          <div className="ap-metric-block" style={{ padding: 12, background: "#fff1f2", borderRadius: 9 }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>RECESSI</div>
            <div style={{ fontWeight: 900, fontSize: 22 }}>{formatValue(values.recess.contracts)}</div>
            <div style={{ fontSize: 12 }}>contratti</div>
            <div style={{ marginTop: 7, fontWeight: 850 }}>{formatValue(values.recess.consumption, 2)} {unit}</div>
          </div>
        </div>
        <div className="ap-saldo" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
          padding: "12px 2px 0", fontWeight: 900 }}>
          <span>SALDO CONTRATTI: <span style={{ color: netContracts >= 0 ? "#166534" : "#b91c1c" }}>
            {signed(netContracts)}</span></span>
          <span>SALDO {unit.toLocaleUpperCase("it-IT")}:{" "}
            <span style={{ color: netConsumption >= 0 ? "#166534" : "#b91c1c" }}>
              {signed(netConsumption, 2)} {unit}
            </span>
          </span>
        </div>
      </div>
    );
  };

  const gridTable = (commodity: "luce" | "gas") => {
    const unit = commodity === "luce" ? "kWh" : "Smc";
    const clr = commodity === "luce" ? "#fff7ed" : "#eff6ff";
    return (
      <div className="ap-comparison-panel" style={{ ...card, minWidth: 0 }}>
        <h3 style={{ marginTop: 0, color: commodity === "luce" ? "#c2410c" : "#1d4ed8" }}>
          {commodity === "luce" ? "LUCE" : "GAS"} · Confronto per agente
        </h3>
        <div className="ap-desktop-table" style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 950 }}>
            <thead style={{ background: clr }}>
              <tr>
                <th rowSpan={2} style={{ ...headerCell, textAlign: "left", minWidth: 170 }}>AGENTE</th>
                <th colSpan={2} style={{ ...headerCell, textAlign: "center" }}>PRODUZIONE</th>
                <th colSpan={2} style={{ ...headerCell, textAlign: "center" }}>RECESSI</th>
                <th colSpan={2} style={{ ...headerCell, textAlign: "center" }}>DIFFERENZA (PROD. − RECESSI)</th>
              </tr>
              <tr>
                {["Contratti",unit,"Contratti",unit,"Contratti",unit].map((h,i)=>
                  <th key={i} style={headerCell}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {displayed.map((agent) => {
                const v = agent[commodity];
                const dc = v.production.contracts - v.recess.contracts;
                const dk = v.production.consumption - v.recess.consumption;
                return (
                  <tr key={agent.key} style={{ background: selectedAgent === agent.key ? "#eff6ff" : "white" }}>
                    <td style={{ ...dataCell, textAlign: "left", fontWeight: 850 }}>{agent.name}</td>
                    <td style={dataCell}>{formatValue(v.production.contracts)}</td>
                    <td style={dataCell}>{formatValue(v.production.consumption, 2)}</td>
                    <td style={dataCell}>{formatValue(v.recess.contracts)}</td>
                    <td style={dataCell}>{formatValue(v.recess.consumption, 2)}</td>
                    <td style={{ ...dataCell, color: dc >= 0 ? "#166534" : "#b91c1c", fontWeight: 850 }}>{signed(dc)}</td>
                    <td style={{ ...dataCell, color: dk >= 0 ? "#166534" : "#b91c1c", fontWeight: 850 }}>{signed(dk, 2)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "#f8fafc", fontWeight: 900 }}>
                <td style={{ ...dataCell, textAlign: "left" }}>TOTALE</td>
                {(() => {
                  const p = aggregate[commodity].production;
                  const r = aggregate[commodity].recess;
                  return [p.contracts, p.consumption, r.contracts, r.consumption,
                    p.contracts-r.contracts, p.consumption-r.consumption]
                    .map((v,i)=><td key={i} style={dataCell}>
                      {i < 4 ? formatValue(v, i % 2 ? 2 : 0) :
                        signed(v, i === 5 ? 2 : 0)}
                    </td>);
                })()}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="ap-mobile-agent-list">
          {[{ ...aggregate, name: "TOTALE" }, ...displayed].map((agent) => {
            const values = agent[commodity];
            const contractDiff = values.production.contracts - values.recess.contracts;
            const consumptionDiff = values.production.consumption - values.recess.consumption;
            return (
              <div key={agent.key} className={"ap-agent-card" + (agent.key === "ALL" ? " ap-agent-total" : "")}>
                <div className="ap-agent-name">{agent.name}</div>
                <div className="ap-agent-metrics">
                  {([
                    { label: "PRODUZIONE", data: values.production, className: "ap-production" },
                    { label: "RECESSI", data: values.recess, className: "ap-recess" },
                  ] as const).map((part) => (
                    <div key={part.label} className={"ap-agent-stat " + part.className}>
                      <div className="ap-agent-stat-label">{part.label}</div>
                      <div className="ap-agent-stat-line"><span>Contratti</span><strong>{formatValue(part.data.contracts)}</strong></div>
                      <div className="ap-agent-stat-line"><span>{unit}</span><strong>{formatValue(part.data.consumption, 2)}</strong></div>
                    </div>
                  ))}
                  <div className="ap-agent-stat ap-difference">
                    <div className="ap-agent-stat-label">DIFFERENZA</div>
                    <div className="ap-agent-stat-line"><span>Contratti</span>
                      <strong style={{ color: contractDiff >= 0 ? "#166534" : "#b91c1c" }}>{signed(contractDiff)}</strong>
                    </div>
                    <div className="ap-agent-stat-line"><span>{unit}</span>
                      <strong style={{ color: consumptionDiff >= 0 ? "#166534" : "#b91c1c" }}>{signed(consumptionDiff, 2)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!displayed.length && <p style={{ color: "#64748b" }}>Nessun dato per la selezione corrente.</p>}
      </div>
    );
  };

  return (
    <section className="ap-root" style={{ display: "grid", gap: 14, minWidth: 0, width: "100%" }}>
      <div className="ap-filters-panel" style={{ ...card, minWidth: 0 }}>
        <div className="ap-title-row" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>ATTIVO PRODUZIONE</h2>
            <div style={{ color: "#475569", fontSize: 13, marginTop: 5 }}>
              Produzione e recessi confrontati per mese di riferimento. Per i recessi fa fede la data in NOTA_RECESSO.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ap-refresh-button" type="button" onClick={() => void reload()} disabled={loading}
              style={{ border: "1px solid #0f2d69", borderRadius: 9,
                background: "white", color: "#0f2d69", padding: "9px 14px", fontWeight: 900 }}>
              {loading ? "CARICAMENTO..." : "AGGIORNA DATI"}
            </button>
            <button className="ap-refresh-button" type="button" onClick={() => void exportPdf()}
              disabled={loading || !!error || !displayed.length || exportingPdf || (customMode && !customValid)}
              style={{ border: 0, borderRadius: 9, padding: "9px 14px", fontWeight: 900,
                background: loading || !!error || !displayed.length || exportingPdf || (customMode && !customValid)
                  ? "#cbd5e1" : "#b91c1c", color: "white" }}>
              {exportingPdf ? "Preparazione PDF..." : "📄 ESPORTA PDF A4"}
            </button>
          </div>
        </div>
        {error && <div role="alert" style={{ color: "#991b1b", marginTop: 10, fontWeight: 800 }}>
          Non è possibile aggiornare il confronto: {error}. Riprova con AGGIORNA DATI.
        </div>}
        <div className="ap-filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))",
          gap: 12, marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 850 }}>
            PERIODO DI PRODUZIONE
            <select style={{ ...field, marginTop: 5 }} value={activePeriod}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "CUSTOM") {
                  const initial = currentPeriod || validPeriods[0];
                  if (!customStart) setCustomStart(initial?.start || "");
                  if (!customEnd) setCustomEnd(initial?.end || "");
                }
                setPeriodSelected(next);
                setAgentSelected("");
              }}>
              <option value="ALL">TUTTI I PERIODI CON DATE VALIDE</option>
              <option value="CUSTOM">PERIODO LIBERO · CALENDARIO</option>
              {periods.map((period) => <option key={period.key} value={period.key}
                disabled={!period.valid}>
                {period.label}{period.valid ? "" : " · DATE DA CORREGGERE"}
              </option>)}
            </select>
          </label>
          <label style={{fontSize:12,fontWeight:850,gridColumn:"1 / -1"}}>🔎 CERCA AGENTE
            <input list="active-production-agent-suggestions" placeholder="Digita lettere del nome agente..." value={agentQuery} onChange={e=>{const value=e.target.value;setAgentQuery(value);const match=agentOptions.find(a=>a.name===value);setAgentSelected(match?.key||"");}} style={{...field,marginTop:5}}/>
            <datalist id="active-production-agent-suggestions">{agentOptions.filter(a=>a.name.toLocaleLowerCase("it").includes(agentQuery.toLocaleLowerCase("it"))).slice(0,70).map(a=><option key={a.key} value={a.name}/>)}</datalist>
          </label>
          <label style={{ fontSize: 12, fontWeight: 850 }}>
            SINGOLO AGENTE
            <select style={{ ...field, marginTop: 5 }} value={selectedAgent}
              onChange={(e) => setAgentSelected(e.target.value)}>
              <option value="">TUTTI GLI AGENTI</option>
              {agentOptions.map((agent) =>
                <option key={agent.key} value={agent.key}>{agent.name}</option>)}
            </select>
          </label>
        </div>
        {customMode && (
          <div className="ap-calendar-panel">
            <div className="ap-calendar-grid">
              <label className="ap-date-label">
                DAL GIORNO
                <input type="date" aria-label="Data inizio periodo libero" value={customStart}
                  onChange={(e) => { setCustomStart(e.target.value); setAgentSelected(""); }} />
              </label>
              <label className="ap-date-label">
                AL GIORNO (INCLUSO)
                <input type="date" aria-label="Data fine periodo libero" value={customEnd}
                  onChange={(e) => { setCustomEnd(e.target.value); setAgentSelected(""); }} />
              </label>
            </div>
            {!customValid && (
              <div className="ap-date-error" role="alert">
                Seleziona due date valide: la data finale deve essere uguale o successiva a quella iniziale.
              </div>
            )}
            {customValid && (
              <div className="ap-date-hint">
                <strong>{padDate(customStart)} – {padDate(customEnd)}</strong>
                {" · "}Report di produzione inclusi: <strong>{intervals.length}</strong>.
                La produzione è disponibile per interi report, conteggiati alla data di fine periodo;
                i recessi sono conteggiati per tutto il mese della fine di ogni report incluso,
                in base a NOTA_RECESSO (compreso il 31 del mese).
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#475569", marginTop: 10 }}>
          {customMode
            ? (customValid
              ? "Intervallo personalizzato: seleziona i report per data finale; per ogni report vengono considerati i recessi dell’intero mese finale, anche oltre il giorno 10."
              : "Seleziona l'intervallo dal calendario.")
            : currentPeriod
            ? <>Periodo produzione: <strong>{currentPeriod.label}</strong>. I recessi sono conteggiati nel mese
                della data finale del periodo, usando la data presente in NOTA_RECESSO.</>
            : activePeriod === "ALL" ? "Sono confrontati soltanto i periodi di Produzione con date corrette."
              : "Nessun periodo mensile valido disponibile."}
        </div>
        {periods.some((period) => !period.valid) && (
          <div style={{ color: "#92400e", background: "#fffbeb", marginTop: 10,
            padding: 10, borderRadius: 8, fontSize: 12 }}>
            ⚠ {periods.filter((period) => !period.valid).length} periodi storici di Produzione
            hanno un intervallo anomalo (oltre 45 o meno di 20 giorni).
            Sono esclusi dal confronto fino alla correzione delle date in archivio,
            per non confrontare recessi di mesi diversi con la produzione di uno solo.
          </div>
        )}
      </div>

      {loading ? <div style={card}>Caricamento Produzione e Recessi...</div> : (
        <>
          <div className="ap-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,310px),1fr))", gap: 12 }}>
            {metricCards("luce")}
            {metricCards("gas")}
          </div>
          {!!missingTotal && <div style={{ color: "#92400e", background: "#fffbeb",
            padding: 12, borderRadius: 10, fontSize: 12 }}>
            ⚠ {missingTotal} recessi senza valore di consumo:
            i contratti sono conteggiati, ma il saldo dei {missingTotal === 1 ? "consumi è" : "consumi è"}
            parziale.
          </div>}
          {gridTable("luce")}
          {gridTable("gas")}
        </>
      )}
      <div style={{ fontSize: 12, color: "#64748b" }}>
        <strong>Metodo:</strong> Contratti di produzione = POD/PDR «in attivazione»;
        consumi di produzione = kWh/Smc «in attivazione» presenti nei report;
        recessi = numero record e relativi consumi. Saldo = produzione meno recessi.
        Le statistiche rappresentano un confronto di flussi nello stesso periodo,
        non la consistenza contrattuale attualmente attiva.
        I nomi agente vengono confrontati ignorando maiuscole, accenti e segni di punteggiatura.
      </div>
    </section>
  );
}
