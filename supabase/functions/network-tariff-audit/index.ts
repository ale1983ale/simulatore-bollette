import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DB_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(DB_URL, SERVICE_KEY, { auth: { persistSession: false } });
const HEADERS = {
  "Access-Control-Allow-Origin": "https://simulatore-bollette.vercel.app",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(
  JSON.stringify(body), { status, headers: HEADERS }
);
const MONTHS = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const TYPES = ["RESIDENTE","NON RESIDENTE","RESIDENTE CANONE ESENTE",
  "BTA1","BTA2","BTA3","BTA4","BTA5","BTA6","MTA1","MTA2","MTA3"];
const OFFICIAL_SOURCES = [
  {
    name: "ARERA oneri ASOS/ARIM, UC3/UC6",
    url: "https://www.arera.it/area-operatori/prezzi-e-tariffe/oneri-generali-di-sistema-e-ulteriori-componenti",
    pattern: /oneri generali di sistema/i,
  },
  {
    name: "ARERA tariffa trasmissione",
    url: "https://www.arera.it/area-operatori/prezzi-e-tariffe/tariffa-per-il-servizio-di-trasmissione",
    pattern: /tariffa per il servizio di trasmissione/i,
  },
  {
    name: "ARERA tariffe distribuzione",
    url: "https://www.arera.it/area-operatori/prezzi-e-tariffe/distr",
    pattern: /tariffe di distribuzione/i,
  },
  {
    name: "ARERA tariffa misura",
    url: "https://www.arera.it/area-operatori/prezzi-e-tariffe/tariffa-per-il-servizio-di-misura",
    pattern: /tariffa per il servizio di misura/i,
  },
];

async function fetchOfficial(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["arera.it","www.arera.it"].includes(parsed.hostname)) {
    throw new Error("Sono accettate solo fonti ufficiali ARERA");
  }
  const result = await fetch(parsed.toString(), {
    headers: { Accept: "text/html,application/pdf" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  const destination = new URL(result.url);
  if (!["www.arera.it","arera.it"].includes(destination.hostname)) {
    throw new Error("Reindirizzamento esterno non attendibile");
  }
  if (!result.ok) throw new Error("Fonte HTTP " + result.status);
  const contentType = result.headers.get("content-type") || "";
  if (!/text\/html|application\/pdf|octet-stream/i.test(contentType)) {
    throw new Error("Formato fonte non previsto");
  }
  if (/html/i.test(contentType)) {
    const html = await result.text();
    if (html.length < 1000) throw new Error("Documento HTML incompleto");
    return { type: "html", text: html };
  }
  return { type: "document", text: "" };
}
async function hashToken(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function authorize(requestBody: any) {
  if (requestBody?.cron_token) {
    const { data, error } = await db.rpc("claim_network_tariff_audit_token", {
      p_token: String(requestBody.cron_token),
    });
    if (error || data !== true) throw new Error("Invocazione cron non autorizzata");
    return { id: null, cron: true };
  }
  const token = String(requestBody?.admin_session_token || "");
  if (!token) throw new Error("Sessione admin mancante");
  const { data: session, error } = await db.from("admin_sessions")
    .select("admin_id").eq("token_hash", await hashToken(token))
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !session?.admin_id) throw new Error("Sessione admin non valida");
  const { data: admin } = await db.from("admin_users")
    .select("id,role").eq("id", session.admin_id).maybeSingle();
  if (admin?.role !== "super_admin") throw new Error("Solo Super Admin");
  return { id: Number(admin.id), cron: false };
}

function validateRows(rows: any[]) {
  if (!Array.isArray(rows) || rows.length !== TYPES.length) {
    throw new Error("Il prospetto deve contenere tutte le 12 tipologie");
  }
  const unique = new Set<string>();
  return rows.map((row) => {
    const tipo = String(row?.tipo || "").trim().toUpperCase();
    if (!TYPES.includes(tipo) || unique.has(tipo)) throw new Error("Tipologia errata o duplicata: " + tipo);
    unique.add(tipo);
    const quotaFissaAnnua = Number(row?.quotaFissaAnnua);
    const quotaPotenzaAnnua = Number(row?.quotaPotenzaAnnua);
    const quotaEnergia = Number(row?.quotaEnergia);
    if (
      ![quotaFissaAnnua, quotaPotenzaAnnua, quotaEnergia].every(Number.isFinite) ||
      quotaFissaAnnua < 0 || quotaFissaAnnua > 10000 ||
      quotaPotenzaAnnua < 0 || quotaPotenzaAnnua > 1000 ||
      quotaEnergia < 0 || quotaEnergia > 0.5
    ) throw new Error("Valori fuori intervallo: " + tipo);
    return { tipo, quotaFissaAnnua, quotaPotenzaAnnua, quotaEnergia };
  });
}

function periodFromDate(date: Date) {
  const year = date.getUTCFullYear();
  const quarterIndex = Math.floor(date.getUTCMonth() / 3);
  return { year, quarterIndex, startMonth: quarterIndex * 3,
    key: year + "-Q" + (quarterIndex + 1) };
}

async function runAudit() {
  const checkedAt = new Date().toISOString();
  const now = new Date();
  const period = periodFromDate(now);
  const sources = await Promise.all(OFFICIAL_SOURCES.map(async (item) => {
    try {
      const page = await fetchOfficial(item.url);
      if (page.type !== "html" || !item.pattern.test(page.text.replace(/<[^>]*>/g, " "))) {
        throw new Error("Titolo o struttura del documento non riconosciuti");
      }
      return { name: item.name, url: item.url, ok: true, body: page.text };
    } catch (error) {
      return { name: item.name, url: item.url, ok: false, error: String(error) };
    }
  }));
  const warnings: string[] = [];
  const allSourcesReachable = sources.every((source) => source.ok);
  if (!allSourcesReachable) warnings.push("Uno o più riferimenti ARERA non sono raggiungibili: aggiornamento bloccato.");

  const oneri = sources[0].body || "";
  const yy = String(period.year).slice(2);
  const mm = String(period.startMonth + 1).padStart(2, "0");
  const periodMarker = new RegExp("0?1[.\\/\\s-]+" + mm + "[.\\/\\s-]+" + yy, "i");
  const normalizedOneri = oneri.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const markerPresent = periodMarker.test(normalizedOneri);
  if (!markerPresent) warnings.push("La pubblicazione ARERA per " + period.key + " non è stata riconosciuta: conferma manuale necessaria.");

  const [{ data: pending, error: pendingError }, { data: allBatches, error: batchesError }] = await Promise.all([
    db.from("network_tariff_approved_batches").select("*").eq("state", "approved")
      .lte("effective_from", now.toISOString().slice(0, 10)),
    db.from("network_tariff_approved_batches").select("effective_from,state")
      .gte("effective_from", new Date(Date.UTC(period.year, period.startMonth, 1)).toISOString().slice(0, 10))
      .lte("effective_from", new Date(Date.UTC(period.year, period.startMonth + 1, 1)).toISOString().slice(0, 10)),
  ]);
  if (pendingError || batchesError) throw (pendingError || batchesError);

  let applied = 0;
  for (const batch of pending || []) {
    const periodOfBatch = periodFromDate(new Date(batch.effective_from + "T00:00:00Z"));
    if (!allSourcesReachable || !markerPresent || periodOfBatch.key !== period.key) {
      warnings.push("Bloccata attivazione prospetto " + batch.effective_from + ": periodo o fonti non verificati.");
      continue;
    }
    try {
      const verified = await fetchOfficial(String(batch.source_url));
      if (verified.type !== "html" && verified.type !== "document") throw new Error("Fonte non valida");
      const values = validateRows(batch.rows);
      const updates = values.flatMap((row) =>
        Array.from({ length: 3 }, (_, index) => ({
          mese: MONTHS[periodOfBatch.startMonth + index] + " " + periodOfBatch.year,
          tipo: row.tipo,
          quota_fissa_annua: row.quotaFissaAnnua,
          quota_potenza_annua: row.quotaPotenzaAnnua,
          quota_energia: row.quotaEnergia,
          approved_at: batch.approved_at,
          checked_at: checkedAt,
          source_url: batch.source_url,
          batch_id: batch.id,
        }))
      );
      const { error } = await db.from("network_tariff_verified_overrides")
        .upsert(updates, { onConflict: "mese,tipo" });
      if (error) throw error;
      const { error: stateError } = await db.from("network_tariff_approved_batches")
        .update({ state: "applied", applied_at: checkedAt }).eq("id", batch.id)
        .eq("state", "approved");
      if (stateError) throw stateError;
      applied++;
    } catch (error) {
      warnings.push("Prospetto " + batch.effective_from + " non applicato: " + String(error));
    }
  }
  if (!(allBatches || []).some((batch) => batch.state === "approved" || batch.state === "applied")) {
    warnings.push("Nessun prospetto numerico completo approvato per " + period.key +
      ". Manteniamo i valori storici, senza dichiararli automaticamente verificati.");
  }
  const status = !allSourcesReachable ? "source_error" : warnings.length ? "attention" : "verified_sources";
  const { error: auditError } = await db.from("network_tariff_audit_log").insert({
    checked_at: checkedAt, status, period: period.key,
    warnings, applied_batches: applied,
    sources: sources.map(({ name, url, ok, error }) => ({ name, url, ok, error: error || "" })),
  });
  if (auditError) throw auditError;
  return { status, period: period.key, checkedAt, warnings, applied_batches: applied,
    sources: sources.map(({ name, url, ok, error }) => ({ name, url, ok, error: error || "" })) };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: HEADERS });
  if (request.method !== "POST") return json({ ok: false, error: "Metodo non ammesso" }, 405);
  try {
    const body = await request.json();
    const auth = await authorize(body);
    const action = String(body.action || "check");
    if (action === "status") {
      const [{ data: latest }, { data: recent }, { data: batches }] = await Promise.all([
        db.from("network_tariff_audit_log").select("*").order("checked_at", { ascending: false }).limit(1),
        db.from("network_tariff_audit_log").select("id,checked_at,status,period,warnings,applied_batches")
          .order("checked_at", { ascending: false }).limit(12),
        db.from("network_tariff_approved_batches").select("id,effective_from,source_url,state,approved_at,applied_at")
          .order("effective_from", { ascending: false }).limit(8),
      ]);
      return json({ ok: true, latest: latest?.[0] || null, recent: recent || [], batches: batches || [] });
    }
    if (action === "approve_batch") {
      if (auth.cron || !auth.id) return json({ ok: false, error: "Operazione riservata a Super Admin" }, 403);
      const date = String(body.effective_from || "");
      if (!/^\d{4}-(01|04|07|10)-01$/.test(date)) {
        return json({ ok: false, error: "Usa il primo giorno di un trimestre: YYYY-01/04/07/10-01" }, 400);
      }
      const sourceUrl = String(body.source_url || "").trim();
      const checked = await fetchOfficial(sourceUrl);
      if (!checked) throw new Error("Documento ARERA non raggiungibile");
      const rows = validateRows(body.rows);
      const { data: prior } = await db.from("network_tariff_approved_batches")
        .select("state").eq("effective_from", date).maybeSingle();
      if (prior?.state === "applied") {
        return json({ ok: false, error: "Trimestre già applicato: non sovrascrivere senza revisione" }, 409);
      }
      const { error } = await db.from("network_tariff_approved_batches").upsert({
        effective_from: date, source_url: sourceUrl, rows,
        approved_by: auth.id, approved_at: new Date().toISOString(), state: "approved",
      }, { onConflict: "effective_from" });
      if (error) throw error;
      return json({ ok: true, message: "Prospetto approvato; applicazione automatica al controllo del trimestre." });
    }
    if (action === "check") {
      const result = await runAudit();
      return json({ ok: true, ...result });
    }
    return json({ ok: false, error: "Azione sconosciuta" }, 400);
  } catch (error) {
    console.error("NETWORK TARIFF AUDIT:", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
