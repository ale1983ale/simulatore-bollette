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
  cpMarket: number,
  cdispDomestico: number
): DispCpRow {
  const businessTotale = Number((tide + cpMarket).toFixed(6));
  return {
    mese: `${MONTHS[meseNumero - 1]} ${anno}`,
    anno,
    meseNumero,
    tide,
    cpMarket,
    businessTotale,
    cdispDomestico,
    status: "STORICO VERIFICATO",
    sourceTide: "TERNA",
    sourceCapacity: "ARERA",
    sourceDomestic: "ARERA",
  };
}

export const INITIAL_AUTO_DISP_CP_ROWS: DispCpRow[] = [
  [2025,1,0.008985,0.011677,0.022728],
  [2025,2,0.008985,0.010304,0.021218],
  [2025,3,0.008985,0.004000,0.014284],
  [2025,4,0.008948,0.003654,0.013862],
  [2025,5,0.008948,0.003654,0.013862],
  [2025,6,0.008948,0.007587,0.018189],
  [2025,7,0.009800,0.021655,0.034601],
  [2025,8,0.009800,0.006258,0.017664],
  [2025,9,0.009800,0.003631,0.014774],
  [2025,10,0.009800,0.004275,0.015483],
  [2025,11,0.009800,0.004275,0.015483],
  [2025,12,0.009800,0.008189,0.019788],
  [2026,1,0.010659,0.012345,0.025304],
  [2026,2,0.010659,0.010583,0.023366],
  [2026,3,0.010659,0.004349,0.016509],
  [2026,4,0.010500,0.003619,0.015531],
  [2026,5,0.010500,0.003619,0.015531],
  [2026,6,0.010500,0.007593,0.019902],
  [2026,7,0.010501,0.024466,0.038464],
  [2026,8,0.010501,0.006288,0.018468],
  [2026,9,0.010501,0.003197,0.015068],
].map((row) =>
  makeFallback(
    Number(row[0]),
    Number(row[1]),
    Number(row[2]),
    Number(row[3]),
    Number(row[4])
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
  const params = new URLSearchParams();
  params.set("v", "3");
  params.set("t", String(Date.now()));
  if (force) params.set("force", "1");

  const response = await fetch(`/api/disp-capacity?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
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
