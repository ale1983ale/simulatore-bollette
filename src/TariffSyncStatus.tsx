import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";

type SyncRow = {
  category: string;
  checked_at: string;
  status: string;
  changed_rows: number;
  verified_rows: number;
  warnings: string[];
};
const names: Record<string, string> = {
  disp_capacity: "DISPACCIAMENTO / CAPACITY",
  electric_network: "RETE E ONERI ENERGIA",
  gas_network: "RETE E ONERI GAS",
};

export default function TariffSyncStatus() {
  const [latest, setLatest] = useState<Record<string, SyncRow>>({});
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const { data, error } = await supabase
        .from("tariff_sync_runs")
        .select("category,checked_at,status,changed_rows,verified_rows,warnings")
        .order("checked_at", { ascending: false }).limit(30);
      if (!live) return;
      if (error) {
        setLoadError("Impossibile leggere lo storico dei controlli automatici.");
        return;
      }
      setLoadError("");
      const out: Record<string, SyncRow> = {};
      for (const row of data || []) {
        const key = String(row.category || "");
        if (!out[key]) out[key] = row as SyncRow;
      }
      setLatest(out);
    };
    const onFocus = () => { void refresh(); };
    void refresh();
    const interval = window.setInterval(refresh, 90000);
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <div style={{
      border: "1px solid #bfdbfe", background: "#f8fafc",
      padding: 14, borderRadius: 12, marginBottom: 12,
    }}>
      <strong style={{ fontSize: 15 }}>SINCRONIZZAZIONE AUTOMATICA TARIFFE</strong>
      <div style={{ fontSize: 12, color: "#475569", marginTop: 5 }}>
        Controllo server ogni giorno alle 07:30 (ora italiana in inverno; 08:30 in estate).
        Non è necessario lasciare la webapp aperta. I valori numerici si sostituiscono
        solo se la fonte consente un'estrazione completa e affidabile.
      </div>
      {loadError && <div style={{ color: "#b91c1c" }}>{loadError}</div>}
      <div style={{ display: "grid", gap: 8, marginTop: 10,
        gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))" }}>
        {Object.entries(names).map(([key, title]) => {
          const row = latest[key];
          const status = row?.status || "not_run";
          const state = status === "updated"
            ? "NUOVI VALORI APPLICATI"
            : status === "no_change"
              ? "VALORI VERIFICATI, INVARIATI"
              : status === "partial"
                ? "AGGIORNAMENTO PARZIALE"
                : status === "error"
                  ? "CONTROLLO NON RIUSCITO"
                  : status === "blocked"
                    ? "DATI DA VERIFICARE"
                    : "IN ATTESA PRIMO CONTROLLO";
          return (
            <div key={key} style={{
              border: "1px solid #dbe4f0", borderRadius: 9,
              padding: 10, background: "white",
            }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#0f2d69" }}>{title}</div>
              <div style={{ marginTop: 4, fontWeight: 850, fontSize: 12,
                color: ["updated","no_change"].includes(status) ? "#166534" : "#92400e" }}>
                {state}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {row?.checked_at ? new Date(row.checked_at).toLocaleString("it-IT") : "—"}
                {Number(row?.changed_rows) > 0 ? " · "+row.changed_rows+" variazioni" : ""}
              </div>
              {(row?.warnings || []).length > 0 && (
                <details style={{ marginTop: 5, fontSize: 11, color: "#92400e" }}>
                  <summary style={{ cursor: "pointer" }}>Motivi e fonti da verificare</summary>
                  {(row.warnings || []).slice(0, 6).map((warning, i) =>
                    <div key={i} style={{ marginTop: 3 }}>• {warning}</div>)}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
