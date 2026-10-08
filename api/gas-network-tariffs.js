const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE",
];

const BRACKETS = [
  [0,120],[120,480],[480,1560],[1560,5000],
  [5000,80000],[80000,200000],[200000,1000000],[1000000,null],
];

const UG2 = [0,0.0496,0.0293,0.0237,0.0170,0.0071,0,0];
const UG1 = [0.034837,0.034837,0.034837,0.034837,0.034837,0.034837,0.017603,0.017603];
const UG3 = [0.007292,0.007292,0.007292,0.007292,0.007292,0.007292,0.007292,0.007292];
const GS = [0.003907,0.003907,0.003907,0.003907,0.003907,0.003907,0.001826,0.001826];
const RE = [0.029417,0.029417,0.029417,0.029417,0.029417,0.029417,0.015611,0.015611];
const RS = [0.002788,0.002788,0.002788,0.002788,0.002788,0.002788,0.001409,0.001409];
const UG2_FIXED_ANNUAL = -21.63;
const GAS_PCS_GJ_PER_SMC = 0.03852;

function qtEuroPerGJForMonth(month) {
  if (month <= 3) return 2.513485;
  return 1.931333;
}

function qtEuroPerSmcForMonth(month) {
  return qtEuroPerGJForMonth(month) * GAS_PCS_GJ_PER_SMC;
}

const AMBITI = {
  "NORD OCCIDENTALE": {
    fixedDistribution:[49.52,375.60,726.93],
    fixedMeasure:[29.23,210.52,405.84],
    fixedCommercial:2.01, st:-0.23, vr:0.07, ce:0,
    variableDistribution:[0,0.107315,0.098223,0.098636,0.073701,0.037333,0.018322,0.005097],
  },
  "NORD ORIENTALE": {
    fixedDistribution:[40.26,295.72,604.12],
    fixedMeasure:[27.33,189.98,386.34],
    fixedCommercial:2.01, st:-0.35, vr:-0.01, ce:0,
    variableDistribution:[0,0.079367,0.072643,0.072949,0.054508,0.027610,0.013551,0.003770],
  },
  "CENTRALE": {
    fixedDistribution:[44.77,323.58,666.35],
    fixedMeasure:[26.81,183.20,375.46],
    fixedCommercial:2.01, st:0, vr:0, ce:0,
    variableDistribution:[0,0.111183,0.101763,0.102191,0.076358,0.038678,0.018982,0.005281],
  },
  "CENTRO-SUD ORIENTALE": {
    fixedDistribution:[38.10,284.19,587.85],
    fixedMeasure:[27.67,195.40,402.37],
    fixedCommercial:2.01, st:0, vr:0, ce:0,
    variableDistribution:[0,0.132517,0.121290,0.121800,0.091010,0.046100,0.022625,0.006294],
  },
  "CENTRO-SUD OCCIDENTALE": {
    fixedDistribution:[54.02,423.15,854.31],
    fixedMeasure:[31.39,234.26,471.23],
    fixedCommercial:2.01, st:-0.35, vr:-0.37, ce:0,
    variableDistribution:[0,0.193801,0.177381,0.178128,0.133098,0.067420,0.033088,0.009205],
  },
  "MERIDIONALE": {
    fixedDistribution:[65.32,471.95,1018.27],
    fixedMeasure:[28.99,198.85,427.07],
    fixedCommercial:2.01, st:0, vr:0, ce:0,
    variableDistribution:[0,0.258579,0.236671,0.237667,0.177586,0.089955,0.044148,0.012282],
  },
  "SARDEGNA": {
    fixedDistribution:[1641.38,2048.01,2594.33],
    fixedMeasure:[28.99,198.85,427.07],
    fixedCommercial:2.01, st:0, vr:0, ce:-1576.06,
    variableDistribution:[0,0.258579,0.236671,0.237667,0.177586,0.089955,0.044148,0.012282],
  },
};

function round6(v) {
  return Number(Number(v || 0).toFixed(6));
}

function buildRows() {
  const rows = [];
  const classes = ["G4-G6","G10-G40","OLTRE G40"];

  for (let month = 1; month <= 12; month += 1) {
    for (const [ambito, cfg] of Object.entries(AMBITI)) {
      classes.forEach((classeContatore, meterIndex) => {
        const qtTrasporto = qtEuroPerSmcForMonth(month);
        const quotaFissaAnnua =
          cfg.fixedDistribution[meterIndex] +
          cfg.fixedMeasure[meterIndex] +
          cfg.fixedCommercial +
          UG2_FIXED_ANNUAL +
          cfg.st +
          cfg.vr +
          cfg.ce;

        BRACKETS.forEach(([from,to], index) => {
          const baseVariable =
            cfg.variableDistribution[index] +
            UG2[index] +
            UG1[index] +
            UG3[index] +
            RE[index] +
            RS[index] +
            qtTrasporto;

          rows.push({
            mese: `${MONTHS[month - 1]} 2026`,
            anno: 2026,
            meseNumero: month,
            ambito,
            classeContatore,
            scaglione: index + 1,
            daSmc: from,
            aSmc: to,
            quotaFissaAnnua: round6(quotaFissaAnnua),
            quotaDistribuzione: round6(cfg.variableDistribution[index]),
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
      });
    }
  }

  return rows;
}

const SOURCE_URLS = [
  "https://www.arera.it/atti-e-provvedimenti/dettaglio/25/574-25",
  "https://www.arera.it/fileadmin/allegati/docs/25/588-2025-R-com.pdf",
  "https://www.arera.it/atti-e-provvedimenti/dettaglio/25/126-25",
  "https://www.arera.it/atti-e-provvedimenti/dettaglio/26/98-26",
  "https://www.arera.it/atti-e-provvedimenti/dettaglio/26/343-26",
];

export default async function handler(req, res) {
  const force = String(req.query?.force || "") === "1";
  const checkedAt = new Date().toISOString();
  const warnings = [];

  const checks = await Promise.allSettled(
    SOURCE_URLS.map((url) =>
      fetch(url, {
        headers: { "User-Agent": "simulatore-bollette/1.0" },
        redirect: "follow",
      })
    )
  );

  checks.forEach((result, index) => {
    if (result.status === "rejected" || !result.value?.ok) {
      warnings.push(`Fonte ARERA non raggiungibile: ${SOURCE_URLS[index]}`);
    }
  });

  res.setHeader(
    "Cache-Control",
    force
      ? "no-store"
      : "public, s-maxage=21600, stale-while-revalidate=86400"
  );

  return res.status(200).json({
    checkedAt,
    rows: buildRows(),
    sourceStatus: warnings.length
      ? "FONTI_NON_DISPONIBILI_TARIFFE_BASE"
      : "FONTI_RAGGIUNGIBILI_TARIFFE_BASE",
    warnings: [...warnings, "Le fonti ARERA sono controllate automaticamente; la pagina non fornisce in questo endpoint un prospetto numerico nuovo da applicare. Restano i valori di riferimento."],
    assumptions: {
      year: 2026,
      gs: "0 per DOMESTICO; componente ordinaria per BUSINESS",
      trasporto: "QTt incluso: gen-mar 2,513485 €/GJ; da aprile 1,931333 €/GJ",
    },
  });
}
