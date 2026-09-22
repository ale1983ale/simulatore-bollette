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
  sourceLabel?: string;
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

type AssignmentResult = {
  byAgent: Map<number, number>;
  usedSources: Set<number>;
  suggestions: Map<number, { agentIndex: number; score: number }>;
};

const normalize = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

const stripExtension = (value: string) => String(value || "").replace(/\.[^.]+$/, "");

const words = (value: string) =>
  String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .split(/[^A-Z0-9]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !["SRL", "SNC", "SAS", "SPA", "DI", "DE", "DEL", "DELLA", "DELLE"].includes(item));

const canonicalWords = (value: string) => [...words(value)].sort().join("|");

const subset = (small: string[], large: string[]) => {
  const largeSet = new Set(large);
  return small.length > 0 && small.every((item) => largeSet.has(item));
};

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

const utf8ToBase64 = (value: string) => bytesToBase64(new TextEncoder().encode(value));
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

function matchScore(agent: AgentRow, sourceLabel: string) {
  if (normalize(agent.agenzia) === normalize(NON_ASSIGNED_LABEL)) return 0;
  const sourceNorm = normalize(sourceLabel);
  const agencyNorm = normalize(agent.agenzia);
  const expectedStem = stripExtension(agent.allegato);
  const expectedNorm = normalize(expectedStem);

  if (expectedNorm && sourceNorm === expectedNorm) return 150;
  if (agencyNorm && sourceNorm === agencyNorm) return 145;

  const sourceWords = words(sourceLabel);
  const agencyWords = words(agent.agenzia);
  const expectedWords = words(expectedStem);
  const sourceCanonical = canonicalWords(sourceLabel);

  if (agencyWords.length && canonicalWords(agent.agenzia) === sourceCanonical) return 140;
  if (expectedWords.length && canonicalWords(expectedStem) === sourceCanonical) return 138;

  if (agencyWords.length >= 2 && subset(agencyWords, sourceWords)) return 125 + Math.min(agencyWords.length, 5);
  if (expectedWords.length >= 2 && subset(expectedWords, sourceWords)) return 122 + Math.min(expectedWords.length, 5);
  if (sourceWords.length >= 2 && subset(sourceWords, agencyWords)) return 116;
  if (sourceWords.length >= 2 && subset(sourceWords, expectedWords)) return 114;

  // Un file può chiamarsi semplicemente con una sola parola significativa
  // (es. BALDUINI.xlsx) mentre l'anagrafica contiene "Alessandro Balduini".
  // In questo caso la parola del file viene cercata sia in Agenzia sia nelle
  // Parole chiave agente. La risoluzione finale resta comunque univoca grazie
  // a buildAssignments, quindi i casi ambigui non vengono associati.
  const sourceSingle = sourceWords.length === 1 ? sourceWords[0] : "";
  if (sourceSingle.length >= 4 && agencyWords.includes(sourceSingle)) return 108;
  if (sourceSingle.length >= 4 && expectedWords.includes(sourceSingle)) return 106;

  const singleAgency = agencyWords.length === 1 ? agencyWords[0] : "";
  const singleExpected = expectedWords.length === 1 ? expectedWords[0] : "";
  if (singleAgency.length >= 5 && sourceWords.includes(singleAgency)) return 90;
  if (singleExpected.length >= 5 && sourceWords.includes(singleExpected)) return 88;

  return 0;
}

function buildAssignments(agents: AgentRow[], sources: SourceAgency[]): AssignmentResult {
  const scores = agents.map((agent) => sources.map((source) => matchScore(agent, source.label)));
  const agentBest = scores.map((row) => Math.max(0, ...row));
  const sourceBest = sources.map((_, sourceIndex) =>
    Math.max(0, ...scores.map((row) => row[sourceIndex] || 0))
  );

  const byAgent = new Map<number, number>();
  const usedSources = new Set<number>();
  const suggestions = new Map<number, { agentIndex: number; score: number }>();

  sources.forEach((_, sourceIndex) => {
    const ranked = agents
      .map((_, agentIndex) => ({ agentIndex, score: scores[agentIndex]?.[sourceIndex] || 0 }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked[0]) suggestions.set(sourceIndex, ranked[0]);
  });

  agents.forEach((_, agentIndex) => {
    const best = agentBest[agentIndex];
    if (best < 88) return;
    const agentTop = scores[agentIndex]
      .map((score, sourceIndex) => ({ score, sourceIndex }))
      .filter((item) => item.score === best);
    if (agentTop.length !== 1) return;

    const sourceIndex = agentTop[0].sourceIndex;
    const sourceTopAgents = scores
      .map((row, idx) => ({ idx, score: row[sourceIndex] || 0 }))
      .filter((item) => item.score === sourceBest[sourceIndex]);

    if (sourceTopAgents.length !== 1 || sourceTopAgents[0].idx !== agentIndex) return;
    if (usedSources.has(sourceIndex)) return;

    byAgent.set(agentIndex, sourceIndex);
    usedSources.add(sourceIndex);
  });

  return { byAgent, usedSources, suggestions };
}

function detectAgencyColumn(matrix: unknown[][], preferredHeader: string) {
  const candidates = new Set(
    [preferredHeader, "AGENZIA", "AGENZIA AGENTE", "NOME AGENZIA", "NOME AGENZIA/AGENTE", "AGENTE", "NOME AGENTE", "CONSULENTE"]
      .map(normalize)
      .filter(Boolean)
  );
  const maxRows = Math.min(matrix.length, 20);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (candidates.has(normalize(String(row[colIndex] ?? "")))) {
        return { rowIndex, colIndex };
      }
    }
  }
  return null;
}

const NON_ASSIGNED_LABEL = "NON ASSEGNATI";
const isNonAssignedAgent = (agent: AgentRow) => normalize(agent.agenzia) === normalize(NON_ASSIGNED_LABEL);

async function buildNonAssignedWorkbook(
  sources: SourceAgency[],
  generatedByAgency: Map<string, File>,
  preferredHeader: string,
  originalFileName: string
): Promise<File | null> {
  if (!sources.length) return null;

  const mergedSheets = new Map<string, { rows: unknown[][]; cols?: any }>();

  for (const source of sources) {
    const file = generatedByAgency.get(source.key);
    if (!file) continue;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array", cellDates: true });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName] as any;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      if (!matrix.length) continue;

      const current = mergedSheets.get(sheetName);
      if (!current) {
        mergedSheets.set(sheetName, {
          rows: matrix.map((row) => [...row]),
          cols: sheet?.["!cols"],
        });
        continue;
      }

      const detected = detectAgencyColumn(matrix, preferredHeader);
      const dataStart = detected ? detected.rowIndex + 1 : 1;
      current.rows.push(...matrix.slice(dataStart).map((row) => [...row]));
    }
  }

  if (!mergedSheets.size) return null;

  const outWorkbook = XLSX.utils.book_new();
  for (const [sheetName, value] of mergedSheets) {
    const outSheet = XLSX.utils.aoa_to_sheet(value.rows as any[][]);
    if (value.cols) (outSheet as any)["!cols"] = value.cols;
    XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);
  }

  const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const originalStem = sanitizeFileName(stripExtension(originalFileName || "")).trim();
  const nonAssignedName = originalStem
    ? `${NON_ASSIGNED_LABEL} ${originalStem}.xlsx`
    : `${NON_ASSIGNED_LABEL}.xlsx`;
  return new File([outData], nonAssignedName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
  const [nonAssignedFile, setNonAssignedFile] = useState<File | null>(null);
  const [preferredAgencyHeader, setPreferredAgencyHeader] = useState("AGENZIA");
  const [splitBusy, setSplitBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Buongiorno,\n\nin allegato trasmetto il file di competenza.\n\nCordiali saluti");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingRecipients, setEditingRecipients] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    const onToggleRemoved = (event: Event) => {
      const detail = (event as CustomEvent<{ index?: number; removed?: boolean }>).detail;
      const rowIndex = Number(detail?.index);
      if (!Number.isInteger(rowIndex) || rowIndex < 0) return;

      setRemovedRows((current) => {
        const next = new Set(current);
        if (detail?.removed === false) next.delete(rowIndex);
        else next.add(rowIndex);
        return next;
      });
    };

    window.addEventListener('outlook-email-toggle-remove', onToggleRemoved as EventListener);
    return () => window.removeEventListener('outlook-email-toggle-remove', onToggleRemoved as EventListener);
  }, []);

  useEffect(() => {
    setRemovedRows(new Set());
  }, [fileMode, sourceFile, files]);

  useEffect(() => {
    let host: HTMLElement | null = null;
    const placeInAdminToolbar = () => {
      const dataButton = Array.from(document.querySelectorAll("button")).find(
        (node) => node.textContent?.trim() === "DATI PRODUZIONE" && (node as HTMLElement).offsetParent !== null
      ) as HTMLElement | undefined;
      if (!dataButton?.parentElement) {
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
      if (host.parentElement !== dataButton.parentElement || host.nextSibling !== dataButton) {
        dataButton.parentElement.insertBefore(host, dataButton);
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
      if (!response.ok) throw new Error(await response.text());
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
      setRemovedRows(new Set());
      setDirty(false);
      setSavedAt(row?.updated_at || null);
      if (showMessage) setNotice(cleaned.length ? `Caricati ${cleaned.length} nominativi salvati online.` : "Nessun nominativo salvato online.");
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
        headers: { ...syncHeaders(ownerKey, true), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ owner_key: ownerKey, recipients, updated_at: now }),
      });
      if (!response.ok) throw new Error(await response.text());
      setDirty(false);
      setSavedAt(now);
      setNotice(`Elenco salvato online: ${recipients.length} nominativi.`);
    } catch (error: any) {
      setNotice(`Impossibile salvare l'elenco: ${error?.message || error}`);
    } finally {
      setSyncBusy(false);
    }
  };

  useEffect(() => {
    if (open) void loadSavedRecipients(false);
  }, [open]);

  const assignment = useMemo(() => buildAssignments(agents, sourceAgencies), [agents, sourceAgencies]);
  const nonAssignedAgentIndex = useMemo(() => agents.findIndex(isNonAssignedAgent), [agents]);
  const nonAssignedAgent = nonAssignedAgentIndex >= 0 ? agents[nonAssignedAgentIndex] : null;
  const nonAssignedConfigured = Boolean(nonAssignedAgent?.email.trim());

  const manualSources = useMemo<SourceAgency[]>(
    () =>
      fileMode === "separate"
        ? files.map((file, index) => ({
            key: `manual-${index}`,
            label: stripExtension(file.name),
            fileName: file.name,
          }))
        : [],
    [fileMode, files]
  );

  const manualAssignment = useMemo(
    () => buildAssignments(agents, manualSources),
    [agents, manualSources]
  );

  const matched = useMemo<PreparedRow[]>(() => {
    return agents.map((agent, agentIndex) => {
      if (fileMode === "single" && isNonAssignedAgent(agent)) {
        return {
          ...agent,
          file: nonAssignedFile,
          sourceLabel: nonAssignedFile ? NON_ASSIGNED_LABEL : undefined,
        };
      }
      if (fileMode === "separate") {
        const sourceIndex = manualAssignment.byAgent.get(agentIndex);
        if (sourceIndex === undefined) return { ...agent, file: null };
        const source = manualSources[sourceIndex];
        return {
          ...agent,
          file: files[sourceIndex] || null,
          sourceLabel: source?.label,
        };
      }
      const sourceIndex = assignment.byAgent.get(agentIndex);
      if (sourceIndex === undefined) return { ...agent, file: null };
      const source = sourceAgencies[sourceIndex];
      return {
        ...agent,
        file: generatedByAgency.get(source.key) || null,
        sourceLabel: source.label,
      };
    });
  }, [agents, files, fileMode, sourceAgencies, generatedByAgency, assignment, manualAssignment, manualSources, nonAssignedFile]);

  const readyRows = useMemo(
    () => matched.filter((row, index) => !removedRows.has(index) && row.file && row.email.trim()),
    [matched, removedRows]
  );
  const filesWithMissingEmail = useMemo(
    () => matched.filter((row, index) => !removedRows.has(index) && row.file && !row.email.trim()),
    [matched, removedRows]
  );

  const unassociatedSourceAgencies = useMemo(
    () => sourceAgencies.filter((_, sourceIndex) => !assignment.usedSources.has(sourceIndex)),
    [sourceAgencies, assignment]
  );

  useEffect(() => {
    let cancelled = false;
    if (fileMode !== "single" || !unassociatedSourceAgencies.length) {
      setNonAssignedFile(null);
      return;
    }

    void buildNonAssignedWorkbook(
      unassociatedSourceAgencies,
      generatedByAgency,
      preferredAgencyHeader,
      sourceFile?.name || ""
    )
      .then((file) => {
        if (!cancelled) setNonAssignedFile(file);
      })
      .catch((error) => {
        if (!cancelled) {
          setNonAssignedFile(null);
          setNotice(`Errore nella creazione del file NON ASSEGNATI: ${error?.message || error}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileMode, unassociatedSourceAgencies, generatedByAgency, preferredAgencyHeader, sourceFile]);

  const recipientsWithoutSourceData = useMemo(
    () => agents.filter((agent, agentIndex) => !isNonAssignedAgent(agent) && !assignment.byAgent.has(agentIndex)),
    [agents, assignment]
  );

  const probableSourceMatches = useMemo(() => {
    return sourceAgencies
      .map((source, sourceIndex) => {
        if (assignment.usedSources.has(sourceIndex)) return "";
        const suggestion = assignment.suggestions.get(sourceIndex);
        if (!suggestion || suggestion.score < 70) return "";
        return `${source.label} ↔ ${agents[suggestion.agentIndex]?.agenzia || "?"}`;
      })
      .filter(Boolean);
  }, [sourceAgencies, assignment, agents]);

  const unmatchedManualFiles = useMemo(() => {
    if (fileMode !== "separate") return [];
    return files.filter((_, sourceIndex) => !manualAssignment.usedSources.has(sourceIndex));
  }, [fileMode, files, manualAssignment]);

  const importRecipientsExcel = async (file?: File) => {
    if (!file) return;
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
      if (!parsed.length) throw new Error("Il file deve avere le colonne AGENZIA, EMAIL e ALLEGATO.");
      setAgents(parsed);
      setRemovedRows(new Set());
      setDirty(true);
      setEditingRecipients(false);
      setNotice(`Importati ${parsed.length} destinatari. Premi “Salva elenco online” per conservarli.`);
    } catch (error: any) {
      setNotice(`Errore Excel destinatari: ${error?.message || error}`);
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
    setNonAssignedFile(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const groups = new Map<string, { label: string; sheets: Map<string, unknown[][]> }>();
      const warnings: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sourceSheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, { header: 1, defval: "", raw: false }) as unknown[][];
        if (!matrix.length) continue;
        const detected = detectAgencyColumn(matrix, preferredAgencyHeader);
        if (!detected) {
          warnings.push(`Foglio “${sheetName}” ignorato: colonna agenzia non trovata.`);
          continue;
        }
        const prefix = matrix.slice(0, detected.rowIndex + 1).map((row) => [...row]);
        for (let rowIndex = detected.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
          const row = matrix[rowIndex] || [];
          const label = String(row[detected.colIndex] ?? "").trim();
          const key = normalize(label);
          if (!key) continue;
          if (!groups.has(key)) groups.set(key, { label, sheets: new Map() });
          const group = groups.get(key)!;
          if (!group.sheets.has(sheetName)) group.sheets.set(sheetName, prefix.map((item) => [...item]));
          group.sheets.get(sheetName)!.push([...row]);
        }
      }

      if (!groups.size) throw new Error(`Non trovo righe da dividere. Verifica la colonna “${preferredAgencyHeader || "AGENZIA"}”.`);

      const generatedMap = new Map<string, File>();
      const generatedFiles: File[] = [];
      const sourceList: SourceAgency[] = [];

      for (const [key, group] of groups) {
        const outWorkbook = XLSX.utils.book_new();
        for (const [sheetName, rows] of group.sheets) {
          const outSheet = XLSX.utils.aoa_to_sheet(rows as any[][]);
          const originalSheet = workbook.Sheets[sheetName] as any;
          if (originalSheet?.["!cols"]) (outSheet as any)["!cols"] = originalSheet["!cols"];
          XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);
        }
        const fileName = `${sanitizeFileName(group.label || key).replace(/\.xlsx$/i, "")}.xlsx`;
        const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        const generatedFile = new File([outData], fileName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        generatedMap.set(key, generatedFile);
        generatedFiles.push(generatedFile);
        sourceList.push({ key, label: group.label, fileName });
      }

      sourceList.sort((a, b) => a.label.localeCompare(b.label, "it"));
      generatedFiles.sort((a, b) => a.name.localeCompare(b.name, "it"));
      setGeneratedByAgency(generatedMap);
      setFiles(generatedFiles);
      setSourceAgencies(sourceList);
      setSplitWarnings(warnings);
      setNotice(`File unico diviso in ${generatedFiles.length} file. Gli abbinamenti vengono controllati automaticamente.`);
    } catch (error: any) {
      setFiles([]);
      setGeneratedByAgency(new Map());
      setSourceAgencies([]);
      setSplitWarnings([]);
    setNonAssignedFile(null);
      setNotice(`Errore nella divisione del file unico: ${error?.message || error}`);
    } finally {
      setSplitBusy(false);
    }
  };

  useEffect(() => {
    if (!sourceAgencies.length || fileMode !== "single") return;
    const timer = window.setTimeout(() => {
      const nowAssignment = buildAssignments(agents, sourceAgencies);
      const unmatched = sourceAgencies.filter((_, index) => !nowAssignment.usedSources.has(index));
      const unmatchedNeedsAttention = unmatched.length > 0 && !nonAssignedConfigured;
      if (!unmatchedNeedsAttention && !splitWarnings.length) return;
      const lines = ["CONTROLLO ABBINAMENTI", ""];
      if (unmatchedNeedsAttention) {
        lines.push(`${unmatched.length} agenzie del file non sono associate a un nominativo. Aggiungi il nominativo “NON ASSEGNATI” con la tua email per riceverle in un unico file:`, ...unmatched.slice(0, 15).map((item) => `• ${item.label}`));
        if (unmatched.length > 15) lines.push(`• ...e altre ${unmatched.length - 15}`);
      }
      if (splitWarnings.length) lines.push("", ...splitWarnings.map((item) => `• ${item}`));
      window.alert(lines.join("\n"));
    }, 50);
    return () => window.clearTimeout(timer);
  }, [sourceAgencies, agents, fileMode, splitWarnings, nonAssignedConfigured]);

  const handleSeparateFiles = (selected: File[]) => {
    setSourceFile(null);
    setSourceAgencies([]);
    setGeneratedByAgency(new Map());
    setSplitWarnings([]);
    setNonAssignedFile(null);
    setFiles(selected);

    const sources = selected.map((file, index) => ({
      key: `manual-${index}`,
      label: stripExtension(file.name),
      fileName: file.name,
    }));
    const nowAssignment = buildAssignments(agents, sources);
    const extras = selected.filter((_, sourceIndex) => !nowAssignment.usedSources.has(sourceIndex));
    if (extras.length) {
      window.alert(`ATTENZIONE\n\n${extras.length} file non risultano associati a nessun nominativo:\n${extras.slice(0, 15).map((file) => `• ${file.name}`).join("\n")}`);
    }
  };

  const updateAgent = (index: number, fieldName: keyof AgentRow, value: string) => {
    setAgents((current) => current.map((agent, i) => (i === index ? { ...agent, [fieldName]: value } : agent)));
    setDirty(true);
  };

  const deleteAgent = (index: number) => {
    setAgents((current) => current.filter((_, i) => i !== index));
    setRemovedRows(new Set());
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
    setNonAssignedFile(null);
    setNotice("");
  };

  const createLocalDrafts = async () => {
    setNotice("");
    if (!subject.trim()) return setNotice("Inserisci l'oggetto della mail.");
    if (!files.length) return setNotice(fileMode === "single" ? "Carica prima il file unico." : "Carica prima i file degli agenti.");
    if (fileMode === "single" && unassociatedSourceAgencies.length && !nonAssignedConfigured) return setNotice(`Ci sono ${unassociatedSourceAgencies.length} agenzie del file senza nominativo associato. Aggiungi il nominativo “NON ASSEGNATI” con l’email a cui inviarle.`);
    if (fileMode === "single" && unassociatedSourceAgencies.length && nonAssignedConfigured && !nonAssignedFile) return setNotice("Sto preparando il file NON ASSEGNATI con il nome del file originale. Attendi un istante e riprova.");
    if (fileMode === "separate" && unmatchedManualFiles.length) return setNotice(`Ci sono ${unmatchedManualFiles.length} file non associati. Correggi prima gli abbinamenti.`);
    if (filesWithMissingEmail.length) return setNotice(`Manca l'email per ${filesWithMissingEmail.length} nominativi con file associato.`);
    if (!readyRows.length) return setNotice("Non ci sono email pronte.");

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
        while (usedNames.has(fileName.toLowerCase())) fileName = `${baseName}-${suffix++}.eml`;
        usedNames.add(fileName.toLowerCase());
        zip.file(fileName, eml);
      }
      zip.file("LEGGIMI.txt", [
        "BOZZE EMAIL PER OUTLOOK",
        "",
        "1. Estrai lo ZIP.",
        "2. Apri ciascun file .eml.",
        "3. Controlla destinatario, oggetto, testo e allegato.",
        "4. Premi Invia manualmente.",
        "",
        `Email create: ${readyRows.length}`,
        "Nessun collegamento Microsoft è stato usato.",
      ].join("\r\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `BOZZE_EMAIL_${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`Create ${readyRows.length} email .eml. Nessuna mail è stata inviata.`);
    } catch (error: any) {
      setNotice(`Errore nella creazione delle email: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const card: React.CSSProperties = { background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, boxShadow: "0 10px 30px rgba(15,23,42,.08)" };
  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", fontSize: 14, background: "white" };
  const smallField: React.CSSProperties = { ...field, minWidth: 170, padding: "7px 9px" };
  const button: React.CSSProperties = { border: 0, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
  const hasAssociationAlerts = (unassociatedSourceAgencies.length > 0 && !nonAssignedConfigured) || unmatchedManualFiles.length > 0 || splitWarnings.length > 0;

  return (
    <>
      {portalHost && createPortal(
        <button onClick={() => setOpen(true)} style={{ ...button, background: "#2563eb", color: "white", marginRight: 8 }}>✉️ INVIO EMAIL</button>,
        portalHost
      )}

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f8fafc", overflow: "auto", color: "#0f172a" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 18 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 26 }}>Invio Email Outlook</h1>
                <div style={{ color: "#64748b", marginTop: 4 }}>Carica un file unico, dividilo automaticamente per agenzia e controlla gli abbinamenti.</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ ...button, background: "#e2e8f0" }}>Chiudi</button>
            </div>

            <div style={{ ...card, marginBottom: 16, background: "#ecfdf5", borderColor: "#a7f3d0" }}>
              <strong>✓ Nessun collegamento Outlook richiesto</strong>
              <div style={{ marginTop: 6, color: "#475569" }}>I nominativi possono essere salvati online. I file Excel restano sul dispositivo.</div>
              <div style={{ marginTop: 8, fontSize: 13, color: dirty ? "#b45309" : "#64748b", fontWeight: dirty ? 700 : 400 }}>
                {dirty ? "Hai modifiche ai nominativi non ancora salvate online." : savedAt ? `Ultimo salvataggio nominativi: ${new Date(savedAt).toLocaleString("it-IT")}` : "Nessun salvataggio online rilevato."}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginBottom: 16 }}>
              <div style={card}>
                <strong>1. Elenco destinatari</strong>
                <p style={{ color: "#64748b", fontSize: 14 }}>Importa l'Excel AGENZIA / EMAIL / ALLEGATO oppure usa l'elenco salvato online.</p>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => importRecipientsExcel(e.target.files?.[0])} />
                <div style={{ marginTop: 10, fontWeight: 700 }}>{agents.length} nominativi presenti</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => void saveRecipients()} disabled={syncBusy} style={{ ...button, background: "#16a34a", color: "white", opacity: syncBusy ? 0.6 : 1 }}>{syncBusy ? "Sincronizzo..." : "Salva elenco online"}</button>
                  <button onClick={() => void loadSavedRecipients(true)} disabled={syncBusy} style={{ ...button, background: "#e2e8f0", opacity: syncBusy ? 0.6 : 1 }}>Ricarica elenco</button>
                </div>
              </div>

              <div style={card}>
                <strong>2. File da allegare</strong>
                <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <button onClick={() => switchFileMode("single")} style={{ ...button, background: fileMode === "single" ? "#2563eb" : "#e2e8f0", color: fileMode === "single" ? "white" : "#0f172a" }}>File unico (consigliato)</button>
                  <button onClick={() => switchFileMode("separate")} style={{ ...button, background: fileMode === "separate" ? "#2563eb" : "#e2e8f0", color: fileMode === "separate" ? "white" : "#0f172a" }}>File già separati</button>
                </div>

                {fileMode === "single" ? (
                  <>
                    <p style={{ color: "#64748b", fontSize: 14 }}>Carica il file completo. La webapp crea un Excel per ogni agenzia e riconosce anche nomi scritti in ordine diverso o con parole aggiuntive.</p>
                    <label style={{ fontSize: 13, color: "#475569" }}>Nome colonna agenzia</label>
                    <input style={{ ...field, marginTop: 6, marginBottom: 8 }} value={preferredAgencyHeader} onChange={(e) => setPreferredAgencyHeader(e.target.value)} placeholder="AGENZIA" />
                    <input type="file" accept=".xlsx,.xls,.xlsm" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void splitSourceWorkbook(selected); }} />
                    {sourceFile && <div style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>{sourceFile.name}</div>}
                    <div style={{ marginTop: 10, fontWeight: 700 }}>{splitBusy ? "Sto dividendo il file..." : `${files.length} file generati automaticamente`}</div>
                  </>
                ) : (
                  <>
                    <p style={{ color: "#64748b", fontSize: 14 }}>Seleziona tutti i file già separati. La webapp prova ad abbinarli anche se il nome è scritto in modo leggermente diverso.</p>
                    <input type="file" multiple onChange={(e) => handleSeparateFiles(Array.from(e.target.files || []))} />
                    <div style={{ marginTop: 10, fontWeight: 700 }}>{files.length} file caricati</div>
                  </>
                )}
              </div>
            </div>

            {(hasAssociationAlerts || (fileMode === "single" && sourceAgencies.length > 0)) && (
              <div style={{ ...card, marginBottom: 16, background: hasAssociationAlerts ? "#fff7ed" : "#ecfdf5", borderColor: hasAssociationAlerts ? "#fdba74" : "#a7f3d0" }}>
                <strong>{hasAssociationAlerts ? "⚠️ Controllo associazioni" : "✓ Associazioni file corrette"}</strong>
                {fileMode === "single" && sourceAgencies.length > 0 && <div style={{ marginTop: 8 }}>Trovate <strong>{sourceAgencies.length}</strong> agenzie nel file; <strong>{readyRows.length}</strong> email sono pronte.</div>}
                {!!unassociatedSourceAgencies.length && nonAssignedConfigured && <div style={{ marginTop: 8, color: "#166534" }}><strong>{unassociatedSourceAgencies.length} agenzie non associate</strong> saranno raccolte nel file <strong>NON ASSEGNATI.xlsx</strong> e inviate a <strong>{nonAssignedAgent?.email}</strong>.</div>}
                {!!unassociatedSourceAgencies.length && !nonAssignedConfigured && <div style={{ marginTop: 8, color: "#9a3412" }}><strong>Agenzie del file senza nominativo associato ({unassociatedSourceAgencies.length}):</strong> {unassociatedSourceAgencies.map((item) => item.label).join(", ")}<div style={{ marginTop: 4 }}>Aggiungi un nominativo chiamato <strong>NON ASSEGNATI</strong> e inserisci la tua email.</div></div>}
                {!!probableSourceMatches.length && <div style={{ marginTop: 8, color: "#92400e" }}>Possibili corrispondenze da verificare: {probableSourceMatches.join("; ")}</div>}
                {!!unmatchedManualFiles.length && <div style={{ marginTop: 8, color: "#9a3412" }}><strong>File non associati ({unmatchedManualFiles.length}):</strong> {unmatchedManualFiles.map((file) => file.name).join(", ")}</div>}
                {!!splitWarnings.length && <div style={{ marginTop: 8, color: "#92400e" }}>{splitWarnings.join(" ")}</div>}
                {fileMode === "single" && !!recipientsWithoutSourceData.length && <div style={{ marginTop: 8, color: "#64748b" }}>{recipientsWithoutSourceData.length} nominativi salvati non hanno dati in questo file: per loro non verrà creata alcuna email.</div>}
              </div>
            )}

            <div style={{ ...card, marginBottom: 16 }}>
              <strong>3. Messaggio</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <input style={field} placeholder="Oggetto" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <textarea style={{ ...field, minHeight: 150, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>

            <div style={{ ...card, marginBottom: 16, overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <strong>4. Controllo abbinamenti</strong>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>{readyRows.length} email pronte. I nominativi senza file associato vengono esclusi.</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {editingRecipients && <button onClick={addAgent} style={{ ...button, background: "#dcfce7", color: "#166534", padding: "7px 11px" }}>+ Aggiungi nominativo</button>}
                  <button onClick={() => setEditingRecipients((value) => !value)} style={{ ...button, background: editingRecipients ? "#16a34a" : "#e2e8f0", color: editingRecipients ? "white" : "#0f172a", padding: "7px 11px" }}>{editingRecipients ? "✓ Fine modifica" : "✏️ Modifica"}</button>
                </div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 14 }}>
                <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}><th style={{ padding: 8 }}>Agenzia</th><th style={{ padding: 8 }}>Email</th><th style={{ padding: 8 }}>Allegato previsto</th><th style={{ padding: 8 }}>File associato / Stato</th>{editingRecipients && <th style={{ padding: 8 }}>Azioni</th>}</tr></thead>
                <tbody>
                  {matched.map((row, index) => (
                    <tr key={index} data-email-row-index={index} data-email-removed={removedRows.has(index) ? "true" : "false"} data-email-file-name={row.file?.name || ""} style={{ borderBottom: "1px solid #f1f5f9", opacity: removedRows.has(index) ? 0.62 : 1 }}>
                      <td style={{ padding: 8 }}>{editingRecipients ? <input style={smallField} value={agents[index]?.agenzia ?? ""} onChange={(e) => updateAgent(index, "agenzia", e.target.value)} placeholder="Agenzia" /> : row.agenzia || "—"}</td>
                      <td style={{ padding: 8 }}>{editingRecipients ? <input style={{ ...smallField, minWidth: 220 }} value={agents[index]?.email ?? ""} onChange={(e) => updateAgent(index, "email", e.target.value)} placeholder="email@esempio.it" type="email" /> : row.email || "—"}</td>
                      <td style={{ padding: 8 }}>{editingRecipients ? <input style={{ ...smallField, minWidth: 210 }} value={agents[index]?.allegato ?? ""} onChange={(e) => updateAgent(index, "allegato", e.target.value)} placeholder="NOMEFILE.xlsx" /> : row.allegato || "—"}</td>
                      <td style={{ padding: 8, fontWeight: 700, color: removedRows.has(index) ? "#b91c1c" : row.file && row.email ? "#15803d" : row.file && !row.email ? "#b91c1c" : "#64748b", whiteSpace: "nowrap" }}>
                        {removedRows.has(index) ? "Rimosso manualmente — non inviata" : row.file && row.email ? `✓ ${row.file.name}` : row.file && !row.email ? `Email mancante — ${row.file.name}` : fileMode === "single" && sourceAgencies.length ? "Nessun dato nel file — non inviata" : files.length ? "Nessun file associato — non inviata" : "File non caricati"}
                      </td>
                      {editingRecipients && <td style={{ padding: 8 }}><button onClick={() => deleteAgent(index)} style={{ ...button, background: "#fee2e2", color: "#991b1b", padding: "7px 10px" }}>Elimina</button></td>}
                    </tr>
                  ))}
                  {!matched.length && <tr><td colSpan={editingRecipients ? 5 : 4} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>Nessun nominativo presente.</td></tr>}
                </tbody>
              </table>
            </div>

            {notice && <div style={{ ...card, marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe" }}>{notice}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 30, flexWrap: "wrap" }}>
              <button onClick={() => { setSubject(""); setBody(""); setNotice(""); }} style={{ ...button, background: "#e2e8f0" }}>Pulisci messaggio</button>
              <button disabled={busy || splitBusy || !readyRows.length} onClick={createLocalDrafts} style={{ ...button, background: "#16a34a", color: "white", opacity: busy || splitBusy || !readyRows.length ? 0.55 : 1 }}>{busy ? "Creo il pacchetto..." : `Scarica ${readyRows.length || ""} bozze Outlook (.zip)`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
