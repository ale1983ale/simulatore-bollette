import React, { useEffect, useMemo, useState } from "react";
import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import * as XLSX from "xlsx";

const CLIENT_ID = "08e21359-7cea-459e-9d77-d6989a526617";
const TENANT_ID = "8df47ce5-b3b7-4fca-990c-431dd15b188b";
const SCOPES = ["User.Read", "Mail.ReadWrite"];

const msal = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: `${window.location.origin}/`,
  },
  cache: {
    cacheLocation: "localStorage",
  },
});

type AgentRow = {
  agenzia: string;
  email: string;
  allegato: string;
};

type DraftResult = {
  agenzia: string;
  ok: boolean;
  message: string;
};

const normalize = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function OutlookEmail() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Buongiorno,\n\nin allegato trasmetto il file di competenza.\n\nCordiali saluti");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await msal.initialize();
        await msal.handleRedirectPromise();
        const first = msal.getAllAccounts()[0] || null;
        if (mounted) setAccount(first);
      } catch (error: any) {
        if (mounted) setNotice(`Errore inizializzazione Outlook: ${error?.message || error}`);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const fileMap = useMemo(() => {
    const map = new Map<string, File>();
    files.forEach((file) => map.set(normalize(file.name), file));
    return map;
  }, [files]);

  const matched = useMemo(
    () =>
      agents.map((agent) => {
        const exact = fileMap.get(normalize(agent.allegato));
        if (exact) return { ...agent, file: exact };

        const byAgency = files.find((file) => normalize(file.name).includes(normalize(agent.agenzia)));
        return { ...agent, file: byAgency || null };
      }),
    [agents, files, fileMap]
  );

  const connect = async () => {
    setNotice("");
    try {
      const response = await msal.loginPopup({ scopes: SCOPES, prompt: "select_account" });
      setAccount(response.account);
      setNotice("Outlook collegato correttamente.");
    } catch (error: any) {
      setNotice(`Collegamento non riuscito: ${error?.message || error}`);
    }
  };

  const disconnect = async () => {
    try {
      if (account) await msal.logoutPopup({ account });
    } finally {
      setAccount(null);
    }
  };

  const importExcel = async (file?: File) => {
    if (!file) return;
    setNotice("");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = rows
        .map((row) => ({
          agenzia: String(row.AGENZIA ?? row.Agenzia ?? row.agenzia ?? "").trim(),
          email: String(row.EMAIL ?? row.Email ?? row.email ?? "").trim(),
          allegato: String(row.ALLEGATO ?? row.Allegato ?? row.allegato ?? "").trim(),
        }))
        .filter((row) => row.agenzia || row.email || row.allegato);

      if (!parsed.length) {
        setNotice("Non ho trovato righe valide. Il file deve avere le colonne AGENZIA, EMAIL e ALLEGATO.");
        return;
      }
      setAgents(parsed);
      setResults([]);
      setNotice(`Importati ${parsed.length} destinatari.`);
    } catch (error: any) {
      setNotice(`Errore nella lettura dell'Excel: ${error?.message || error}`);
    }
  };

  const getToken = async () => {
    const current = account || msal.getAllAccounts()[0];
    if (!current) throw new Error("Collega prima Outlook.");
    try {
      const response = await msal.acquireTokenSilent({ scopes: SCOPES, account: current });
      return response.accessToken;
    } catch {
      const response = await msal.acquireTokenPopup({ scopes: SCOPES, account: current });
      return response.accessToken;
    }
  };

  const createDrafts = async () => {
    setResults([]);
    setNotice("");

    if (!agents.length) {
      setNotice("Carica prima l'Excel con AGENZIA, EMAIL e ALLEGATO.");
      return;
    }
    if (!subject.trim()) {
      setNotice("Inserisci l'oggetto della mail.");
      return;
    }
    const invalid = matched.filter((row) => !row.email || !row.file);
    if (invalid.length) {
      setNotice(`Mancano email o allegati per ${invalid.length} righe. Correggile prima di creare le bozze.`);
      return;
    }

    setBusy(true);
    try {
      const token = await getToken();
      const output: DraftResult[] = [];

      for (const row of matched) {
        try {
          const file = row.file as File;
          const contentBytes = await fileToBase64(file);
          const response = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subject: subject.trim(),
              body: {
                contentType: "Text",
                content: body,
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: row.email,
                  },
                },
              ],
              attachments: [
                {
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: file.name,
                  contentType: file.type || "application/octet-stream",
                  contentBytes,
                },
              ],
            }),
          });

          if (!response.ok) {
            const details = await response.text();
            throw new Error(`${response.status} ${details}`);
          }
          output.push({ agenzia: row.agenzia, ok: true, message: "Bozza creata" });
        } catch (error: any) {
          output.push({ agenzia: row.agenzia, ok: false, message: error?.message || String(error) });
        }
        setResults([...output]);
      }

      const okCount = output.filter((item) => item.ok).length;
      setNotice(`Operazione completata: ${okCount} bozze create su ${output.length}. Nessuna mail è stata inviata.`);
    } catch (error: any) {
      setNotice(`Errore Outlook: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 10px 30px rgba(15,23,42,.08)",
  };

  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    background: "white",
  };

  const button: React.CSSProperties = {
    border: 0,
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 9998,
          ...button,
          background: "#2563eb",
          color: "white",
          boxShadow: "0 8px 25px rgba(37,99,235,.35)",
        }}
      >
        ✉️ Invio Email
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#f8fafc",
            overflow: "auto",
            color: "#0f172a",
          }}
        >
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 18 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 26 }}>Invio Email Outlook</h1>
                <div style={{ color: "#64748b", marginTop: 4 }}>Prepara bozze separate con allegato corretto per ogni agente.</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ ...button, background: "#e2e8f0" }}>Chiudi</button>
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <strong>1. Outlook</strong>
                  <div style={{ color: "#64748b", marginTop: 4 }}>
                    {account ? `Collegato: ${account.username}` : ready ? "Non collegato" : "Inizializzazione..."}
                  </div>
                </div>
                {account ? (
                  <button onClick={disconnect} style={{ ...button, background: "#fee2e2", color: "#991b1b" }}>Scollega Outlook</button>
                ) : (
                  <button disabled={!ready} onClick={connect} style={{ ...button, background: "#2563eb", color: "white", opacity: ready ? 1 : .6 }}>Collega Outlook</button>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginBottom: 16 }}>
              <div style={card}>
                <strong>2. Elenco destinatari</strong>
                <p style={{ color: "#64748b", fontSize: 14 }}>Carica il modello Excel con le colonne AGENZIA, EMAIL e ALLEGATO.</p>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => importExcel(e.target.files?.[0])} />
                <div style={{ marginTop: 10, fontWeight: 700 }}>{agents.length} destinatari caricati</div>
              </div>

              <div style={card}>
                <strong>3. Allegati</strong>
                <p style={{ color: "#64748b", fontSize: 14 }}>Seleziona contemporaneamente tutti i file destinati agli agenti.</p>
                <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                <div style={{ marginTop: 10, fontWeight: 700 }}>{files.length} file caricati</div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <strong>4. Messaggio</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <input style={field} placeholder="Oggetto" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <textarea style={{ ...field, minHeight: 150, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>

            {!!agents.length && (
              <div style={{ ...card, marginBottom: 16, overflowX: "auto" }}>
                <strong>5. Controllo abbinamenti</strong>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: 8 }}>Agenzia</th>
                      <th style={{ padding: 8 }}>Email</th>
                      <th style={{ padding: 8 }}>Allegato previsto</th>
                      <th style={{ padding: 8 }}>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((row, index) => (
                      <tr key={`${row.agenzia}-${index}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 8 }}>{row.agenzia || "—"}</td>
                        <td style={{ padding: 8 }}>{row.email || "—"}</td>
                        <td style={{ padding: 8 }}>{row.allegato || "—"}</td>
                        <td style={{ padding: 8, fontWeight: 700, color: row.email && row.file ? "#15803d" : "#b91c1c" }}>
                          {row.email && row.file ? `✓ ${row.file.name}` : !row.email ? "Email mancante" : "Allegato non trovato"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {notice && (
              <div style={{ ...card, marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe" }}>{notice}</div>
            )}

            {!!results.length && (
              <div style={{ ...card, marginBottom: 16 }}>
                <strong>Risultato</strong>
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {results.map((item, index) => (
                    <div key={`${item.agenzia}-${index}`} style={{ color: item.ok ? "#15803d" : "#b91c1c" }}>
                      {item.ok ? "✓" : "✗"} {item.agenzia}: {item.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 30 }}>
              <button onClick={() => { setResults([]); setNotice(""); }} style={{ ...button, background: "#e2e8f0" }}>Pulisci messaggi</button>
              <button
                disabled={busy || !account}
                onClick={createDrafts}
                style={{ ...button, background: "#16a34a", color: "white", opacity: busy || !account ? .55 : 1 }}
              >
                {busy ? "Creazione bozze..." : "Crea bozze Outlook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
