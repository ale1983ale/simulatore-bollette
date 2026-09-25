import * as XLSX from "xlsx";

const SOURCES = {
  dist: "https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/tariffe_di_distribuzione/616-23TIT_ti__2_.xlsx",
  dom2026: "https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/Corrispettivi_libero_elettrico_domestico_2026.xlsx",
  dom2025: "https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/Corrispettivi_libero_elettrico_domestico_2025.xlsx",
};

export default async function handler(req, res) {
  const key = String(req.query?.source || "dist");
  const url = SOURCES[key] || SOURCES.dist;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "simulatore-bollette/1.0" } });
    if (!r.ok) return res.status(r.status).json({ ok:false, url, status:r.status });
    const buf = await r.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array", cellDates:false, raw:false });
    const sheets = wb.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:"", raw:false })
        .slice(0,120)
        .map(row => row.slice(0,30))
    }));
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ ok:true, url, sheets });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
}
