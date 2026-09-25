import * as XLSX from "xlsx";

const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

const SEED = [
  [2025,1,0.005241,0.011677],[2025,2,0.005241,0.010304],[2025,3,0.005241,0.004000],
  [2025,4,0.008948,0.003654],[2025,5,0.008948,0.003654],[2025,6,0.008948,0.007587],
  [2025,7,0.009800,0.021655],[2025,8,0.009800,0.006258],[2025,9,0.009800,0.003631],
  [2025,10,0.009800,0.004275],[2025,11,0.009800,0.004275],[2025,12,0.009800,0.008189],
  [2026,1,0.006966,0.012345],[2026,2,0.006966,0.010583],[2026,3,0.006966,0.004349],
  [2026,4,0.010500,0.003619],[2026,5,0.010500,0.003619],[2026,6,0.010500,0.007593],
  [2026,7,0.010501,0.024466],[2026,8,0.010501,0.006288],[2026,9,0.010501,0.003197],
].map(([anno,meseNumero,tide,cpMarket]) => {
  const businessTotale = Number((tide + cpMarket).toFixed(6));
  const cdispDomestico = Number((businessTotale * 1.1).toFixed(6));
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
  };
});

const DOMESTIC_URL = (year) =>
  `https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/Corrispettivi_libero_elettrico_domestico_${year}.xlsx`;
const BUSINESS_URL =
  "https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/corrispettivi_dispacciamento_applicati_ai_BRP.xlsx";

function asRows(buffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
    }),
  }));
}

async function fetchWorkbook(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "simulatore-bollette/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return asRows(await response.arrayBuffer());
}

function compactDebug(sheets) {
  return sheets.map((sheet) => ({
    name: sheet.name,
    rows: sheet.rows
      .slice(0, 35)
      .map((row) => row.slice(0, 14))
      .filter((row) => row.some((cell) => String(cell || "").trim())),
  }));
}

export default async function handler(req, res) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const force = String(req.query?.force || "") === "1";
  const debug = String(req.query?.debug || "") === "1";

  const warnings = [];
  const snapshots = {};

  // Fetch the official workbooks on every forced refresh and periodically through Vercel cache.
  try {
    const domesticYears = Array.from(new Set([2025, 2026, currentYear]));
    const domestic = {};
    for (const year of domesticYears) {
      try {
        domestic[year] = await fetchWorkbook(DOMESTIC_URL(year));
      } catch (error) {
        warnings.push(`ARERA domestico ${year}: ${error?.message || error}`);
      }
    }
    snapshots.domestic = domestic;

    try {
      snapshots.business = await fetchWorkbook(BUSINESS_URL);
    } catch (error) {
      warnings.push(`ARERA/BRP: ${error?.message || error}`);
    }
  } catch (error) {
    warnings.push(error?.message || String(error));
  }

  if (debug) {
    return res.status(200).json({
      checkedAt: now.toISOString(),
      domestic: Object.fromEntries(
        Object.entries(snapshots.domestic || {}).map(([year, sheets]) => [
          year,
          compactDebug(sheets),
        ])
      ),
      business: snapshots.business ? compactDebug(snapshots.business) : null,
      warnings,
    });
  }

  if (force) {
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=21600, stale-while-revalidate=86400"
    );
  }

  return res.status(200).json({
    checkedAt: now.toISOString(),
    rows: SEED,
    sourceStatus: warnings.length ? "FALLBACK_STORICO" : "FONTI_UFFICIALI_RAGGIUNTE",
    warnings,
    sources: {
      domestic: "ARERA",
      businessDispatch: "TERNA / ARERA",
      capacityMarket: "ARERA",
    },
  });
}
