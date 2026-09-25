export type NetworkTariffRow = {
  mese: string;
  anno: number;
  meseNumero: number;
  tipo: string;
  quotaFissaAnnua: number;
  quotaPotenzaAnnua: number;
  quotaEnergia: number;
  status: string;
  source: string;
};

export type NetworkTariffMeta = {
  checkedAt: string;
  sourceStatus: string;
  warnings: string[];
};

type Triple = [number, number, number];

const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

const TYPES = [
  "RESIDENTE",
  "NON RESIDENTE",
  "RESIDENTE CANONE ESENTE",
  "BTA1","BTA2","BTA3","BTA4","BTA5","BTA6",
  "MTA1","MTA2","MTA3",
];

const BASE: Record<number, Record<string, Triple>> = {
  2025: {
    "RESIDENTE": [22.80,25.08,0.01189],
    "NON RESIDENTE": [22.80,25.08,0.01189],
    "RESIDENTE CANONE ESENTE": [22.80,25.08,0.01189],
    "BTA1": [27.4729,35.2511,0.01262],
    "BTA2": [27.4729,33.3860,0.01262],
    "BTA3": [27.4729,37.1162,0.01262],
    "BTA4": [28.0420,37.1162,0.01262],
    "BTA5": [28.0420,37.1162,0.01262],
    "BTA6": [27.4729,35.2511,0.01260],
    "MTA1": [804.2278,38.6738,0.01180],
    "MTA2": [750.2413,34.7273,0.01172],
    "MTA3": [733.8108,30.4655,0.01167],
  },
  2026: {
    "RESIDENTE": [23.04,23.52,0.01190],
    "NON RESIDENTE": [23.04,23.52,0.01190],
    "RESIDENTE CANONE ESENTE": [23.04,23.52,0.01190],
    "BTA1": [27.1940,32.9297,0.01258],
    "BTA2": [27.1940,31.1874,0.01258],
    "BTA3": [27.1940,34.6720,0.01258],
    "BTA4": [27.7287,34.6720,0.01258],
    "BTA5": [27.7287,34.6720,0.01258],
    "BTA6": [27.1940,32.9297,0.01256],
    "MTA1": [768.9318,35.9875,0.01176],
    "MTA2": [718.2113,32.3151,0.01169],
    "MTA3": [702.7748,28.3493,0.01164],
  },
};

const Q1_2025: Record<string, Triple> = {
  "RESIDENTE":[0,0.1988,0.033818],
  "NON RESIDENTE":[90.642,0.1988,0.033818],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.033818],
  "BTA1":[17.4864,19.1064,0.045808],
  "BTA2":[17.4864,18.0972,0.045808],
  "BTA3":[17.4864,20.1168,0.045808],
  "BTA4":[17.7924,20.1168,0.045808],
  "BTA5":[17.7924,20.1168,0.045808],
  "BTA6":[17.4864,19.1064,0.045797],
  "MTA1":[586.6863,20.9616,0.043822],
  "MTA2":[557.4231,18.8232,0.043779],
  "MTA3":[548.5179,16.5132,0.043751],
};

const Q2_2025: Record<string, Triple> = {
  "RESIDENTE":[0,0.1988,0.032952],
  "NON RESIDENTE":[90.642,0.1988,0.032952],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.032952],
  "BTA1":[16.6632,18.1116,0.045406],
  "BTA2":[16.6632,17.1552,0.045406],
  "BTA3":[16.6632,19.0692,0.045406],
  "BTA4":[16.9536,19.0692,0.045406],
  "BTA5":[16.9536,19.0692,0.045406],
  "BTA6":[16.6632,18.1116,0.045395],
  "MTA1":[561.2283,19.8696,0.043471],
  "MTA2":[533.4891,17.8428,0.043430],
  "MTA3":[525.0471,15.6528,0.043404],
};

const Q1_2026: Record<string, Triple> = {
  "RESIDENTE":[0,0.1988,0.033125],
  "NON RESIDENTE":[88.752,0.1988,0.033125],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.033125],
  "BTA1":[16.6464,17.0640,0.046212],
  "BTA2":[16.6464,16.1616,0.046212],
  "BTA3":[16.6464,17.9676,0.046212],
  "BTA4":[16.9224,17.9676,0.046212],
  "BTA5":[16.9224,17.9676,0.046212],
  "BTA6":[16.6464,17.0640,0.046202],
  "MTA1":[546.9327,18.6492,0.044176],
  "MTA2":[520.6467,16.7472,0.044142],
  "MTA3":[512.6463,14.6916,0.044115],
};

const Q2_2026: Record<string, Triple> = {
  "RESIDENTE":[0,0.1988,0.033125],
  "NON RESIDENTE":[88.752,0.1988,0.033125],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.033125],
  "BTA1":[16.6464,17.0640,0.032419],
  "BTA2":[16.6464,16.1616,0.032419],
  "BTA3":[16.6464,17.9676,0.032419],
  "BTA4":[16.9224,17.9676,0.032419],
  "BTA5":[16.9224,17.9676,0.032419],
  "BTA6":[16.6464,17.0640,0.032412],
  "MTA1":[546.9327,18.6492,0.030733],
  "MTA2":[520.6467,16.7472,0.030708],
  "MTA3":[512.6463,14.6916,0.030688],
};

const Q3_2026: Record<string, Triple> = {
  "RESIDENTE":[0,0.1988,0.035983],
  "NON RESIDENTE":[95.0916,0.1988,0.035983],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.035983],
  "BTA1":[17.7024,18.2688,0.036327],
  "BTA2":[17.7024,17.3028,0.036327],
  "BTA3":[17.7024,19.2372,0.036327],
  "BTA4":[17.9988,19.2372,0.036327],
  "BTA5":[17.9988,19.2372,0.036327],
  "BTA6":[17.7024,18.2688,0.036327],
  "MTA1":[578.6331,19.9656,0.034547],
  "MTA2":[550.4943,17.9280,0.034519],
  "MTA3":[541.9287,15.7284,0.034498],
};

function qFor(year: number, month: number) {
  if (year === 2025) return month <= 3 ? Q1_2025 : Q2_2025;
  if (year === 2026) {
    if (month <= 3) return Q1_2026;
    if (month <= 6) return Q2_2026;
    if (month <= 9) return Q3_2026;
  }
  return null;
}

function round6(value: number) {
  return Number(value.toFixed(6));
}

export function buildInitialNetworkTariffRows(): NetworkTariffRow[] {
  const rows: NetworkTariffRow[] = [];
  for (const year of [2025, 2026]) {
    const lastMonth = year === 2026 ? 9 : 12;
    for (let month = 1; month <= lastMonth; month += 1) {
      const q = qFor(year, month);
      if (!q) continue;
      for (const tipo of TYPES) {
        const base = BASE[year]?.[tipo];
        const system = q[tipo];
        if (!base || !system) continue;
        rows.push({
          mese: `${MONTHS[month - 1]} ${year}`,
          anno: year,
          meseNumero: month,
          tipo,
          quotaFissaAnnua: round6(base[0] + system[0]),
          quotaPotenzaAnnua: round6(base[1] + system[1]),
          quotaEnergia: round6(base[2] + system[2]),
          status: "STORICO UFFICIALE",
          source: "ARERA / tariffa rete e oneri",
        });
      }
    }
  }
  return rows;
}

export const INITIAL_NETWORK_TARIFF_ROWS = buildInitialNetworkTariffRows();

export function normalizeNetworkMonthLabel(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function findNetworkTariff(
  rows: NetworkTariffRow[],
  tipo: string,
  monthLabel: string
) {
  const normalizedType = String(tipo || "").trim().toUpperCase();
  const normalizedMonth = normalizeNetworkMonthLabel(monthLabel);
  return rows.find(
    (row) =>
      row.tipo === normalizedType &&
      row.mese === normalizedMonth
  );
}

export function monthProration(row: NetworkTariffRow | undefined) {
  if (!row) return 0;
  // Le quote annue di rete/potenza vengono fatturate per mese:
  // un mese di competenza = 1/12 dell'importo annuo.
  return 1 / 12;
}

export function isNonEnergivoreDefaultType(tipo: string) {
  return /^BTA[1-6]$|^MTA[1-3]$/.test(String(tipo || "").toUpperCase());
}

export function isEDistributionPod(pod: string) {
  const clean = String(pod || "").replace(/\s+/g, "").toUpperCase();
  return !clean || clean.startsWith("IT001E");
}

export async function fetchNetworkTariffRows(force = false): Promise<{
  rows: NetworkTariffRow[];
  meta: NetworkTariffMeta;
}> {
  const params = new URLSearchParams();
  params.set("v", "1");
  params.set("t", String(Date.now()));
  if (force) params.set("force", "1");

  const response = await fetch(`/api/network-tariffs?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Aggiornamento tariffe rete non disponibile (${response.status})`
    );
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
        .map((row: any) => ({
          mese: String(row.mese || "").toUpperCase(),
          anno: Number(row.anno || 0),
          meseNumero: Number(row.meseNumero || 0),
          tipo: String(row.tipo || "").toUpperCase(),
          quotaFissaAnnua: Number(row.quotaFissaAnnua || 0),
          quotaPotenzaAnnua: Number(row.quotaPotenzaAnnua || 0),
          quotaEnergia: Number(row.quotaEnergia || 0),
          status: String(row.status || ""),
          source: String(row.source || ""),
        }))
        .filter(
          (row: NetworkTariffRow) =>
            row.mese &&
            row.anno >= 2025 &&
            row.meseNumero >= 1 &&
            row.meseNumero <= 12 &&
            row.tipo
        )
    : [];

  return {
    rows: rows.length ? rows : INITIAL_NETWORK_TARIFF_ROWS,
    meta: {
      checkedAt: String(payload?.checkedAt || new Date().toISOString()),
      sourceStatus: String(payload?.sourceStatus || "STORICO LOCALE"),
      warnings: Array.isArray(payload?.warnings)
        ? payload.warnings.map(String)
        : [],
    },
  };
}
