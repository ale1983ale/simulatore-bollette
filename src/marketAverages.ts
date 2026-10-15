/** Medie semplici dei 12 mesi consecutivi che terminano nel mese selezionato. */
const MONTH_NAMES = [
  "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO",
  "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE",
] as const;

type MarketMonthRow = {
  mese: string;
  mono: number;
  psv: number;
};

function monthIndex(label: string): number | null {
  const parts = String(label || "").trim().toUpperCase().split(/\s+/);
  const month = MONTH_NAMES.indexOf(parts[0] as (typeof MONTH_NAMES)[number]);
  const year = Number(parts[1]);
  if (month < 0 || !Number.isInteger(year) || year < 2000 || year > 2200) return null;
  return year * 12 + month;
}

/**
 * La media non deve includere mesi futuri, anni di listino, né valori a zero
 * usati come segnaposto di dati non ancora caricati.
 */
export function last12MarketAverage(
  last12Rows: MarketMonthRow[],
  key: "mono" | "psv"
): number | null {
  if (last12Rows.length !== 12) return null;
  let previousMonth: number | null = null;
  let total = 0;
  for (const row of last12Rows) {
    const month = monthIndex(row.mese);
    const value = Number(row[key]);
    if (month === null || (previousMonth !== null && month !== previousMonth + 1)
      || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    previousMonth = month;
    total += value;
  }
  return total / 12;
}

/** Identica scala verticale utilizzata nei grafici PUN/PSV (760 × 220). */
export function marketAverageChartY(
  values: number[],
  average: number,
  height = 220
): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const paddingTop = 30;
  const paddingBottom = 46;
  return paddingTop + (1 - (average - min) / range)
    * (height - paddingTop - paddingBottom);
}
