import * as XLSX from "xlsx";

const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

const MONTH_ALIASES = {
  gennaio: 1, january: 1, jan: 1,
  febbraio: 2, february: 2, feb: 2,
  marzo: 3, march: 3, mar: 3,
  aprile: 4, april: 4, apr: 4,
  maggio: 5, may: 5,
  giugno: 6, june: 6, jun: 6,
  luglio: 7, july: 7, jul: 7,
  agosto: 8, august: 8, aug: 8,
  settembre: 9, september: 9, sep: 9, sept: 9,
  ottobre: 10, october: 10, oct: 10,
  novembre: 11, november: 11, nov: 11,
  dicembre: 12, december: 12, dec: 12,
};

const SEED = [
  // anno, mese, TIDE (netto perdite), Capacity (netto perdite), C_DISPD domestico (lordo perdite)
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
  [2026,1,0.006966,0.012345,0.025304],
  [2026,2,0.006966,0.010583,0.023366],
  [2026,3,0.006966,0.004349,0.016509],
  [2026,4,0.010500,0.003619,0.015531],
  [2026,5,0.010500,0.003619,0.015531],
  [2026,6,0.010500,0.007593,0.019902],
  [2026,7,0.010501,0.024466,0.038464],
  [2026,8,0.010501,0.006288,0.018468],
  [2026,9,0.010501,0.003197,0.015068],
].map(([anno,meseNumero,tide,cpMarket,cdispDomestico]) => makeRow({
  anno, meseNumero, tide, cpMarket, cdispDomestico,
  status: "STORICO VERIFICATO",
  sourceTide: "TERNA",
  sourceCapacity: "ARERA",
  sourceDomestic: "ARERA",
}));

const DOMESTIC_URL = (year) =>
  `https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/Corrispettivi_libero_elettrico_domestico_${year}.xlsx`;
const BUSINESS_URL =
  "https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/corrispettivi_dispacciamento_applicati_ai_BRP.xlsx";

function round6(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null;
}

function makeRow({
  anno, meseNumero, tide = null, cpMarket = null, cdispDomestico = null,
  status = "DISPONIBILE", sourceTide = "", sourceCapacity = "", sourceDomestic = ""
}) {
  const businessTotale =
    Number.isFinite(Number(tide)) && Number.isFinite(Number(cpMarket))
      ? round6(Number(tide) + Number(cpMarket))
      : null;
  const domestic =
    Number.isFinite(Number(cdispDomestico))
      ? round6(cdispDomestico)
      : null;
  return {
    mese: `${MONTHS[meseNumero - 1]} ${anno}`,
    anno,
    meseNumero,
    tide: Number.isFinite(Number(tide)) ? round6(tide) : null,
    cpMarket: Number.isFinite(Number(cpMarket)) ? round6(cpMarket) : null,
    businessTotale,
    cdispDomestico: domestic,
    status,
    sourceTide,
    sourceCapacity,
    sourceDomestic,
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9+\-.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeRate(value, header = "") {
  const number = parseNumber(value);
  if (number === null || number < 0 || number > 100) return null;
  const h = normalizeText(header);
  if (
    h.includes("cent") ||
    h.includes("c€/") ||
    h.includes("c euro") ||
    h.includes("centesim")
  ) {
    return round6(number / 100);
  }
  // TIDE / capacity official notices often expose c€/kWh values around 0.3-2.5.
  if (number >= 0.1) return round6(number / 100);
  return round6(number);
}

function parseYear(text, fallbackYear = null) {
  const match = String(text ?? "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : fallbackYear;
}

function parsePeriodsFromText(value, fallbackYear = null) {
  const text = normalizeText(value);
  if (!text) return [];

  const year = parseYear(text, fallbackYear);
  if (!year) return [];

  for (const [alias, month] of Object.entries(MONTH_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(text)) {
      return [{ year, month }];
    }
  }

  const numericMonthYear =
    text.match(/\b(0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/) ||
    text.match(/\b(20\d{2})[\/\-.](0?[1-9]|1[0-2])\b/);
  if (numericMonthYear) {
    if (numericMonthYear[1]?.startsWith("20")) {
      return [{ year: Number(numericMonthYear[1]), month: Number(numericMonthYear[2]) }];
    }
    return [{ year: Number(numericMonthYear[2]), month: Number(numericMonthYear[1]) }];
  }

  const quarterMatch =
    text.match(/(?:^|\D)([1-4])\s*(?:°|o|º)?\s*(?:trim|trimestre|quarter|q)\b/i) ||
    text.match(/\bq\s*([1-4])\b/i);
  if (quarterMatch) {
    const q = Number(quarterMatch[1]);
    return [1,2,3].map((offset) => ({
      year,
      month: (q - 1) * 3 + offset,
    }));
  }

  return [];
}

function asSheets(buffer) {
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
  return asSheets(await response.arrayBuffer());
}

function sheetFallbackYear(sheetName, fallbackYear = null) {
  return parseYear(sheetName, fallbackYear);
}

function extractDomesticCdisp(sheets, fallbackYear) {
  const found = new Map();

  for (const sheet of sheets || []) {
    const rows = sheet.rows || [];
    const fallback = sheetFallbackYear(sheet.name, fallbackYear);

    for (let headerIndex = 0; headerIndex < rows.length; headerIndex += 1) {
      const header = rows[headerIndex].map(normalizeText);
      const cdispCol = header.findIndex((cell) =>
        cell.includes("c_dispd") ||
        cell.includes("c dispd") ||
        cell.includes("cdispd") ||
        (cell.includes("dispacciamento") && cell.includes("domestic"))
      );
      if (cdispCol < 0) continue;

      const headerText = rows[headerIndex][cdispCol];
      for (let r = headerIndex + 1; r < Math.min(rows.length, headerIndex + 80); r += 1) {
        const row = rows[r] || [];
        const periods = row
          .flatMap((cell) => parsePeriodsFromText(cell, fallback))
          .filter((period, index, arr) =>
            arr.findIndex((item) => item.year === period.year && item.month === period.month) === index
          );
        if (!periods.length) continue;

        const value = normalizeRate(row[cdispCol], headerText);
        if (
          value === null ||
          value <= 0.001 ||
          value >= 0.1
        ) {
          continue;
        }
        periods.forEach(({ year, month }) => {
          found.set(`${year}-${month}`, value);
        });
      }
    }
  }

  return found;
}

function headerComponent(cell) {
  const text = normalizeText(cell);
  if (!text) return null;
  if (
    text.includes("mercato della capacita") ||
    text.includes("mercato capacita") ||
    text.includes("capacity market") ||
    text.includes("cp market") ||
    text.includes("cmc")
  ) return "capacity";
  if (
    text.includes("tide") ||
    (text.includes("dispacciamento") &&
      !text.includes("domestic") &&
      !text.includes("c_dispd") &&
      !text.includes("cdispd"))
  ) return "tide";
  return null;
}

function extractBusinessComponents(sheets, fallbackYear = null) {
  const tide = new Map();
  const capacity = new Map();

  for (const sheet of sheets || []) {
    const rows = sheet.rows || [];
    const fallback = sheetFallbackYear(sheet.name, fallbackYear);

    for (let headerIndex = 0; headerIndex < rows.length; headerIndex += 1) {
      const components = rows[headerIndex].map(headerComponent);
      const componentCols = components
        .map((component, index) => ({ component, index }))
        .filter((item) => item.component);
      if (!componentCols.length) continue;

      for (let r = headerIndex + 1; r < Math.min(rows.length, headerIndex + 120); r += 1) {
        const row = rows[r] || [];
        const periods = row
          .flatMap((cell) => parsePeriodsFromText(cell, fallback))
          .filter((period, index, arr) =>
            arr.findIndex((item) => item.year === period.year && item.month === period.month) === index
          );
        if (!periods.length) continue;

        for (const { component, index } of componentCols) {
          const value = normalizeRate(row[index], rows[headerIndex][index]);
          if (value === null) continue;
          const target = component === "capacity" ? capacity : tide;
          periods.forEach(({ year, month }) => {
            target.set(`${year}-${month}`, value);
          });
        }
      }
    }
  }

  return { tide, capacity };
}

function mergeOfficial(seedRows, domesticMaps, businessMaps) {
  const map = new Map(seedRows.map((row) => [`${row.anno}-${row.meseNumero}`, { ...row }]));

  function ensure(year, month) {
    const key = `${year}-${month}`;
    if (!map.has(key)) {
      map.set(key, makeRow({ anno: year, meseNumero: month, status: "NUOVO DA FONTE UFFICIALE" }));
    }
    return map.get(key);
  }

  for (const domestic of domesticMaps || []) {
    for (const [key, value] of domestic.entries()) {
      const [year, month] = key.split("-").map(Number);
      const row = ensure(year, month);
      row.cdispDomestico = round6(value);
      row.sourceDomestic = "ARERA";
      row.status = "AGGIORNATO DA FONTE UFFICIALE";
    }
  }

  for (const { tide, capacity } of businessMaps || []) {
    for (const [key, value] of tide.entries()) {
      const [year, month] = key.split("-").map(Number);
      const row = ensure(year, month);
      row.tide = round6(value);
      row.sourceTide = "ARERA/TERNA";
      row.status = "AGGIORNATO DA FONTE UFFICIALE";
    }
    for (const [key, value] of capacity.entries()) {
      const [year, month] = key.split("-").map(Number);
      const row = ensure(year, month);
      row.cpMarket = round6(value);
      row.sourceCapacity = "ARERA";
      row.status = "AGGIORNATO DA FONTE UFFICIALE";
    }
  }

  return [...map.values()]
    .map((row) => {
      const businessTotale =
        Number.isFinite(Number(row.tide)) && Number.isFinite(Number(row.cpMarket))
          ? round6(Number(row.tide) + Number(row.cpMarket))
          : null;
      return {
        ...row,
        businessTotale,
        cdispDomestico:
          Number.isFinite(Number(row.cdispDomestico))
            ? round6(row.cdispDomestico)
            : null,
      };
    })
    .filter((row) =>
      Number.isFinite(Number(row.cdispDomestico)) ||
      Number.isFinite(Number(row.businessTotale))
    )
    .sort((a, b) => a.anno - b.anno || a.meseNumero - b.meseNumero);
}

export default async function handler(req, res) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const force = String(req.query?.force || "") === "1";
  const warnings = [];
  const domesticMaps = [];
  const businessMaps = [];

  const domesticYears = Array.from(new Set([2025, 2026, currentYear]));
  for (const year of domesticYears) {
    try {
      const sheets = await fetchWorkbook(DOMESTIC_URL(year));
      const extracted = extractDomesticCdisp(sheets, year);
      if (extracted.size) domesticMaps.push(extracted);
      else warnings.push(`ARERA domestico ${year}: C_DISPD non individuato nel file`);
    } catch (error) {
      warnings.push(`ARERA domestico ${year}: ${error?.message || error}`);
    }
  }

  try {
    const sheets = await fetchWorkbook(BUSINESS_URL);
    const extracted = extractBusinessComponents(sheets);
    if (extracted.tide.size || extracted.capacity.size) businessMaps.push(extracted);
    else warnings.push("ARERA/BRP: componenti TIDE/Capacity non individuate nel file");
  } catch (error) {
    warnings.push(`ARERA/BRP: ${error?.message || error}`);
  }

  const rows = mergeOfficial(SEED, domesticMaps, businessMaps);

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
    rows,
    sourceStatus:
      domesticMaps.length || businessMaps.length
        ? "AGGIORNAMENTO_AUTOMATICO_OK"
        : "FALLBACK_STORICO",
    warnings,
    sources: {
      domestic: {
        label: "ARERA · C_DISPD domestico",
        url: DOMESTIC_URL(currentYear),
      },
      businessDispatch: {
        label: "TIDE Terna / corrispettivi BRP",
        url: BUSINESS_URL,
      },
      capacityMarket: {
        label: "ARERA · Mercato della capacità",
        url: BUSINESS_URL,
      },
    },
  });
}
