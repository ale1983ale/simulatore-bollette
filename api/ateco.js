import * as XLSX from "xlsx";

const ATECO_CSV_URL =
  "https://raw.githubusercontent.com/istat/ndc-ontologie-vocabolari-controllati/main/assets/controlled-vocabularies/economy/ateco-2025/ateco-2025.csv";
const RACCORDO_URL =
  "https://www.istat.it/wp-content/uploads/2026/07/Aggiornamento-2026-Tavola-raccordo-bidirezionale-ATECO-2025-ATECO-2022-italiano.xlsx";

let cachedStructure = null;
let cachedRaccordo = null;

function cleanCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/^'+|'+$/g, "");
}

function compactCode(value) {
  return cleanCode(value).replace(/[^0-9A-Z]/g, "");
}

function parseDelimitedLine(line, delimiter = ";") {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function loadStructure() {
  if (cachedStructure) return cachedStructure;
  const response = await fetch(ATECO_CSV_URL, { headers: { "User-Agent": "simulatore-bollette" } });
  if (!response.ok) throw new Error(`Struttura ATECO non disponibile (${response.status})`);
  const text = (await response.text()).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const byCompact = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseDelimitedLine(lines[i]);
    const code = cleanCode(cols[0]);
    const label = String(cols[1] ?? "").trim();
    if (!code || !label) continue;
    byCompact.set(compactCode(code), { code, label });
  }
  cachedStructure = byCompact;
  return cachedStructure;
}

function findHeaderIndex(row, year) {
  const cells = row.map((cell) => String(cell ?? "").trim().toUpperCase());
  let index = cells.findIndex((cell) => cell.includes(year) && cell.includes("COD"));
  if (index >= 0) return index;
  index = cells.findIndex(
    (cell) => cell.includes(`ATECO ${year}`) && !cell.includes("DESCR") && !cell.includes("TITO")
  );
  return index;
}

function looksLikeAtecoCode(value) {
  const code = cleanCode(value);
  return /^(?:[A-Z]|\d{2}(?:\.\d{1,2}){0,2})$/.test(code);
}

async function loadRaccordo() {
  if (cachedRaccordo) return cachedRaccordo;
  const response = await fetch(RACCORDO_URL, { headers: { "User-Agent": "simulatore-bollette" } });
  if (!response.ok) throw new Error(`Tavola di raccordo ISTAT non disponibile (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const map = new Map();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    let headerRow = -1;
    let oldIndex = -1;
    let newIndex = -1;

    for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      const maybeOld = findHeaderIndex(row, "2022");
      const maybeNew = findHeaderIndex(row, "2025");
      if (maybeOld >= 0 && maybeNew >= 0 && maybeOld !== maybeNew) {
        headerRow = r;
        oldIndex = maybeOld;
        newIndex = maybeNew;
        break;
      }
    }

    if (headerRow < 0) continue;

    for (let r = headerRow + 1; r < rows.length; r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      const oldCode = cleanCode(row[oldIndex]);
      const newCode = cleanCode(row[newIndex]);
      if (!looksLikeAtecoCode(oldCode) || !looksLikeAtecoCode(newCode)) continue;
      const key = compactCode(oldCode);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(newCode);
    }
  }

  cachedRaccordo = map;
  return cachedRaccordo;
}

export default async function handler(req, res) {
  try {
    const input = cleanCode(req.query?.code || "");
    if (!input) return res.status(400).json({ error: "Inserisci un codice ATECO." });

    const structure = await loadStructure();
    const current = structure.get(compactCode(input)) || null;

    let mappings = [];
    let mappingWarning = null;
    try {
      const raccordo = await loadRaccordo();
      const mappedCodes = [...(raccordo.get(compactCode(input)) || [])];
      mappings = mappedCodes.map((code) => structure.get(compactCode(code)) || { code, label: "Descrizione non disponibile" });
    } catch (error) {
      mappingWarning = error?.message || String(error);
    }

    return res.status(200).json({
      input,
      current,
      mappings,
      mappingWarning,
      sources: {
        structure: "ISTAT ATECO 2025",
        raccordo: "ISTAT raccordo ATECO 2022-2025, aggiornamento 2026",
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Errore durante la ricerca ATECO." });
  }
}
