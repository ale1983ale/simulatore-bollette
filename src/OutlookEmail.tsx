import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import * as XLSX from "xlsx";

type AgentRow = {
  agenzia: string;
  email: string;
  allegato: string;
};

type PreparedRow = AgentRow & {
  file: File | null;
};

const normalize = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const sanitizeFileName = (value: string) =>
  String(value || "email")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "email";

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const utf8ToBase64 = (value: string) =>
  bytesToBase64(new TextEncoder().encode(value));

const wrapBase64 = (value: string) => value.match(/.{1,76}/g)?.join("\r\n") || "";

const encodeHeader = (value: string) => `=?UTF-8?B?${utf8ToBase64(value)}?=`;

const encodeRfc5987 = (value: string) =>
  encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");

async function buildEml(row: PreparedRow, subject: string, body: string) {
  if (!row.file) throw new Error("Allegato mancante");

  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const attachmentBytes = new Uint8Array(await row.file.arrayBuffer());
  const attachmentBase64 = wrapBase64(bytesToBase64(attachmentBytes));
  const bodyBase64 = wrapBase64(utf8ToBase64(body));
  const encodedName = encodeRfc5987(row.file.name);

  return [
    "X-Unsent: 1",
    `To: ${row.email}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyBase64,
    "",
    `--${boundary}`,
    `Content-Type: ${row.file.type || "application/octet-stream"}; name*=UTF-8''${encodedName}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename*=UTF-8''${encodedName}`,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function OutlookEmail() {
  const [open, setOpen] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    "Buongiorno,\n\nin allegato trasmetto il file di competenza.\n\nCordiali saluti"
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let host: HTMLElement | null = null;

    const placeInAdminToolbar = () => {
      const reportAdminButton = Array.from(document.querySelectorAll("button")).find(
        (node) =>
          node.textContent?.trim() === "Report Admin" &&
          (node as HTMLElement).offsetParent !== null
      ) as HTMLElement | undefined;

      if (!reportAdminButton?.parentElement) {
        if (host?.isConnected) host.remove();
        host = null;
        setPortalHost(null);
        setOpen(false);
        return;
      }

      if (!host || !host.isConnected) {
        host = document.createElement("span");
        host.setAttribute("data-outlook-email-admin-slot", "true");
        host.style.display = "contents";
      }

      if (
        host.parentElement !== reportAdminButton.parentElement ||
        host.nextSibling !== reportAdminButton
      ) {
        reportAdminButton.parentElement.insertBefore(host, reportAdminButton);
      }

      setPortalHost(host);
    };

    placeInAdminToolbar();

    const observer = new MutationObserver(placeInAdminToolbar);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const timer = window.setInterval(placeInAdminToolbar, 750);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (host?.isConnected) host.remove();
    };
  }, []);

  const fileMap = useMemo(() => {
    const map = new Map<string, File>();
    files.forEach((file) => map.set(normalize(file.name), file));
    return map;
  }, [files]);

  const matched = useMemo<PreparedRow[]>(
    () =>
      agents.map((agent) => {
        const exact = fileMap.get(normalize(agent.allegato));
        if (exact) return { ...agent, file: exact };

        const agencyKey = normalize(agent.agenzia);
        const byAgency = agencyKey
          ? files.find((file) => normalize(file.name).includes(agencyKey))
          : undefined;

        return { ...agent, file: byAgency || null };
      }),
    [agents, files, fileMap]
  );

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
      setNotice(`Importati ${parsed.length} destinatari.`);
    } catch (error: any) {
      setNotice(`Errore nella lettura dell'Excel: ${error?.message || error}`);
    }
  };

  const createLocalDrafts = async () => {
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
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (let index = 0; index < matched.length; index += 1) {
        const row = matched[index];
        const eml = await buildEml(row, subject.trim(), body);
        const baseName = sanitizeFileName(row.agenzia || `email-${index + 1}`);
        let fileName = `${baseName}.eml`;
        let suffix = 2;
        while (usedNames.has(fileName.toLowerCase())) {
          fileName = `${baseName}-${suffix}.eml`;
          suffix += 1;
        }
        usedNames.add(fileName.toLowerCase());
        zip.file(fileName, eml);
      }

      zip.file(
        "LEGGIMI.txt",
        [
          "BOZZE EMAIL PER OUTLOOK",
          "",
          "1. Estrai questo file ZIP in una cartella del PC.",
          "2. Fai doppio clic su ciascun file .eml.",
          "3. Outlook dovrebbe aprirlo come messaggio non inviato, gia compilato con destinatario, oggetto, testo e allegato.",
          "4. Controlla il contenuto e premi Invia manualmente.",
          "",
          "Nessuna password Outlook e nessuna autorizzazione Microsoft sono state usate per generare questi file.",
        ].join("\r\n")
      );

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `BOZZE_EMAIL_${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(
        `Create ${matched.length} email .eml. Ho scaricato un unico ZIP: estrailo e apri i file con Outlook. Nessuna mail e stata inviata.`
      );
    } catch (error: any) {
      setNotice(`Errore nella creazione delle email: ${error?.message || error}`);
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
      {portalHost &&
        createPortal(
          <button
            onClick={() => setOpen(true)}
            style={{
              ...button,
              background: "#2563eb",
              color: "white",
              marginRight: 8,
            }}
          >
            ✉️ Invio Email
          </button>,
          portalHost
        )}

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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <h1 style={{ margin: 0, fontSize: 26 }}>Invio Email Outlook</h1>
                <div style={{ color: "#64748b", marginTop: 4 }}>
                  Prepara le email sul PC senza collegare Outlook e senza autorizzazioni aziendali.
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ ...button, background: "#e2e8f0" }}>
                Chiudi
              </button>
            </div>

            <div style={{ ...card, marginBottom: 16, background: "#ecfdf5", borderColor: "#a7f3d0" }}>
              <strong>✓ Nessun collegamento Microsoft richiesto</strong>
              <div style={{ marginTop: 6, color: "#475569" }}>
                La webapp lavora solo sui file che selezioni nel browser e genera un pacchetto ZIP di email .eml. Non accede alla tua casella Outlook e non invia nulla.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div style={card}>
                <strong>1. Elenco destinatari</strong>
                <p style={{ color: "#64748b", fontSize: 14 }}>
                  Carica il modello Excel con le colonne AGENZIA, EMAIL e ALLEGATO.
                </p>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => importExcel(e.target.files?.[0])} />
                <div style={{ marginTop: 10, fontWeight: 700 }}>{agents.length} destinatari caricati</div>
              </div>

              <div style={card}>
                <strong>2. Allegati</strong>
                <p style={{ color: "#64748b", fontSize: 14 }}>
                  Seleziona contemporaneamente tutti i file destinati agli agenti.
                </p>
                <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                <div style={{ marginTop: 10, fontWeight: 700 }}>{files.length} file caricati</div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <strong>3. Messaggio</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <input
                  style={field}
                  placeholder="Oggetto"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <textarea
                  style={{ ...field, minHeight: 150, resize: "vertical" }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            </div>

            {!!agents.length && (
              <div style={{ ...card, marginBottom: 16, overflowX: "auto" }}>
                <strong>4. Controllo abbinamenti</strong>
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
                        <td
                          style={{
                            padding: 8,
                            fontWeight: 700,
                            color: row.email && row.file ? "#15803d" : "#b91c1c",
                          }}
                        >
                          {row.email && row.file
                            ? `✓ ${row.file.name}`
                            : !row.email
                              ? "Email mancante"
                              : "Allegato non trovato"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {notice && (
              <div style={{ ...card, marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe" }}>
                {notice}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 30 }}>
              <button
                onClick={() => {
                  setSubject("");
                  setBody("");
                  setNotice("");
                }}
                style={{ ...button, background: "#e2e8f0" }}
              >
                Pulisci messaggio
              </button>
              <button
                disabled={busy || !agents.length}
                onClick={createLocalDrafts}
                style={{
                  ...button,
                  background: "#16a34a",
                  color: "white",
                  opacity: busy || !agents.length ? 0.55 : 1,
                }}
              >
                {busy ? "Creo il pacchetto..." : "Scarica bozze Outlook (.zip)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
