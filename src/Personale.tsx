import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { adminGetSetting, adminUpsertSettings } from "./adminSecurity";
import { FERIE_TEMPLATE_BASE64 } from "./ferieTemplate";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

const YEARS = [2026, 2027, 2028, 2029, 2030] as const;
const HOURS_PER_DAY = 8;

type MonthName = (typeof MONTHS)[number];

type FerieParams = {
  initialFerie: number;
  initialPermessi: number;
  initialExFestivita: number;
  monthlyFerie: number;
  monthlyPermessi: number;
  monthlyExFestivita: number;
};

type FerieRow = {
  year: number;
  month: MonthName;
  ferie: number | null;
  permessi: number | null;
  exFestivita: number | null;
  note: string;
};

type ComputedRow = FerieRow & {
  ferieResidue: number;
  permessiResidui: number;
  exFestivitaResidue: number;
  totaleOrePermessiEx: number;
};

type StoredFerieState = {
  version: 1;
  selectedYear: number;
  selectedMonth: MonthName;
  params: FerieParams;
  rows: FerieRow[];
};

type PersonaleProps = {
  ownerKey: string;
};

const DEFAULT_PARAMS: FerieParams = {
  initialFerie: 12.16,
  initialPermessi: 78,
  initialExFestivita: 36.86,
  monthlyFerie: 2.16,
  monthlyPermessi: 6,
  monthlyExFestivita: 2.67,
};

const DEFAULT_USAGE = new Map<string, Partial<FerieRow>>([
  ["2026-Luglio", { ferie: 1, permessi: 4, note: "partenza nel pomeriggio" }],
  ["2026-Agosto", { ferie: 13, note: "vacanza" }],
  ["2026-Novembre", { ferie: 3, permessi: 4, note: "partenza nel pomeriggio" }],
  ["2026-Dicembre", { ferie: 1 }],
  ["2027-Febbraio", { ferie: 5, permessi: 0, note: "settiman bianca" }],
  ["2027-Aprile", { ferie: 3, permessi: 3 }],
  ["2027-Maggio", { ferie: 3 }],
]);

function makeDefaultRows(): FerieRow[] {
  const rows: FerieRow[] = [];

  for (const year of YEARS) {
    for (const month of MONTHS) {
      const seed = DEFAULT_USAGE.get(`${year}-${month}`) || {};
      rows.push({
        year,
        month,
        ferie: seed.ferie ?? null,
        permessi: seed.permessi ?? null,
        exFestivita: seed.exFestivita ?? null,
        note: seed.note ?? "",
      });
    }
  }

  return rows;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoredState(input: any): StoredFerieState {
  const defaults = makeDefaultRows();
  const savedRows = Array.isArray(input?.rows) ? input.rows : [];

  const rows = defaults.map((base) => {
    const saved = savedRows.find(
      (item: any) => Number(item?.year) === base.year && item?.month === base.month
    );

    if (!saved) return base;

    return {
      ...base,
      ferie: normalizeOptionalNumber(saved.ferie),
      permessi: normalizeOptionalNumber(saved.permessi),
      exFestivita: normalizeOptionalNumber(saved.exFestivita),
      note: String(saved.note ?? ""),
    };
  });

  const selectedYear = YEARS.includes(Number(input?.selectedYear) as any)
    ? Number(input.selectedYear)
    : 2026;

  const selectedMonth = MONTHS.includes(input?.selectedMonth)
    ? (input.selectedMonth as MonthName)
    : "Gennaio";

  return {
    version: 1,
    selectedYear,
    selectedMonth,
    params: {
      initialFerie: normalizeNumber(input?.params?.initialFerie, DEFAULT_PARAMS.initialFerie),
      initialPermessi: normalizeNumber(input?.params?.initialPermessi, DEFAULT_PARAMS.initialPermessi),
      initialExFestivita: normalizeNumber(
        input?.params?.initialExFestivita,
        DEFAULT_PARAMS.initialExFestivita
      ),
      monthlyFerie: normalizeNumber(input?.params?.monthlyFerie, DEFAULT_PARAMS.monthlyFerie),
      monthlyPermessi: normalizeNumber(
        input?.params?.monthlyPermessi,
        DEFAULT_PARAMS.monthlyPermessi
      ),
      monthlyExFestivita: normalizeNumber(
        input?.params?.monthlyExFestivita,
        DEFAULT_PARAMS.monthlyExFestivita
      ),
    },
    rows,
  };
}

function computeRows(params: FerieParams, rows: FerieRow[]): ComputedRow[] {
  let ferieResidue = params.initialFerie;
  let permessiResidui = params.initialPermessi;
  let exFestivitaResidue = params.initialExFestivita;

  return rows.map((row) => {
    ferieResidue += params.monthlyFerie - Number(row.ferie || 0);
    permessiResidui += params.monthlyPermessi - Number(row.permessi || 0);
    exFestivitaResidue += params.monthlyExFestivita - Number(row.exFestivita || 0);

    return {
      ...row,
      ferieResidue,
      permessiResidui,
      exFestivitaResidue,
      totaleOrePermessiEx: permessiResidui + exFestivitaResidue,
    };
  });
}

function numberLabel(value: number, digits = 2) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function inputNumber(value: number | null) {
  return value === null ? "" : String(value);
}

function safeOwnerKey(value: string) {
  const normalized = String(value || "personale")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);
  return normalized || "personale";
}

function base64ToUint8Array(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #dbe4f0",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
};

const yellowInputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 74,
  boxSizing: "border-box",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #e0bd2f",
  background: "#fff6a8",
  color: "#0f172a",
  fontWeight: 750,
  textAlign: "center",
};

export default function Personale({ ownerKey }: PersonaleProps) {
  const storageKey = useMemo(
    () => `personale_ferie:${safeOwnerKey(ownerKey)}`,
    [ownerKey]
  );

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<MonthName>("Gennaio");
  const [detailYear, setDetailYear] = useState<number>(2026);
  const [params, setParams] = useState<FerieParams>(DEFAULT_PARAMS);
  const [paramsEditable, setParamsEditable] = useState(false);
  const [rows, setRows] = useState<FerieRow[]>(makeDefaultRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotice("");

      try {
        const saved = await adminGetSetting(storageKey);
        if (cancelled) return;

        if (saved) {
          const normalized = normalizeStoredState(saved);
          setSelectedYear(normalized.selectedYear);
          setSelectedMonth(normalized.selectedMonth);
          setDetailYear(normalized.selectedYear);
          setParams(normalized.params);
          setRows(normalized.rows);
        } else {
          setSelectedYear(2026);
          setSelectedMonth("Gennaio");
          setDetailYear(2026);
          setParams(DEFAULT_PARAMS);
          setRows(makeDefaultRows());
        }

        setDirty(false);
      } catch (error: any) {
        console.error("PERSONALE FERIE LOAD ERROR:", error);
        if (!cancelled) {
          setNotice("Impossibile caricare i dati online. Sono visibili i dati iniziali.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const computedRows = useMemo(() => computeRows(params, rows), [params, rows]);

  const selectedSummary = useMemo(
    () =>
      computedRows.find(
        (row) => row.year === selectedYear && row.month === selectedMonth
      ) || computedRows[0],
    [computedRows, selectedMonth, selectedYear]
  );

  const visibleRows = useMemo(
    () => computedRows.filter((row) => row.year === detailYear),
    [computedRows, detailYear]
  );

  const totalDays = selectedSummary
    ? selectedSummary.ferieResidue +
      selectedSummary.permessiResidui / HOURS_PER_DAY +
      selectedSummary.exFestivitaResidue / HOURS_PER_DAY
    : 0;

  const markDirty = () => {
    setDirty(true);
    setNotice("");
  };

  const updateRow = (
    year: number,
    month: MonthName,
    field: "ferie" | "permessi" | "exFestivita" | "note",
    value: string
  ) => {
    setRows((current) =>
      current.map((row) => {
        if (row.year !== year || row.month !== month) return row;

        if (field === "note") {
          return { ...row, note: value };
        }

        return { ...row, [field]: normalizeOptionalNumber(value) };
      })
    );
    markDirty();
  };

  const updateParam = (field: keyof FerieParams, value: string) => {
    setParams((current) => ({
      ...current,
      [field]: normalizeNumber(value.replace(",", "."), 0),
    }));
    markDirty();
  };

  const saveOnline = async () => {
    setSaving(true);
    setNotice("");

    const payload: StoredFerieState = {
      version: 1,
      selectedYear,
      selectedMonth,
      params,
      rows,
    };

    try {
      await adminUpsertSettings([{ key: storageKey, value_json: payload }]);
      setDirty(false);
      setNotice("Dati ferie salvati online.");
    } catch (error: any) {
      console.error("PERSONALE FERIE SAVE ERROR:", error);
      setNotice(`Errore nel salvataggio: ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirty) return;

    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [dirty]);

  const exportExcel = () => {
    try {
      const templateBytes = base64ToUint8Array(FERIE_TEMPLATE_BASE64);
      const workbook = XLSX.read(templateBytes, {
        type: "array",
        cellStyles: true,
        cellNF: true,
        cellFormula: true,
        cellDates: true,
        sheetStubs: true,
      });

      const worksheet = workbook.Sheets["Dashboard"];
      if (!worksheet) {
        throw new Error("Foglio Dashboard non trovato nel modello Excel");
      }

      const setValue = (address: string, value: string | number | null) => {
        const cell: any = worksheet[address] || {};
        delete cell.f;
        delete cell.w;

        if (value === null || value === "") {
          delete cell.v;
          cell.t = "z";
        } else if (typeof value === "number") {
          cell.v = value;
          cell.t = "n";
        } else {
          cell.v = value;
          cell.t = "s";
        }

        worksheet[address] = cell;
      };

      const setFormula = (address: string, formula: string, cachedValue: number) => {
        const cell: any = worksheet[address] || {};
        cell.f = formula;
        cell.v = cachedValue;
        cell.t = "n";
        delete cell.w;
        worksheet[address] = cell;
      };

      setValue("C2", selectedMonth);
      setValue("D2", selectedYear);

      setValue("H9", params.initialFerie);
      setValue("H10", params.initialPermessi);
      setValue("H11", params.initialExFestivita);
      setValue("H12", params.monthlyFerie);
      setValue("H13", params.monthlyPermessi);
      setValue("H14", params.monthlyExFestivita);

      setFormula("B9", "SUMIFS(F17:F76,A17:A76,D2,B17:B76,C2)", selectedSummary.ferieResidue);
      setFormula("B11", "SUMIFS(G17:G76,A17:A76,D2,B17:B76,C2)", selectedSummary.permessiResidui);
      setFormula("C11", "B11/8", selectedSummary.permessiResidui / HOURS_PER_DAY);
      setFormula("B13", "SUMIFS(H17:H76,A17:A76,D2,B17:B76,C2)", selectedSummary.exFestivitaResidue);
      setFormula("C13", "B13/8", selectedSummary.exFestivitaResidue / HOURS_PER_DAY);
      setFormula("D11", "B9+C11+C13", totalDays);

      computedRows.forEach((row, index) => {
        const excelRow = 17 + index;
        const previousRow = excelRow - 1;

        setValue(`A${excelRow}`, row.year);
        setValue(`B${excelRow}`, row.month);
        setValue(`C${excelRow}`, row.ferie);
        setValue(`D${excelRow}`, row.permessi);
        setValue(`E${excelRow}`, row.exFestivita);
        setValue(`J${excelRow}`, row.note || null);

        if (index === 0) {
          setFormula(
            `F${excelRow}`,
            `$H$9+$H$12-C${excelRow}`,
            row.ferieResidue
          );
          setFormula(
            `G${excelRow}`,
            `$H$10+$H$13-D${excelRow}`,
            row.permessiResidui
          );
          setFormula(
            `H${excelRow}`,
            `$H$11+$H$14-E${excelRow}`,
            row.exFestivitaResidue
          );
        } else {
          setFormula(
            `F${excelRow}`,
            `F${previousRow}+$H$12-C${excelRow}`,
            row.ferieResidue
          );
          setFormula(
            `G${excelRow}`,
            `G${previousRow}+$H$13-D${excelRow}`,
            row.permessiResidui
          );
          setFormula(
            `H${excelRow}`,
            `H${previousRow}+$H$14-E${excelRow}`,
            row.exFestivitaResidue
          );
        }

        setFormula(
          `I${excelRow}`,
          `G${excelRow}+H${excelRow}`,
          row.totaleOrePermessiEx
        );
      });

      (workbook as any).CalcPr = {
        ...((workbook as any).CalcPr || {}),
        calcMode: "auto",
        fullCalcOnLoad: true,
        forceFullCalc: true,
      };

      const output = XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
        cellStyles: true,
        compression: true,
      });

      const blob = new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "GESTIONE FERIE.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      console.error("PERSONALE FERIE EXPORT ERROR:", error);
      setNotice(`Errore nell'esportazione Excel: ${error?.message || error}`);
    }
  };

  if (loading) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", padding: 28 }}>
        Caricamento dati personale…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          background: "#f8fafc",
          border: "1px solid #dbe4f0",
          borderRadius: 12,
          padding: 10,
        }}
      >
        <button
          type="button"
          style={{
            border: "1px solid #244f8f",
            background: "#244f8f",
            color: "white",
            borderRadius: 9,
            padding: "9px 15px",
            fontWeight: 850,
          }}
        >
          FERIE
        </button>
      </div>

      <div
        style={{
          ...cardStyle,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#244f8f",
            color: "white",
            textAlign: "center",
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 0.2,
            padding: "13px 16px",
          }}
        >
          GESTIONE FERIE, PERMESSI ED EX FESTIVITÀ
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
            padding: 16,
          }}
        >
          <section style={{ border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ background: "#dbeafe", padding: "9px 12px", fontWeight: 850 }}>
              SCELTA MESE E ANNO
            </div>
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
                Mese
                <select
                  value={selectedMonth}
                  onChange={(event) => {
                    setSelectedMonth(event.target.value as MonthName);
                  }}
                  style={yellowInputStyle}
                >
                  {MONTHS.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
                Anno
                <select
                  value={selectedYear}
                  onChange={(event) => {
                    const year = Number(event.target.value);
                    setSelectedYear(year);
                    setDetailYear(year);
                  }}
                  style={yellowInputStyle}
                >
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ background: "#dbeafe", padding: "9px 12px", fontWeight: 850, borderRadius: "10px 10px 0 0" }}>
            RESIDUI AL MESE SCELTO
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
              border: "1px solid #cbd5e1",
              borderTop: 0,
              borderRadius: "0 0 10px 10px",
              overflow: "hidden",
            }}
          >
            <SummaryBox title="FERIE RESIDUE" main={`${numberLabel(selectedSummary.ferieResidue)} gg`} />
            <SummaryBox
              title="PERMESSI RESIDUI"
              main={`${numberLabel(selectedSummary.permessiResidui)} ore`}
              sub={`${numberLabel(selectedSummary.permessiResidui / HOURS_PER_DAY)} gg`}
            />
            <SummaryBox
              title="EX FESTIVITÀ RESIDUE"
              main={`${numberLabel(selectedSummary.exFestivitaResidue)} ore`}
              sub={`${numberLabel(selectedSummary.exFestivitaResidue / HOURS_PER_DAY)} gg`}
            />
            <SummaryBox title="TOTALE GIORNI" main={`${numberLabel(totalDays)} gg`} strong />
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            padding: 14,
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900, color: "#173f78" }}>DETTAGLIO</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {YEARS.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setDetailYear(year)}
                    style={{
                      border: detailYear === year ? "1px solid #244f8f" : "1px solid #cbd5e1",
                      background: detailYear === year ? "#244f8f" : "white",
                      color: detailYear === year ? "white" : "#334155",
                      borderRadius: 8,
                      padding: "5px 9px",
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 5 }}>
              Modifica i campi gialli: i residui si aggiornano in automatico mese per mese.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {dirty && (
              <span
                style={{
                  color: "#b45309",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 999,
                  padding: "6px 9px",
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                MODIFICHE NON SALVATE
              </span>
            )}
            <button
              type="button"
              onClick={exportExcel}
              style={{
                border: "1px solid #15803d",
                background: "white",
                color: "#15803d",
                borderRadius: 9,
                padding: "9px 13px",
                fontWeight: 850,
                cursor: "pointer",
              }}
            >
              ESPORTA EXCEL
            </button>
            <button
              type="button"
              onClick={() => void saveOnline()}
              disabled={saving || !dirty}
              style={{
                border: 0,
                background: dirty ? "#244f8f" : "#94a3b8",
                color: "white",
                borderRadius: 9,
                padding: "9px 14px",
                fontWeight: 850,
                cursor: saving || !dirty ? "default" : "pointer",
                opacity: saving ? 0.75 : 1,
              }}
            >
              {saving ? "SALVATAGGIO…" : dirty ? "SALVA DATI" : "SALVATO"}
            </button>
          </div>
        </div>

        {notice && (
          <div
            style={{
              margin: "12px 14px 0",
              padding: "9px 11px",
              borderRadius: 9,
              background: notice.startsWith("Errore") || notice.startsWith("Impossibile") ? "#fff1f2" : "#ecfdf5",
              color: notice.startsWith("Errore") || notice.startsWith("Impossibile") ? "#be123c" : "#047857",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {notice}
          </div>
        )}

        <div style={{ overflowX: "auto", padding: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
            <thead>
              <tr style={{ background: "#244f8f", color: "white" }}>
                <th style={headerCellStyle}>Anno</th>
                <th style={headerCellStyle}>Mese</th>
                <th style={headerCellStyle}>Ferie prese (gg)</th>
                <th style={headerCellStyle}>Permessi presi (ore)</th>
                <th style={headerCellStyle}>Ex festività prese (ore)</th>
                <th style={headerCellStyle}>Ferie residue fine mese</th>
                <th style={headerCellStyle}>Permessi residui fine mese</th>
                <th style={headerCellStyle}>Ex festività residue fine mese</th>
                <th style={headerCellStyle}>Totale ore permessi+ex</th>
                <th style={headerCellStyle}>Note</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={`${row.year}-${row.month}`}>
                  <td style={bodyCellStyle}>{row.year}</td>
                  <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{row.month}</td>
                  <td style={editableCellStyle}>
                    <input
                      type="number"
                      step="0.25"
                      value={inputNumber(row.ferie)}
                      onChange={(event) => updateRow(row.year, row.month, "ferie", event.target.value)}
                      style={{ ...yellowInputStyle, border: 0, borderRadius: 0 }}
                    />
                  </td>
                  <td style={editableCellStyle}>
                    <input
                      type="number"
                      step="0.5"
                      value={inputNumber(row.permessi)}
                      onChange={(event) => updateRow(row.year, row.month, "permessi", event.target.value)}
                      style={{ ...yellowInputStyle, border: 0, borderRadius: 0 }}
                    />
                  </td>
                  <td style={editableCellStyle}>
                    <input
                      type="number"
                      step="0.5"
                      value={inputNumber(row.exFestivita)}
                      onChange={(event) => updateRow(row.year, row.month, "exFestivita", event.target.value)}
                      style={{ ...yellowInputStyle, border: 0, borderRadius: 0 }}
                    />
                  </td>
                  <td style={bodyCellStyle}>{numberLabel(row.ferieResidue)}</td>
                  <td style={bodyCellStyle}>{numberLabel(row.permessiResidui)}</td>
                  <td style={bodyCellStyle}>{numberLabel(row.exFestivitaResidue)}</td>
                  <td style={bodyCellStyle}>{numberLabel(row.totaleOrePermessiEx)}</td>
                  <td style={{ ...editableCellStyle, minWidth: 210 }}>
                    <input
                      type="text"
                      value={row.note}
                      onChange={(event) => updateRow(row.year, row.month, "note", event.target.value)}
                      placeholder="Nota"
                      style={{ ...yellowInputStyle, minWidth: 210, border: 0, borderRadius: 0, fontWeight: 600 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            background: "#dbeafe",
            padding: "11px 14px",
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            borderBottom: "1px solid #cbd5e1",
          }}
        >
          <div>
            <div style={{ color: "#173f78" }}>PARAMETRI</div>
            <div style={{ marginTop: 3, fontSize: 11, color: "#64748b", fontWeight: 650 }}>
              Valori iniziali e maturazioni mensili. Modificali solo quando necessario.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setParamsEditable((current) => !current)}
            style={{
              border: paramsEditable ? "1px solid #b45309" : "1px solid #244f8f",
              background: paramsEditable ? "#fff7ed" : "white",
              color: paramsEditable ? "#b45309" : "#244f8f",
              borderRadius: 8,
              padding: "7px 11px",
              fontSize: 11,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {paramsEditable ? "FINE MODIFICA" : "MODIFICA"}
          </button>
        </div>
        <div
          style={{
            padding: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 10,
          }}
        >
          {([
            ["initialFerie", "Residuo ferie iniziale 01/01/2026", "gg"],
            ["initialPermessi", "Residuo permessi iniziale 01/01/2026", "ore"],
            ["initialExFestivita", "Residuo ex festività iniziale 01/01/2026", "ore"],
            ["monthlyFerie", "Maturazione ferie mensile", "gg"],
            ["monthlyPermessi", "Maturazione permessi mensile", "ore"],
            ["monthlyExFestivita", "Maturazione ex festività mensile", "ore"],
          ] as Array<[keyof FerieParams, string, string]>).map(([field, label, unit]) => (
            <label
              key={field}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 92px 34px",
                gap: 8,
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <span>{label}</span>
              <input
                type="number"
                step="0.01"
                value={params[field]}
                disabled={!paramsEditable}
                onChange={(event) => updateParam(field, event.target.value)}
                style={{
                  ...yellowInputStyle,
                  minWidth: 0,
                  cursor: paramsEditable ? "text" : "not-allowed",
                  background: paramsEditable ? "#fff6a8" : "#f8fafc",
                  borderColor: paramsEditable ? "#e0bd2f" : "#cbd5e1",
                  color: paramsEditable ? "#0f172a" : "#64748b",
                  textAlign: "center",
                }}
              />
              <span style={{ color: "#64748b" }}>{unit}</span>
            </label>
          ))}
        </div>
      </div>

      </div>
    </div>
  );
}

function SummaryBox({
  title,
  main,
  sub,
  strong = false,
}: {
  title: string;
  main: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        padding: "13px 14px",
        background: strong ? "#ffe3c7" : "#fff0df",
        borderRight: "1px solid #e7c9aa",
        minHeight: 82,
      }}
    >
      <div style={{ fontSize: 11, color: "#7c4a1f", fontWeight: 850 }}>{title}</div>
      <div style={{ fontSize: strong ? 24 : 20, fontWeight: 950, marginTop: 5, color: "#172554" }}>
        {main}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const headerCellStyle: React.CSSProperties = {
  padding: "10px 8px",
  border: "1px solid #dbe4f0",
  fontSize: 11,
  textAlign: "center",
  whiteSpace: "normal",
};

const bodyCellStyle: React.CSSProperties = {
  padding: "8px 9px",
  border: "1px solid #dbe4f0",
  fontSize: 12,
  textAlign: "center",
  background: "#fff",
  fontVariantNumeric: "tabular-nums",
};

const editableCellStyle: React.CSSProperties = {
  padding: 0,
  border: "1px solid #dbe4f0",
  background: "#fff6a8",
  textAlign: "center",
};
