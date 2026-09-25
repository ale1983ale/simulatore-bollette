export type DispCpRow = {
  mese: string;
  anno: number;
  meseNumero: number;
  tide: number | null;
  cpMarket: number | null;
  businessTotale: number | null;
  cdispDomestico: number | null;
  status: string;
  sourceTide?: string;
  sourceCapacity?: string;
  sourceDomestic?: string;
};

export type DispCapacityMeta = {
  checkedAt: string;
  sourceStatus: string;
  warnings: string[];
};

const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

function makeFallback(
  anno: number,
  meseNumero: number,
  tide: number,
  cpMarket: number
): DispCpRow {
  const businessTotale = Number((tide + cpMarket).toFixed(6));
  return {
    mese: `${MONTHS[meseNumero - 1]} ${anno}`,
    anno,
    meseNumero,
    tide,
    cpMarket,
    businessTotale,
    cdispDomestico: Number((businessTotale * 1.1).toFixed(6)),
    status: "STORICO VERIFICATO",
    sourceTide: "TERNA",
    sourceCapacity: "ARERA",
    sourceDomestic: "ARERA",
  };
}

export const INITIAL_AUTO_DISP_CP_ROWS: DispCpRow[] = [
  [2025,1,0.005241,0.011677],[2025,2,0.005241,0.010304],[2025,3,0.005241,0.004000],
  [2025,4,0.008948,0.003654],[2025,5,0.008948,0.003654],[2025,6,0.008948,0.007587],
  [2025,7,0.009800,0.021655],[2025,8,0.009800,0.006258],[2025,9,0.009800,0.003631],
  [2025,10,0.009800,0.004275],[2025,11,0.009800,0.004275],[2025,12,0.009800,0.008189],
  [2026,1,0.006966,0.012345],[2026,2,0.006966,0.010583],[2026,3,0.006966,0.004349],
  [2026,4,0.010500,0.003619],[2026,5,0.010500,0.003619],[2026,6,0.010500,0.007593],
  [2026,7,0.010501,0.024466],[2026,8,0.010501,0.006288],[2026,9,0.010501,0.003197],
].map((row) =>
  makeFallback(
    Number(row[0]),
    Number(row[1]),
    Number(row[2]),
    Number(row[3])
  )
);

export function isDomesticEnergyType(type: string) {
  return [
    "RESIDENTE",
    "NON RESIDENTE",
    "RESIDENTE CANONE ESENTE",
  ].includes(String(type || "").toUpperCase());
}

export function dispCapacityRate(
  row: DispCpRow | undefined,
  type: string
) {
  if (!row) return 0;
  const value = isDomesticEnergyType(type)
    ? row.cdispDomestico
    : row.businessTotale;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeDispMonthLabel(value: string) {
  const clean = String(value || "").trim().toUpperCase();
  if (!clean) return "";

  const match = clean.match(
    /^(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\s+(20\d{2})$/
  );
  return match ? `${match[1]} ${match[2]}` : clean;
}

export async function fetchDispCapacityRows(force = false): Promise<{
  rows: DispCpRow[];
  meta: DispCapacityMeta;
}> {
  const suffix = force ? `?force=1&t=${Date.now()}` : "";
  const response = await fetch(`/api/disp-capacity${suffix}`, {
    headers: { Accept: "application/json" },
    cache: force ? "no-store" : "default",
  });

  if (!response.ok) {
    throw new Error(
      `Aggiornamento Dispacciamento/Capacity non disponibile (${response.status})`
    );
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
        .map((row: any) => ({
          mese: String(row.mese || ""),
          anno: Number(row.anno || 0),
          meseNumero: Number(row.meseNumero || 0),
          tide:
            row.tide === null || row.tide === undefined
              ? null
              : Number(row.tide),
          cpMarket:
            row.cpMarket === null || row.cpMarket === undefined
              ? null
              : Number(row.cpMarket),
          businessTotale:
            row.businessTotale === null ||
            row.businessTotale === undefined
              ? null
              : Number(row.businessTotale),
          cdispDomestico:
            row.cdispDomestico === null ||
            row.cdispDomestico === undefined
              ? null
              : Number(row.cdispDomestico),
          status: String(row.status || ""),
          sourceTide: String(row.sourceTide || ""),
          sourceCapacity: String(row.sourceCapacity || ""),
          sourceDomestic: String(row.sourceDomestic || ""),
        }))
        .filter(
          (row: DispCpRow) =>
            row.mese &&
            row.anno >= 2025 &&
            row.meseNumero >= 1 &&
            row.meseNumero <= 12
        )
    : [];

  return {
    rows: rows.length ? rows : INITIAL_AUTO_DISP_CP_ROWS,
    meta: {
      checkedAt: String(payload?.checkedAt || new Date().toISOString()),
      sourceStatus: String(payload?.sourceStatus || ""),
      warnings: Array.isArray(payload?.warnings)
        ? payload.warnings.map(String)
        : [],
    },
  };
}
