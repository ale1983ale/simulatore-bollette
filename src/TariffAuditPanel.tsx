import React, { useEffect, useState } from "react";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

type Audit = {
  checked_at: string;
  status: string;
  period: string;
  warnings: string[];
  sources: Array<{ name: string; url: string; ok: boolean; error?: string }>;
  applied_batches: number;
};
type Batch = { id: number; effective_from: string; source_url: string; state: string; approved_at: string; applied_at?: string };
const REQUIRED_TYPES = [
  "RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE",
  "BTA1", "BTA2", "BTA3", "BTA4", "BTA5", "BTA6",
  "MTA1", "MTA2", "MTA3",
];

function parseVerifiedCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV senza dati");
  const fields = lines[0].includes(";") ? ";" : "\t";
  const headers = lines[0].split(fields).map((v) => v.trim().toLowerCase().replace(/[\s_-]/g, ""));
  const required = ["tipo", "quotafissaannua", "quotapotenzaannua", "quotaenergia"];
  if (!required.every((key) => headers.includes(key))) {
    throw new Error("Intestazioni richieste: tipo; quotaFissaAnnua; quotaPotenzaAnnua; quotaEnergia");
  }
  const parsed = lines.slice(1).map((line) => {
    const values = line.split(fields).map((v) => v.trim());
    const get = (field: string) => values[headers.indexOf(field)];
    const n = (value: string) => {
      const cleaned = value.replace(/\s/g, "").replace(/€/g, "");
      return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
    };
    return {
      tipo: String(get("tipo") || "").toUpperCase(),
      quotaFissaAnnua: n(get("quotafissaannua")),
      quotaPotenzaAnnua: n(get("quotapotenzaannua")),
      quotaEnergia: n(get("quotaenergia")),
    };
  });
  const codes = new Set(parsed.map((item) => item.tipo));
  if (
    parsed.length !== REQUIRED_TYPES.length || codes.size !== REQUIRED_TYPES.length ||
    !REQUIRED_TYPES.every((tipo) => codes.has(tipo)) ||
    parsed.some((item) => ![item.quotaFissaAnnua, item.quotaPotenzaAnnua, item.quotaEnergia].every(Number.isFinite))
  ) throw new Error("Il file deve contenere tutte e sole le 12 tipologie, senza duplicati o valori mancanti");
  return parsed;
}

export default function TariffAuditPanel({ onRatesUpdated }: { onRatesUpdated: () => Promise<void> }) {
  const [latest, setLatest] = useState<Audit | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [csv, setCsv] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const callApi = async (action: string, additional: Record<string, unknown> = {}) => {
    const saved = JSON.parse(localStorage.getItem("admin_session") || "{}");
    if (!saved?.token) throw new Error("Effettua nuovamente l'accesso come Super Admin");
    const response = await fetch(supabaseUrl + "/functions/v1/network-tariff-audit", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: supabaseAnonKey,
        Authorization: "Bearer " + supabaseAnonKey },
      body: JSON.stringify({ action, admin_session_token: saved.token, ...additional }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "Servizio controllo non disponibile");
    return result;
  };

  const loadStatus = async () => {
    try {
      const result = await callApi("status");
      setLatest(result.latest);
      setBatches(Array.isArray(result.batches) ? result.batches : []);
    } catch (e: any) { setNotice("Verifica stato non disponibile: " + (e?.message || e)); }
  };

  useEffect(() => { void loadStatus(); }, []);

  const runCheck = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await callApi("check");
      setNotice(result.warnings?.length
        ? "Controllo concluso: alcune componenti richiedono verifica prima della sostituzione."
        : "Controllo concluso senza anomalie.");
      await loadStatus();
      await onRatesUpdated();
    } catch (e: any) { setNotice("Errore controllo ARERA: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const approveCsv = async () => {
    setBusy(true); setNotice("");
    try {
      if (!confirmed) throw new Error("Conferma prima che il prospetto sia stato confrontato con ARERA");
      const rows = parseVerifiedCsv(csv);
      if (!window.confirm(
        "Approvare i valori tariffari per TUTTE le 12 tipologie dal " + effectiveFrom +
        "?\nSaranno applicati automaticamente ai tre mesi del trimestre quando l'Autorità pubblica i riferimenti ufficiali. Confermi?"
      )) return;
      const result = await callApi("approve_batch", {
        effective_from: effectiveFrom, source_url: sourceUrl, rows,
      });
      setNotice(result.message || "Prospetto approvato.");
      setConfirmed(false);
      await loadStatus();
      await runCheck();
    } catch (e: any) { setNotice("Approvazione non riuscita: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const card: React.CSSProperties = {
    background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 12,
    padding: 14, fontSize: 13,
  };
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <strong style={{ fontSize: 16 }}>CONTROLLO AUTOMATICO TARIFFE ARERA</strong>
          <div style={{ color: "#475569", marginTop: 5 }}>
            Verifica quotidiana su fonti ufficiali, storico e applicazione dei soli prospetti completi approvati.
          </div>
        </div>
        <button type="button" disabled={busy} onClick={() => void runCheck()}
          style={{ background: "#0f2d69", color: "white", border: 0, borderRadius: 9,
            padding: "10px 15px", cursor: "pointer", fontWeight: 850 }}>
          {busy ? "VERIFICA IN CORSO..." : "VERIFICA ORA"}
        </button>
      </div>
      <div style={{ marginTop: 10, fontWeight: 750, color: latest?.status === "verified_sources" ? "#166534" : "#9a3412" }}>
        Stato: {latest?.status === "verified_sources" ? "FONTI RAGGIUNGIBILI"
          : latest?.status === "source_error" ? "ERRORE FONTI" : "VERIFICA TARIFFE NECESSARIA"}
        {" · "}Ultimo controllo: {latest?.checked_at
          ? new Date(latest.checked_at).toLocaleString("it-IT") : "nessun controllo registrato"}
        {" · "}Periodo: {latest?.period || "—"}
      </div>
      {(latest?.warnings || []).length > 0 && (
        <div style={{ color: "#9a3412", marginTop: 7 }}>
          {(latest?.warnings || []).map((warning, i) => <div key={i}>⚠ {warning}</div>)}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {(latest?.sources || []).map((s) => (
          <a href={s.url} target="_blank" rel="noreferrer" key={s.url}
            style={{ color: s.ok ? "#166534" : "#b91c1c", fontWeight: 750 }}>
            {s.ok ? "✓ " : "✗ "}{s.name}
          </a>
        ))}
      </div>
      <div style={{ marginTop: 12, color: "#475569" }}>
        <strong>Protezione:</strong> un collegamento ARERA raggiungibile non dimostra che tutti i valori siano
        corretti. Senza un prospetto numerico completo approvato, le tariffe non vengono sostituite automaticamente.
      </div>
      <details style={{ marginTop: 14, borderTop: "1px solid #cbd5e1", paddingTop: 12 }}>
        <summary style={{ fontWeight: 900, cursor: "pointer" }}>APPROVA NUOVO PROSPETTO TRIMESTRALE (SUPER ADMIN)</summary>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <label>Decorrenza (primo giorno del trimestre)
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
              style={{ display: "block", padding: 8, borderRadius: 8, border: "1px solid #cbd5e1" }} />
          </label>
          <label>Link della delibera o dell'allegato ufficiale ARERA
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.arera.it/..." style={{ display: "block", width: "100%", boxSizing: "border-box",
                padding: 9, borderRadius: 8, border: "1px solid #cbd5e1" }} />
          </label>
          <label>Prospetto verificato CSV (separatore ;), 12 tipologie, colonne tipo;quotaFissaAnnua;quotaPotenzaAnnua;quotaEnergia
            <input type="file" accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void file.text().then(setCsv).catch(() => setNotice("Impossibile leggere il file"));
              }} style={{ display: "block", marginTop: 6 }} />
          </label>
          <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Ho confrontato i 12 valori con la fonte ufficiale e approvo la loro attivazione.
          </label>
          <div>
            <button type="button" disabled={busy || !confirmed || !csv || !effectiveFrom || !sourceUrl}
              onClick={() => void approveCsv()} style={{ padding: "9px 13px", color: "white",
                background: "#166534", border: 0, borderRadius: 8, fontWeight: 850 }}>
              APPROVA E PROGRAMMA APPLICAZIONE
            </button>
          </div>
        </div>
      </details>
      {batches.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong>Prospetti approvati:</strong>
          {batches.map((b) => (
            <div key={b.id} style={{ marginTop: 5 }}>
              {b.effective_from} · {b.state === "applied" ? "APPLICATO" : "IN ATTESA"}
              {" · "}<a href={b.source_url} target="_blank" rel="noreferrer">Fonte ARERA</a>
            </div>
          ))}
        </div>
      )}
      {notice && <div role="status" style={{ marginTop: 10, fontWeight: 800, color: "#0f2d69" }}>{notice}</div>}
    </div>
  );
}
