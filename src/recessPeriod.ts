/** La data di riferimento dei recessi proviene da NOTA_RECESSO, mai da DATA_VALIDITA_RECESSO. */
export function recessNoteText(raw: Record<string, unknown> | null | undefined): string {
  if (!raw || typeof raw !== "object") return "";
  for (const [key, value] of Object.entries(raw)) {
    const normalized = key.toLocaleUpperCase("it-IT").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
    if (normalized === "NOTARECESSO" || normalized === "NOTADIRECESSO" || normalized === "NOTERECESSO") {
      return String(value ?? "").trim();
    }
  }
  return "";
}

export function recessReferenceMonth(raw: Record<string, unknown> | null | undefined): string {
  const note = recessNoteText(raw);
  if (!note) return "";

  // Esempio: "NOTIFICA SW OUT_31/10/2026" => "2026-10".
  // Il 31/09 (presente in alcuni export) conta comunque come settembre:
  // il periodo dipende da mese e anno indicati, non dal giorno del mese.
  const dates = note.matchAll(/(?:^|[^\d])(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})(?=$|[^\d])/g);
  let result = "";
  for (const match of dates) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      result = match[3] + "-" + String(month).padStart(2, "0");
    }
  }
  return result;
}


/**
 * Giorno di riferimento per i filtri calendario di ATTIVO PRODUZIONE.
 * La data viene letta sempre da NOTA_RECESSO, non dalla data di validità.
 * Una data anomala come 31/09 resta attribuita a settembre: nel filtro
 * giornaliero viene limitata al 30/09, ultimo giorno effettivo del mese.
 */
export function recessReferenceDate(raw: Record<string, unknown> | null | undefined): string {
  const note = recessNoteText(raw);
  if (!note) return "";
  const dates = note.matchAll(/(?:^|[^\d])(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})(?=$|[^\d])/g);
  let result = "";
  for (const match of dates) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    result = match[3] + "-" + String(month).padStart(2, "0") + "-" +
      String(Math.min(day, lastDay)).padStart(2, "0");
  }
  return result;
}
