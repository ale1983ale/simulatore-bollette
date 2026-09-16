import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

type AgentRow = {
  agenzia: string;
  email: string;
  allegato: string;
};

type PreparedRow = AgentRow & {
  file: File | null;
};

type AdminSession = {
  id?: number | string;
  username?: string;
  password?: string;
};

type SourceAgency = {
  key: string;
  label: string;
  fileName: string;
};

type FileMode = "single" | "separate";

const normalize = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

const stripExtension = (value: string) => String(value || "").replace(/\.[^.]+$/, "");

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
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
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

function readAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem("admin_session");
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

async function getOwnerKey() {
  const admin = readAdminSession();
  if (!admin?.id || !admin?.username) {
    throw new Error("Sessione amministratore non trovata. Esci e accedi di nuovo all'area Admin.");
  }

  const seed = `${admin.id}|${admin.username}|${admin.password || ""}|email-recipient-sync-v1`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function syncHeaders(ownerKey: string, includeJson = false) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "x-client-info": `email-recipient-sync-${ownerKey}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

function findManualFile(agent: AgentRow, files: File[]) {
  const expected = normalize(agent.allegato);
  if (expected) {
    const exact = files.find((file) => normalize(file.name) === expected);
    if (exact) return exact;
  }

  const agencyKey = normalize(agent.agenzia);
  if (!agencyKey) return null;
  return files.find((file) => normalize(stripExtension(file.name)) === agencyKey) || null;
}

function detectAgencyColumn(matrix: unknown[][], preferredHeader: string) {
  const candidates = new Set(
    [
      preferredHeader,
      "AGENZIA",
      "AGENZIA AGENTE",
      "NOME AGENZIA",
      "NOME AGENZIA/AGENTE",
      "AGENTE",
      "NOME AGENTE",
      "CONSULENTE",
    ]
      .map(normalize)
      .filter(Boolean)
  );

  const maxRows = Math.min(matrix.length, 20);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (candidates.has(normalize(String(row[colIndex] ?? "")))) {
        return { rowIndex, colIndex, label: String(row[colIndex] ?? "") };
      }
    }
  }
  return null;
}

export default function OutlookEmail() {
  const [open, setOpen] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [fileMode, setFileMode] = useState<FileMode>("single");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceAgencies, setSourceAgencies] = useState<SourceAgency[]>([]);
  const [generatedByAgency, setGeneratedByAgency] = useState<Map<string, File>>(new Map());
  const [splitWarnings, setSplitWarnings] = useState<string[]>([]);
  const [preferredAgencyHeader, setPreferredAgencyHeader] = useState("AGENZIA");
  const [splitBusy, setSplitBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    "Buongiorno,\n\nin allegato trasmetto il file di competenza.\n\nCordiali saluti"
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingRecipients, setEditingRecipients] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

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

      if (host.parentElement !== reportAdminButton.parentElement || host.nextSibling !== reportAdminButton) {
        reportAdminButton.parentElement.insertBefore(host, reportAdminButton);
      }

      setPortalHost(host);
    };

    placeInAdminToolbar();
    const observer = new MutationObserver(placeInAdminToolbar);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(placeInAdminToolbar, 750);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (host?.isConnected) host.remove();
    };
  }, []);

  const loadSavedRecipients = async (showMessage = true) => {
    setSyncBusy(true);
    try {
      const ownerKey = await getOwnerKey();
      const response = await fetch(
        `${supabaseUrl}/rest/v1/email_recipient_lists?owner_key=eq.${ownerKey}&select=recipients,updated_at&limit=1`,
        { headers: syncHeaders(ownerKey) }
      );

      if (!response.ok) {
        const details = await response.text();
        if (response.status === 404 || details.includes("email_recipient_lists")) {
          throw new Error("Archivio destinatari non ancora configurato in Supabase.");
        }
        throw new Error(details || `Errore ${response.status}`);
      }

      const rows = (await response.json()) as Array<{ recipients?: unknown; updated_at?: string }>;
      const row = rows[0];
      const saved = Array.isArray(row?.recipients) ? row.recipients : [];
      const cleaned = saved
        .map((item: any) => ({
          agenzia: String(item?.agenzia || ""),
          email: String(item?.email || ""),
          allegato: String(item?.allegato || ""),
        }))
        .filter((item) => item.agenzia || item.email || item.allegato);

      setAgents(cleaned);
      setDirty(false);
      setSavedAt(row?.updated_at || null);
      if (showMessage) {
        setNotice(
          cleaned.length
            ? `Caricati ${cleaned.length} nominativi salvati online.`
            : "Non ci sono ancora nominativi salvati online."
        );
      }
    } catch (error: any) {
      setNotice(`Salvataggio online: ${error?.message || error}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const saveRecipients = async () => {
    setSyncBusy(true);
    try {
      const ownerKey = await getOwnerKey();
      const recipients = agents.map((agent) => ({
        agenzia: agent.agenzia.trim(),
        email: agent.email.trim(),
        allegato: agent.allegato.trim(),
      }));
      const now = new Date().toISOString();

      const response = await fetch(`${supabaseUrl}/rest/v1/email_recipient_lists?on_conflict=owner_key`, {
        method: "POST",
        headers: {
          ...syncHeaders(ownerKey, true),
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ owner_key: ownerKey, recipients, updated_at: now }),
      });

      if (!response.ok) {
        const details = await response.text();
        if (response.status === 404 || details.includes("email_recipient_lists")) {
          throw new Error("Archivio destinatari non ancora configurato in Supabase.");
        }
        throw new Error(details || `Errore ${response.status}`);
      }

      setDirty(false);
      setSavedAt(now);
      setNotice(`Elenco salvato online: ${recipients.length} nominativi. Ora lo ritrovi anche dagli altri dispositivi.`);
    } catch (error: any) {
      setNotice(`Impossibile salvare l'elenco: ${error?.message || error}`);
    } finally {
      setSyncBusy(false);
    }
  };

  useEffect(() => {
    if (open) void loadSavedRecipients(false);
  }, [open]);

  const matched = useMemo<PreparedRow[]>(() => {
    return agents.map((agent) => {
      const file =
        fileMode === "single"
          ? generatedByAgency.get(normalize(agent.agenzia)) || null
          : findManualFile(agent, files);
      return { ...agent, file };
    });
  }, [agents, files, fileMode, generatedByAgency]);

  const readyRows = useMemo(() => matched.filter((row) => row.file && row.email.trim()), [matched]);
  const filesWithMissingEmail = useMemo(() => matched.filter((row) => row.file && !row.email.trim()), [matched]);

  const unassociatedSourceAgencies = useMemo(() => {
    if (fileMode !== "single") return [];
    const recipientKeys = new Set(agents.map((agent) => normalize(agent.agenzia)).filter(Boolean));
    return sourceAgencies.filter((agency) => !recipientKeys.has(agency.key));
  }, [agents, fileMode, sourceAgencies]);

  const recipientsWithoutSourceData = useMemo(() => {
    if (fileMode !== "single" || !sourceAgencies.length) return [];
    const sourceKeys = new Set(sourceAgencies.map((agency) => agency.key));
    return agents.filter((agent) => normalize(agent.agenzia) && !sourceKeys.has(normalize(agent.agenzia)));
  }, [agents, fileMode, sourceAgencies]);

  const probableSourceMatches = useMemo(() => {
    return unassociatedSourceAgencies
      .map((source) => {
        const candidate = agents.find((agent) => {
          const agentKey = normalize(agent.agenzia);
          if (!agentKey || agentKey.length < 4 || source.key.length < 4) return false;
          return agentKey.includes(source.key) || source.key.includes(agentKey);
        });
        return candidate ? `${source.label} ↔ ${candidate.agenzia}` : "";
      })
      .filter(Boolean);
  }, [agents, unassociatedSourceAgencies]);

  const unmatchedManualFiles = useMemo(() => {
    if (fileMode !== "separate") return [];
    const used = new Set(matched.flatMap((row) => (row.file ? [row.file] : [])));
    return files.filter((file) => !used.has(file));
  }, [fileMode, files, matched]);

  const importRecipientsExcel = async (file?: File) => {
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
      setDirty(true);
      setEditingRecipients(false);
      setNotice(`Importati ${parsed.length} destinatari. Premi “Salva elenco online” per ritrovarli anche sul cellulare.`);
    } catch (error: any) {
      setNotice(`Errore nella lettura dell'Excel destinatari: ${error?.message || error}`);
    }
  };

  const splitSourceWorkbook = async (file: File) => {
    setSplitBusy(true);
    setNotice("");
    setSourceFile(file);
    setFiles([]);
    setGeneratedByAgency(new Map());
    setSourceAgencies([]);
    setSplitWarnings([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const groups = new Map<string, { label: string; sheets: Map<string, unknown[][]> }>();
      const warnings: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sourceSheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, {
          header: 1,
          defval: "",
          raw: false,
        }) as unknown[][];

        if (!matrix.length) continue;
        const detected = detectAgencyColumn(matrix, preferredAgencyHeader);
        if (!detected) {
          warnings.push(`Foglio “${sheetName}” ignorato: non trovo la colonna agenzia.`);
          continue;
        }

        const prefix = matrix.slice(0, detected.rowIndex + 1).map((row) => [...row]);
        for (let rowIndex = detected.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
          const row = matrix[rowIndex] || [];
          const agencyLabel = String(row[detected.colIndex] ?? "").trim();
          const agencyKey = normalize(agencyLabel);
          if (!agencyKey) continue;

          if (!groups.has(agencyKey)) {
            groups.set(agencyKey, { label: agencyLabel, sheets: new Map() });
          }
          const group = groups.get(agencyKey)!;
          if (!group.sheets.has(sheetName)) {
            group.sheets.set(sheetName, prefix.map((prefixRow) => [...prefixRow]));
          }
          group.sheets.get(sheetName)!.push([...row]);
        }
      }

      if (!groups.size) {
        throw new Error(
          `Non ho trovato righe da dividere. Verifica che esista una colonna “${preferredAgencyHeader || "AGENZIA"}” (oppure AGENTE/NOME AGENZIA).`
        );
      }

      const generatedMap = new Map<string, File>();
      const generatedFiles: File[] = [];
      const sourceList: SourceAgency[] = [];

      for (const [agencyKey, group] of groups) {
        const outWorkbook = XLSX.utils.book_new();
        for (const [sheetName, rows] of group.sheets) {
          const outSheet = XLSX.utils.aoa_to_sheet(rows as any[][]);
          const originalSheet = workbook.Sheets[sheetName] as any;
          if (originalSheet?.["!cols"]) (outSheet as any)["!cols"] = originalSheet["!cols"];
          XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);
        }

        const rawName = sanitizeFileName(group.label || agencyKey).replace(/\.xlsx$/i, "");
        const fileName = `${rawName}.xlsx`;
        const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        const generatedFile = new File([outData], fileName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        generatedMap.set(agencyKey, generatedFile);
        generatedFiles.push(generatedFile);
        sourceList.push({ key: agencyKey, label: group.label, fileName });
      }

      sourceList.sort((a, b) => a.label.localeCompare(b.label, "it"));
      generatedFiles.sort((a, b) => a.name.localeCompare(b.name, "it"));
      setGeneratedByAgency(generatedMap);
      setFiles(generatedFiles);
      setSourceAgencies(sourceList);
      setSplitWarnings(warnings);

      const recipientKeys = new Set(agents.map((agent) => normalize(agent.agenzia)).filter(Boolean));
      const unmatched = sourceList.filter((agency) => !recipientKeys.has(agency.key));
      const sourceKeys = new Set(sourceList.map((agency) => agency.key));
      const withoutData = agents.filter(
        (agent) => normalize(agent.agenzia) && !sourceKeys.has(normalize(agent.agenzia))
      );

      const summary = `File unico diviso in ${generatedFiles.length} file, uno per agenzia.`;
      setNotice(
        unmatched.length
          ? `${summary} ATTENZIONE: ${unmatched.length} agenzie del file non sono associate a un nominativo.`
          : `${summary} Tutte le agenzie trovate sono associate.`
      );

      if (unmatched.length || warnings.length) {
        const alertLines = ["CONTROLLO ABBINAMENTI", ""];
        if (unmatched.length) {
          alertLines.push(
            `${unmatched.length} agenzie presenti nel file unico NON associate:`,
            ...unmatched.slice(0, 15).map((item) => `• ${item.label}`)
          );
          if (unmatched.length > 15) alertLines.push(`• ...e altre ${unmatched.length - 15}`);
        }
        if (warnings.length) {
          alertLines.push("", "Fogli ignorati:", ...warnings.map((item) => `• ${item}`));
        }
        if (withoutData.length) {
          alertLines.push(
            "",
            `${withoutData.length} nominativi salvati non hanno righe in questo file e non riceveranno email.`
          );
        }
        window.alert(alertLines.join("\n"));
      }
    } catch (error: any) {
      setFiles([]);
      setGeneratedByAgency(new Map());
      setSourceAgencies([]);
      setSplitWarnings([]);
      setNotice(`Errore nella divisione del file unico: ${error?.message || error}`);
    } finally {
      setSplitBusy(false);
    }
  };

  const handleSeparateFiles = (selected: File[]) => {
    setSourceFile(null);
    setSourceAgencies([]);
    setGeneratedByAgency(new Map());
    setSplitWarnings([]);
    setFiles(selected);

    const used = new Set<File>();
    agents.forEach((agent) => {
      const matchedFile = findManualFile(agent, selected);
      if (matchedFile) used.add(matchedFile);
    });
    const extras = selected.filter((file) => !used.has(file));
    if (extras.length) {
      window.alert(
        [
          "ATTENZIONE",
          "",
          `${extras.length} file non risultano associati a nessun nominativo:`,
          ...extras.slice(0, 15).map((file) => `• ${file.name}`),
          extras.length > 15 ? `• ...e altri ${extras.length - 15}` : "",
          "",
          "Controlla il nome Agenzia / Allegato previsto prima di creare le bozze.",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  };

  const updateAgent = (index: number, fieldName: keyof AgentRow, value: string) => {
    setAgents((current) =>
      current.map((agent, agentIndex) =>
        agentIndex === index ? { ...agent, [fieldName]: value } : agent
      )
    );
    setDirty(true);
  };

  const deleteAgent = (index: number) => {
    setAgents((current) => current.filter((_, agentIndex) => agentIndex !== index));
    setDirty(true);
  };

  const addAgent = () => {
    setAgents((current) => [...current, { agenzia: "", email: "", allegato: "" }]);
    setEditingRecipients(true);
    setDirty(true);
  };

  const switchFileMode = (mode: FileMode) => {
    setFileMode(mode);
    setFiles([]);
    setSourceFile(null);
    setSourceAgencies([]);
    setGeneratedByAgency(new Map());
    setSplitWarnings([]);
    setNotice("");
  };

  const createLocalDrafts = async () => {
    setNotice("");

    if (!subject.trim()) {
      setNotice("Inserisci l'oggetto della mail.");
      return;
    }
    if (!files.length) {
      setNotice(fileMode === "single" ? "Carica prima il file unico da dividere." : "Carica prima i file degli agenti.");
      return;
    }
    if (fileMode === "single" && unassociatedSourceAgencies.length) {
      setNotice(
        `Ci sono ${unassociatedSourceAgencies.length} agenzie del file unico senza nominativo associato. Correggi prima gli abbinamenti.`
      );
      return;
    }
    if (fileMode === "separate" && unmatchedManualFiles.length) {
      setNotice(
        `Ci sono ${unmatchedManualFiles.length} file non associati a nessun nominativo. Correggi prima gli abbinamenti.`
      );
      return;
    }
    if (filesWithMissingEmail.length) {
      setNotice(`Manca l'email per ${filesWithMissingEmail.length} nominativi che hanno un file associato.`);
      return;
    }
    if (!readyRows.length) {
      setNotice("Non ci sono email pronte: nessun file risulta associato a un nominativo con indirizzo email.");
      return;
    }

    setBusy(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (let index = 0; index < readyRows.length; index += 1) {
        const row = readyRows[index];
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
          "3. Outlook dovrebbe aprirlo come messaggio non inviato, già compilato con destinatario, oggetto, testo e allegato.",
          "4. Controlla il contenuto e premi Invia manualmente.",
          "",
          `Email create: ${readyRows.length}`,
          "Nessuna password Outlook e nessuna autorizzazione Microsoft sono state usate.",
        ].join("\r\n")
      );

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `BOZZE_EMAIL_${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`Create ${readyRows.length} email .eml. Nessuna mail è stata inviata.`);
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

  const smallField: React.CSSProperties = {
    ...field,
    minWidth: 170,
    padding: "7px 9px",
  };

  const button: React.CSSProperties = {
    border: 0,
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const hasAssociationAlerts =
    unassociatedSourceAgencies.length > 0 || unmatchedManualFiles.length > 0 || splitWarnings.length > 0;

  return (
    <>
      {portalHost &&
        createPortal(
          <button
            onClick={() => setOpen(true)}
            style={{ ...button, background: "#2563eb", color: "white", marginRight: 8 }}
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
                  Puoi caricare un file unico: la webapp lo divide automaticamente per agenzia e controlla gli abbinamenti.
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ ...button, background: "#e2e8f0" }}>
                Chiudi
              </button>
            </div>

            <div style={{ ...card, marginBottom: 16, background: "#ecfdf5", borderColor: "#a7f3d0" }}>
              <strong>✓ Nessun collegamento Outlook richiesto</strong>
              <div style={{ marginTop: 6, color: "#475569" }}>
                I nominativi possono essere salvati su Supabase. I file Excel e gli allegati restano solo sul dispositivo da cui li selezioni.
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: dirty ? "#b45309" : "#64748b", fontWeight: dirty ? 700 : 400 }}>
                {dirty
                  ? "Hai modifiche ai nominativi non ancora salvate online."
                  : savedAt
                    ? `Ultimo salvataggio nominativi: ${new Date(savedAt).toLocaleString("it-IT")}`
                    : "Nessun salvataggio online rilevato."}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div style={card}>
                <strong>1. Elenco destinatari</strong>
                <p style={{ color: "#64748b", fontSize: 14 }}>
                  Importa l'Excel AGENZIA / EMAIL / ALLEGATO oppure usa l'elenco salvato online.
                </p>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => importRecipientsExcel(e.target.files?.[0])} />
                <div style={{ marginTop: 10, fontWeight: 700 }}>{agents.length} nominativi presenti</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    onClick={() => void saveRecipients()}
                    disabled={syncBusy}
                    style={{ ...button, background: "#16a34a", color: "white", opacity: syncBusy ? 0.6 : 1 }}
                  >
                    {syncBusy ? "Sincronizzo..." : "Salva elenco online"}
                  </button>
                  <button
                    onClick={() => void loadSavedRecipients(true)}
                    disabled={syncBusy}
                    style={{ ...button, background: "#e2e8f0", opacity: syncBusy ? 0.6 : 1 }}
                  >
                    Ricarica elenco
                  </button>
                </div>
              </div>

              <div style={card}>
                <strong>2. File da allegare</strong>
                <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={() => switchFileMode("single")}
                    style={{
                      ...button,
                      background: fileMode === "single" ? "#2563eb" : "#e2e8f0",
                      color: fileMode === "single" ? "white" : "#0f172a",
                    }}
                  >
                    File unico (consigliato)
                  </button>
                  <button
                    onClick={() => switchFileMode("separate")}
                    style={{
                      ...button,
                      background: fileMode === "separate" ? "#2563eb" : "#e2e8f0",
                      color: fileMode === "separate" ? "white" : "#0f172a",
                    }}
                  >
                    File già separati
                  </button>
                </div>

                {fileMode === "single" ? (
                  <>
                    <p style={{ color: "#64748b", fontSize: 14 }}>
                      Carica il file completo. Verranno mantenuti tutti i fogli che contengono la colonna agenzia e creato un Excel per ogni agenzia.
                    </p>
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 13, color: "#475569" }}>
                        Nome colonna agenzia (ricerca automatica anche di AGENTE / NOME AGENZIA)
                      </label>
                      <input
                        style={field}
                        value={preferredAgencyHeader}
                        onChange={(e) => setPreferredAgencyHeader(e.target.value)}
                        placeholder="AGENZIA"
                      />
                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsm"
                        onChange={(e) => {
                          const selected = e.target.files?.[0];
                          if (selected) void splitSourceWorkbook(selected);
                        }}
                      />
                      {sourceFile && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 13, color: "#475569" }}>{sourceFile.name}</span>
                          <button
                            onClick={() => void splitSourceWorkbook(sourceFile)}
                            disabled={splitBusy}
                            style={{ ...button, background: "#e2e8f0", padding: "7px 10px" }}
                          >
                            Rigenera divisione
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 10, fontWeight: 700 }}>
                      {splitBusy ? "Sto dividendo il file..." : `${files.length} file generati automaticamente`}
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ color: "#64748b", fontSize: 14 }}>
                      Seleziona tutti i file già separati. Il nome deve coincidere con Agenzia o con Allegato previsto.
                    </p>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => handleSeparateFiles(Array.from(e.target.files || []))}
                    />
                    <div style={{ marginTop: 10, fontWeight: 700 }}>{files.length} file caricati</div>
                  </>
                )}
              </div>
            </div>

            {(hasAssociationAlerts || (fileMode === "single" && sourceAgencies.length > 0)) && (
              <div
                style={{
                  ...card,
                  marginBottom: 16,
                  background: hasAssociationAlerts ? "#fff7ed" : "#ecfdf5",
                  borderColor: hasAssociationAlerts ? "#fdba74" : "#a7f3d0",
                }}
              >
                <strong>{hasAssociationAlerts ? "⚠️ Controllo associazioni" : "✓ Associazioni file corrette"}</strong>
                {fileMode === "single" && sourceAgencies.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    Trovate <strong>{sourceAgencies.length}</strong> agenzie nel file unico; <strong>{readyRows.length}</strong> email sono pronte.
                  </div>
                )}
                {!!unassociatedSourceAgencies.length && (
                  <div style={{ marginTop: 8, color: "#9a3412" }}>
                    <strong>Agenzie del file senza nominativo associato ({unassociatedSourceAgencies.length}):</strong>{" "}
                    {unassociatedSourceAgencies.map((item) => item.label).join(", ")}
                  </div>
                )}
                {!!probableSourceMatches.length && (
                  <div style={{ marginTop: 8, color: "#92400e" }}>
                    Possibili incongruenze di nome: {probableSourceMatches.join("; ")}. Non vengono associate automaticamente per evitare invii errati.
                  </div>
                )}
                {!!unmatchedManualFiles.length && (
                  <div style={{ marginTop: 8, color: "#9a3412" }}>
                    <strong>File non associati ({unmatchedManualFiles.length}):</strong>{" "}
                    {unmatchedManualFiles.map((file) => file.name).join(", ")}
                  </div>
                )}
                {!!splitWarnings.length && (
                  <div style={{ marginTop: 8, color: "#92400e" }}>
                    {splitWarnings.join(" ")}
                  </div>
                )}
                {fileMode === "single" && !!recipientsWithoutSourceData.length && (
                  <div style={{ marginTop: 8, color: "#64748b" }}>
                    {recipientsWithoutSourceData.length} nominativi salvati non hanno dati in questo file: per loro non verrà creata alcuna email.
                  </div>
                )}
              </div>
            )}

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

            <div style={{ ...card, marginBottom: 16, overflowX: "auto" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>4. Controllo abbinamenti</strong>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                    {readyRows.length} email pronte. I nominativi senza file associato vengono semplicemente esclusi dall'invio.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {editingRecipients && (
                    <button
                      onClick={addAgent}
                      style={{ ...button, background: "#dcfce7", color: "#166534", padding: "7px 11px" }}
                    >
                      + Aggiungi nominativo
                    </button>
                  )}
                  <button
                    onClick={() => setEditingRecipients((value) => !value)}
                    style={{
                      ...button,
                      background: editingRecipients ? "#16a34a" : "#e2e8f0",
                      color: editingRecipients ? "white" : "#0f172a",
                      padding: "7px 11px",
                    }}
                  >
                    {editingRecipients ? "✓ Fine modifica" : "✏️ Modifica"}
                  </button>
                </div>
              </div>

              <datalist id="email-attachment-files">
                {files.map((file) => (
                  <option key={file.name} value={file.name} />
                ))}
              </datalist>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: 8 }}>Agenzia</th>
                    <th style={{ padding: 8 }}>Email</th>
                    <th style={{ padding: 8 }}>Allegato previsto</th>
                    <th style={{ padding: 8 }}>File associato / Stato</th>
                    {editingRecipients && <th style={{ padding: 8 }}>Azioni</th>}
                  </tr>
                </thead>
                <tbody>
                  {matched.map((row, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>
                        {editingRecipients ? (
                          <input
                            style={smallField}
                            value={agents[index]?.agenzia ?? ""}
                            onChange={(e) => updateAgent(index, "agenzia", e.target.value)}
                            placeholder="Agenzia"
                          />
                        ) : (
                          row.agenzia || "—"
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {editingRecipients ? (
                          <input
                            style={{ ...smallField, minWidth: 220 }}
                            value={agents[index]?.email ?? ""}
                            onChange={(e) => updateAgent(index, "email", e.target.value)}
                            placeholder="email@esempio.it"
                            type="email"
                          />
                        ) : (
                          row.email || "—"
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {editingRecipients ? (
                          <input
                            style={{ ...smallField, minWidth: 210 }}
                            value={agents[index]?.allegato ?? ""}
                            onChange={(e) => updateAgent(index, "allegato", e.target.value)}
                            placeholder="NOMEFILE.xlsx"
                            list="email-attachment-files"
                          />
                        ) : (
                          row.allegato || "—"
                        )}
                      </td>
                      <td
                        style={{
                          padding: 8,
                          fontWeight: 700,
                          color: row.file && row.email ? "#15803d" : row.file && !row.email ? "#b91c1c" : "#64748b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.file && row.email
                          ? `✓ ${row.file.name}`
                          : row.file && !row.email
                            ? `Email mancante — ${row.file.name}`
                            : fileMode === "single" && sourceAgencies.length
                              ? "Nessun dato nel file — non inviata"
                              : files.length
                                ? "Nessun file associato — non inviata"
                                : "File non caricati"}
                      </td>
                      {editingRecipients && (
                        <td style={{ padding: 8 }}>
                          <button
                            onClick={() => deleteAgent(index)}
                            style={{ ...button, background: "#fee2e2", color: "#991b1b", padding: "7px 10px" }}
                          >
                            Elimina
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!matched.length && (
                    <tr>
                      <td
                        colSpan={editingRecipients ? 5 : 4}
                        style={{ padding: 16, textAlign: "center", color: "#64748b" }}
                      >
                        Nessun nominativo presente. Importa l'Excel oppure premi Modifica e aggiungi un nominativo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {notice && (
              <div style={{ ...card, marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe" }}>
                {notice}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 30, flexWrap: "wrap" }}>
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
                disabled={busy || splitBusy || !readyRows.length}
                onClick={createLocalDrafts}
                style={{
                  ...button,
                  background: "#16a34a",
                  color: "white",
                  opacity: busy || splitBusy || !readyRows.length ? 0.55 : 1,
                }}
              >
                {busy ? "Creo il pacchetto..." : `Scarica ${readyRows.length || ""} bozze Outlook (.zip)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
