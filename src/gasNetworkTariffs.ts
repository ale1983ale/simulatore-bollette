export type GasMeterClass = "G4-G6" | "G10-G40" | "OLTRE G40";

export type GasNetworkTariffRow = {
  mese: string;
  anno: number;
  meseNumero: number;
  ambito: string;
  classeContatore: GasMeterClass;
  scaglione: number;
  daSmc: number;
  aSmc: number | null;
  quotaFissaAnnua: number;
  quotaDistribuzione: number;
  ug2: number;
  ug1: number;
  ug3: number;
  gsDomestico: number;
  gsBusiness: number;
  re: number;
  rs: number;
  qtTrasporto: number;
  quotaVariabileDomestico: number;
  quotaVariabileBusiness: number;
  status: string;
  source: string;
};

export type GasNetworkTariffMeta = {
  checkedAt: string;
  sourceStatus: string;
  warnings: string[];
};

export type GasNetworkCalculation = {
  available: boolean;
  ambito: string;
  annualConsumption: number;
  averageVariableRate: number;
  quotaConsumiRete: number;
  quotaFissaRete: number;
  totaleReteOneri: number;
  scaglioneApplicato: number;
  scaglioneLabel: string;
  periodi: Array<{
    mese: string;
    consumo: number;
    quotaVariabile: number;
    quotaFissa: number;
    aliquotaVariabile: number;
    scaglione: number;
  }>;
  reason?: string;
};

const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE",
];

const REGION_TO_AMBITO: Record<string, string> = {
  "VALLE D'AOSTA": "NORD OCCIDENTALE",
  "VALLE D AOSTA": "NORD OCCIDENTALE",
  "PIEMONTE": "NORD OCCIDENTALE",
  "LIGURIA": "NORD OCCIDENTALE",
  "LOMBARDIA": "NORD ORIENTALE",
  "TRENTINO-ALTO ADIGE": "NORD ORIENTALE",
  "TRENTINO ALTO ADIGE": "NORD ORIENTALE",
  "VENETO": "NORD ORIENTALE",
  "FRIULI-VENEZIA GIULIA": "NORD ORIENTALE",
  "FRIULI VENEZIA GIULIA": "NORD ORIENTALE",
  "EMILIA-ROMAGNA": "NORD ORIENTALE",
  "EMILIA ROMAGNA": "NORD ORIENTALE",
  "TOSCANA": "CENTRALE",
  "UMBRIA": "CENTRALE",
  "MARCHE": "CENTRALE",
  "ABRUZZO": "CENTRO-SUD ORIENTALE",
  "MOLISE": "CENTRO-SUD ORIENTALE",
  "PUGLIA": "CENTRO-SUD ORIENTALE",
  "BASILICATA": "CENTRO-SUD ORIENTALE",
  "LAZIO": "CENTRO-SUD OCCIDENTALE",
  "CAMPANIA": "CENTRO-SUD OCCIDENTALE",
  "CALABRIA": "MERIDIONALE",
  "SICILIA": "MERIDIONALE",
  "SARDEGNA": "SARDEGNA",
};

type AmbitoConfig = {
  fixedDistribution: [number, number, number];
  fixedMeasure: [number, number, number];
  fixedCommercial: number;
  st: number;
  vr: number;
  ce: number;
  variableDistribution: number[];
};

const AMBITI_2026: Record<string, AmbitoConfig> = {
  "NORD OCCIDENTALE": {
    fixedDistribution: [49.52, 375.60, 726.93],
    fixedMeasure: [29.23, 210.52, 405.84],
    fixedCommercial: 2.01,
    st: -0.23,
    vr: 0.07,
    ce: 0,
    variableDistribution: [0, 0.107315, 0.098223, 0.098636, 0.073701, 0.037333, 0.018322, 0.005097],
  },
  "NORD ORIENTALE": {
    fixedDistribution: [40.26, 295.72, 604.12],
    fixedMeasure: [27.33, 189.98, 386.34],
    fixedCommercial: 2.01,
    st: -0.35,
    vr: -0.01,
    ce: 0,
    variableDistribution: [0, 0.079367, 0.072643, 0.072949, 0.054508, 0.027610, 0.013551, 0.003770],
  },
  "CENTRALE": {
    fixedDistribution: [44.77, 323.58, 666.35],
    fixedMeasure: [26.81, 183.20, 375.46],
    fixedCommercial: 2.01,
    st: 0,
    vr: 0,
    ce: 0,
    variableDistribution: [0, 0.111183, 0.101763, 0.102191, 0.076358, 0.038678, 0.018982, 0.005281],
  },
  "CENTRO-SUD ORIENTALE": {
    fixedDistribution: [38.10, 284.19, 587.85],
    fixedMeasure: [27.67, 195.40, 402.37],
    fixedCommercial: 2.01,
    st: 0,
    vr: 0,
    ce: 0,
    variableDistribution: [0, 0.132517, 0.121290, 0.121800, 0.091010, 0.046100, 0.022625, 0.006294],
  },
  "CENTRO-SUD OCCIDENTALE": {
    fixedDistribution: [54.02, 423.15, 854.31],
    fixedMeasure: [31.39, 234.26, 471.23],
    fixedCommercial: 2.01,
    st: -0.35,
    vr: -0.37,
    ce: 0,
    variableDistribution: [0, 0.193801, 0.177381, 0.178128, 0.133098, 0.067420, 0.033088, 0.009205],
  },
  "MERIDIONALE": {
    fixedDistribution: [65.32, 471.95, 1018.27],
    fixedMeasure: [28.99, 198.85, 427.07],
    fixedCommercial: 2.01,
    st: 0,
    vr: 0,
    ce: 0,
    variableDistribution: [0, 0.258579, 0.236671, 0.237667, 0.177586, 0.089955, 0.044148, 0.012282],
  },
  "SARDEGNA": {
    fixedDistribution: [1641.38, 2048.01, 2594.33],
    fixedMeasure: [28.99, 198.85, 427.07],
    fixedCommercial: 2.01,
    st: 0,
    vr: 0,
    ce: -1576.06,
    variableDistribution: [0, 0.258579, 0.236671, 0.237667, 0.177586, 0.089955, 0.044148, 0.012282],
  },
};

const BRACKETS = [
  [0, 120],
  [120, 480],
  [480, 1560],
  [1560, 5000],
  [5000, 80000],
  [80000, 200000],
  [200000, 1000000],
  [1000000, null],
] as const;

const UG2 = [0, 0.0496, 0.0293, 0.0237, 0.0170, 0.0071, 0, 0];
const UG1 = [0.034837,0.034837,0.034837,0.034837,0.034837,0.034837,0.017603,0.017603];
const UG3 = [0.007292,0.007292,0.007292,0.007292,0.007292,0.007292,0.007292,0.007292];
const GS = [0.003907,0.003907,0.003907,0.003907,0.003907,0.003907,0.001826,0.001826];
const RE = [0.029417,0.029417,0.029417,0.029417,0.029417,0.029417,0.015611,0.015611];
const RS = [0.002788,0.002788,0.002788,0.002788,0.002788,0.002788,0.001409,0.001409];
const UG2_FIXED_ANNUAL = -21.63;
const GAS_PCS_GJ_PER_SMC = 0.03852;

function qtEuroPerGJForMonth(month: number) {
  if (month <= 3) return 2.513485;
  return 1.931333;
}

function qtEuroPerSmcForMonth(month: number) {
  return qtEuroPerGJForMonth(month) * GAS_PCS_GJ_PER_SMC;
}

export const GAS_REGIONS = Object.keys(REGION_TO_AMBITO);

export function gasRegionToAmbito(region: string) {
  return REGION_TO_AMBITO[String(region || "").trim().toUpperCase()] || "";
}

function meterClassIndex(value: GasMeterClass) {
  if (value === "G10-G40") return 1;
  if (value === "OLTRE G40") return 2;
  return 0;
}

function round6(value: number) {
  return Number(Number(value || 0).toFixed(6));
}

export function buildInitialGasNetworkTariffRows(): GasNetworkTariffRow[] {
  const rows: GasNetworkTariffRow[] = [];
  const year = 2026;

  for (let month = 1; month <= 12; month += 1) {
    for (const [ambito, config] of Object.entries(AMBITI_2026)) {
      for (const classeContatore of ["G4-G6","G10-G40","OLTRE G40"] as GasMeterClass[]) {
        const meterIndex = meterClassIndex(classeContatore);
        const qtTrasporto = qtEuroPerSmcForMonth(month);
        const quotaFissaAnnua =
          config.fixedDistribution[meterIndex] +
          config.fixedMeasure[meterIndex] +
          config.fixedCommercial +
          UG2_FIXED_ANNUAL +
          config.st +
          config.vr +
          config.ce;

        BRACKETS.forEach(([from, to], index) => {
          const baseVariable =
            config.variableDistribution[index] +
            UG2[index] +
            UG1[index] +
            UG3[index] +
            RE[index] +
            RS[index] +
            qtTrasporto;

          rows.push({
            mese: `${MONTHS[month - 1]} ${year}`,
            anno: year,
            meseNumero: month,
            ambito,
            classeContatore,
            scaglione: index + 1,
            daSmc: from,
            aSmc: to,
            quotaFissaAnnua: round6(quotaFissaAnnua),
            quotaDistribuzione: round6(config.variableDistribution[index]),
            ug2: round6(UG2[index]),
            ug1: round6(UG1[index]),
            ug3: round6(UG3[index]),
            gsDomestico: 0,
            gsBusiness: round6(GS[index]),
            re: round6(RE[index]),
            rs: round6(RS[index]),
            qtTrasporto: round6(qtTrasporto),
            quotaVariabileDomestico: round6(baseVariable),
            quotaVariabileBusiness: round6(baseVariable + GS[index]),
            status: "STORICO UFFICIALE 2026",
            source: "ARERA 574/2025/R/gas + 588/2025/R/com + 126/2025/R/gas + 98/2026/R/com + 343/2026/R/com",
          });
        });
      }
    }
  }

  return rows;
}

export const INITIAL_GAS_NETWORK_TARIFF_ROWS =
  buildInitialGasNetworkTariffRows();

export function normalizeGasNetworkMonth(value: string) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function variableRateForAnnualConsumption(
  rows: GasNetworkTariffRow[],
  annualConsumption: number,
  uso: string
) {
  const annual = Math.max(0, Number(annualConsumption || 0));
  if (!annual || !rows.length) {
    return { rate: 0, scaglione: 0, label: "-" };
  }

  const sorted = [...rows].sort((a, b) => a.scaglione - b.scaglione);

  const row =
    sorted.find((item, index) => {
      const aboveLower =
        index === 0 ? annual >= item.daSmc : annual > item.daSmc;
      const belowUpper =
        item.aSmc == null ? true : annual <= item.aSmc;
      return aboveLower && belowUpper;
    }) || sorted[sorted.length - 1];

  const rate =
    String(uso || "").toUpperCase() === "DOMESTICO"
      ? row.quotaVariabileDomestico
      : row.quotaVariabileBusiness;

  const label =
    row.aSmc == null
      ? `oltre ${row.daSmc.toLocaleString("it-IT")} Smc`
      : `${Math.floor(row.daSmc + (row.scaglione === 1 ? 0 : 1)).toLocaleString("it-IT")}–${row.aSmc.toLocaleString("it-IT")} Smc`;

  return {
    rate,
    scaglione: row.scaglione,
    label,
  };
}

export function calculateGasNetworkCharges(args: {
  rows: GasNetworkTariffRow[];
  regione: string;
  classeContatore: GasMeterClass;
  uso: string;
  annualConsumption: number;
  periods: Array<{ mese: string; consumo: number }>;
}): GasNetworkCalculation {
  const ambito = gasRegionToAmbito(args.regione);
  const annualConsumption = Math.max(0, Number(args.annualConsumption || 0));
  const periods = (args.periods || []).filter((item) => item.mese);

  if (!ambito) {
    return {
      available: false,
      ambito: "",
      annualConsumption,
      averageVariableRate: 0,
      quotaConsumiRete: 0,
      quotaFissaRete: 0,
      totaleReteOneri: 0,
      scaglioneApplicato: 0,
      scaglioneLabel: "-",
      periodi: [],
      reason: "REGIONE NON VALIDA",
    };
  }

  if (!periods.length) {
    return {
      available: false,
      ambito,
      annualConsumption,
      averageVariableRate: 0,
      quotaConsumiRete: 0,
      quotaFissaRete: 0,
      totaleReteOneri: 0,
      scaglioneApplicato: 0,
      scaglioneLabel: "-",
      periodi: [],
      reason: "SELEZIONA I MESI DELLA FATTURA",
    };
  }

  const resultPeriods: GasNetworkCalculation["periodi"] = [];
  let variableTotal = 0;
  let fixedTotal = 0;
  let weightedRateSum = 0;
  let scaglioneApplicato = 0;
  let scaglioneLabel = "-";

  for (const period of periods) {
    const month = normalizeGasNetworkMonth(period.mese);
    const monthRows = args.rows.filter(
      (row) =>
        row.mese === month &&
        row.ambito === ambito &&
        row.classeContatore === args.classeContatore
    );

    if (!monthRows.length) {
      return {
        available: false,
        ambito,
        annualConsumption,
        averageVariableRate: 0,
        quotaConsumiRete: 0,
        quotaFissaRete: 0,
        totaleReteOneri: 0,
        scaglioneApplicato: 0,
        scaglioneLabel: "-",
        periodi: resultPeriods,
        reason: `TARIFFA AUTOMATICA NON DISPONIBILE PER ${month}`,
      };
    }

    const rateInfo = variableRateForAnnualConsumption(
      monthRows,
      annualConsumption,
      args.uso
    );
    const rate = rateInfo.rate;
    scaglioneApplicato = rateInfo.scaglione;
    scaglioneLabel = rateInfo.label;
    const variable = Math.max(0, Number(period.consumo || 0)) * rate;
    const fixed = Number(monthRows[0].quotaFissaAnnua || 0) / 12;

    variableTotal += variable;
    fixedTotal += fixed;
    weightedRateSum += rate;

    resultPeriods.push({
      mese: month,
      consumo: Math.max(0, Number(period.consumo || 0)),
      quotaVariabile: round6(variable),
      quotaFissa: round6(fixed),
      aliquotaVariabile: round6(rate),
      scaglione: rateInfo.scaglione,
    });
  }

  return {
    available: true,
    ambito,
    annualConsumption,
    averageVariableRate: round6(
      periods.length ? weightedRateSum / periods.length : 0
    ),
    quotaConsumiRete: round6(variableTotal),
    quotaFissaRete: round6(fixedTotal),
    totaleReteOneri: round6(variableTotal + fixedTotal),
    scaglioneApplicato,
    scaglioneLabel,
    periodi: resultPeriods,
  };
}

export async function fetchGasNetworkTariffRows(force = false): Promise<{
  rows: GasNetworkTariffRow[];
  meta: GasNetworkTariffMeta;
}> {
  const params = new URLSearchParams();
  params.set("v", "1");
  params.set("t", String(Date.now()));
  if (force) params.set("force", "1");

  const response = await fetch(
    `/api/gas-network-tariffs?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Aggiornamento rete/oneri gas non disponibile (${response.status})`
    );
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.rows)
    ? payload.rows.map((row: any) => ({
        ...row,
        anno: Number(row.anno || 0),
        meseNumero: Number(row.meseNumero || 0),
        scaglione: Number(row.scaglione || 0),
        daSmc: Number(row.daSmc || 0),
        aSmc:
          row.aSmc === null || row.aSmc === undefined
            ? null
            : Number(row.aSmc),
        quotaFissaAnnua: Number(row.quotaFissaAnnua || 0),
        quotaDistribuzione: Number(row.quotaDistribuzione || 0),
        ug2: Number(row.ug2 || 0),
        ug1: Number(row.ug1 || 0),
        ug3: Number(row.ug3 || 0),
        gsDomestico: Number(row.gsDomestico || 0),
        gsBusiness: Number(row.gsBusiness || 0),
        re: Number(row.re || 0),
        rs: Number(row.rs || 0),
        qtTrasporto: Number(row.qtTrasporto || 0),
        quotaVariabileDomestico: Number(row.quotaVariabileDomestico || 0),
        quotaVariabileBusiness: Number(row.quotaVariabileBusiness || 0),
      }))
    : [];

  return {
    rows: rows.length ? rows : INITIAL_GAS_NETWORK_TARIFF_ROWS,
    meta: {
      checkedAt: String(payload?.checkedAt || new Date().toISOString()),
      sourceStatus: String(payload?.sourceStatus || "STORICO LOCALE"),
      warnings: Array.isArray(payload?.warnings)
        ? payload.warnings.map(String)
        : [],
    },
  };
}
