import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import ReportNotificationPanel from "./ReportNotificationPanel";
import {
  adminAgentList,
  type SafeAgentRecord,
} from "./agentSecurity";

type AgentRow = {
  agenzia: string;
  email: string;
  allegato: string;
  dm: string;
  report_notify?: boolean;
  agent_id?: number | null;
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

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

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

  // Chiave stabile: non dipende più dalla password, che nelle nuove
  // sessioni admin sicure non viene memorizzata nel browser.
  const seed = `${admin.id}|${String(admin.username)
    .trim()
    .toLowerCase()}|email-recipient-sync-v2`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(seed)
  );

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
  const [activeView, setActiveView] =
    useState<"email" | "matches" | "report">("email");
  const [targetMatchAgency, setTargetMatchAgency] = useState("");
  const [overlayTop, setOverlayTop] = useState(0);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [reportAccounts, setReportAccounts] =
    useState<SafeAgentRecord[]>([]);
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
  const [pendingRecipientFile, setPendingRecipientFile] = useState<File | null>(null);
  const [pendingSourceFile, setPendingSourceFile] = useState<File | null>(null);
  const [pendingSeparateFiles, setPendingSeparateFiles] = useState<File[]>([]);
  const [excludedUnmatchedKeys, setExcludedUnmatchedKeys] = useState<Set<string>>(new Set());
  const [unmatchedDirectEmails, setUnmatchedDirectEmails] = useState<Record<string, string>>({});
  const [editingUnmatchedEmailKey, setEditingUnmatchedEmailKey] = useState<string | null>(null);

  useEffect(() => {
    const onOpenEmail = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          view?: "email" | "matches" | "report";
          targetAgency?: string;
        }>
      ).detail;
      const requestedView = detail?.view;
      const requestedAgency = String(
        detail?.targetAgency || ""
      ).trim();

      setTargetMatchAgency(requestedAgency);
      setActiveView(
        requestedView === "matches"
          ? "matches"
          : requestedView === "report"
            ? "report"
            : "email"
      );
      setOpen(true);
    };

    const onCloseEmail = () => setOpen(false);

    window.addEventListener(
      "open-outlook-email",
      onOpenEmail as EventListener
    );
    window.addEventListener(
      "close-outlook-email",
      onCloseEmail as EventListener
    );

    return () => {
      window.removeEventListener(
        "open-outlook-email",
        onOpenEmail as EventListener
      );
      window.removeEventListener(
        "close-outlook-email",
        onCloseEmail as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const positionOverlay = () => {
      const visibleShells = Array.from(
        document.querySelectorAll(
          ".ge-brand-shell, .ge-main-nav, .ge-admin-nav, .ge-database-nav"
        )
      ).filter(
        (node) =>
          node instanceof HTMLElement &&
          node.offsetParent !== null
      ) as HTMLElement[];

      const bottom = visibleShells.reduce(
        (max, node) =>
          Math.max(max, node.getBoundingClientRect().bottom),
        0
      );

      setOverlayTop(
        Math.max(0, Math.ceil(bottom > 0 ? bottom + 8 : 0))
      );
    };

    const closeOnNavigation = (event: MouseEvent) => {
      const target =
        event.target instanceof Element ? event.target : null;
      if (!target) return;

      const navigationTarget = target.closest(
        ".ge-brand-shell, .ge-main-nav, .ge-admin-nav, .ge-database-nav"
      );
      if (!navigationTarget) return;

      const label =
        navigationTarget.textContent?.toLocaleUpperCase("it") || "";
      if (label.includes("INVIO EMAIL")) return;

      setOpen(false);
    };

    window.scrollTo({ top: 0, behavior: "auto" });
    const frame = window.requestAnimationFrame(positionOverlay);
    window.addEventListener("resize", positionOverlay);
    document.addEventListener(
      "click",
      closeOnNavigation,
      true
    );

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionOverlay);
      document.removeEventListener(
        "click",
        closeOnNavigation,
        true
      );
    };
  }, [open]);

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
    setExcludedUnmatchedKeys(new Set());
    setUnmatchedDirectEmails({});
    setEditingUnmatchedEmailKey(null);
  }, [fileMode, sourceFile, files]);

  useEffect(() => {
    let host: HTMLElement | null = null;
    const placeInAdminToolbar = () => {
      const databaseButton = Array.from(
        document.querySelectorAll("button")
      ).find(
        (node) =>
          node.textContent?.trim() === "DATABASE" &&
          (node as HTMLElement).offsetParent !== null
      ) as HTMLElement | undefined;

      const toolbar = databaseButton?.parentElement || null;
      const exitButton = toolbar
        ? (Array.from(toolbar.children).find(
            (node) =>
              node instanceof HTMLButtonElement &&
              node.textContent?.trim() === "ESCI"
          ) as HTMLElement | undefined)
        : undefined;

      if (!toolbar || !exitButton) {
        if (host?.isConnected) host.remove();
        host = null;
        setPortalHost(null);
        return;
      }

      if (!host || !host.isConnected) {
        host = document.createElement("span");
        host.setAttribute(
          "data-outlook-email-admin-slot",
          "true"
        );
        host.style.display = "contents";
      }

      if (
        host.parentElement !== toolbar ||
        host.nextSibling !== exitButton
      ) {
        toolbar.insertBefore(host, exitButton);
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
          dm: String(item?.dm || ""),
          report_notify: item?.report_notify === true,
          agent_id: item?.agent_id
            ? Number(item.agent_id)
            : null,
        }))
        .filter(
          (item) =>
            item.agenzia || item.email || item.allegato || item.dm
        );
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
        dm: agent.dm.trim(),
        report_notify: agent.report_notify === true,
        agent_id: agent.agent_id || null,
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
      window.dispatchEvent(
        new Event("email-recipient-list-updated")
      );
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

  useEffect(() => {
    if (
      !open ||
      activeView !== "matches" ||
      !targetMatchAgency ||
      !agents.length
    ) {
      return;
    }

    const targetKey = normalize(targetMatchAgency);
    const targetIndex = agents.findIndex(
      (agent) => normalize(agent.agenzia) === targetKey
    );

    if (targetIndex < 0) {
      setEditingRecipients(true);
      setAgents((current) => [
        ...current,
        {
          agenzia: targetMatchAgency.toLocaleUpperCase("it"),
          email: "",
          allegato: "",
          dm: "",
          report_notify: false,
          agent_id: null,
        },
      ]);
      setDirty(true);
      setNotice(
        targetMatchAgency.toLocaleUpperCase("it") +
          ": riga preparata. Seleziona il LOGIN DI RIFERIMENTO e poi premi SALVA ELENCO ONLINE."
      );
      return;
    }

    setNotice(
      targetMatchAgency.toLocaleUpperCase("it") +
        ": seleziona il LOGIN DI RIFERIMENTO nella riga evidenziata e poi premi SALVA ELENCO ONLINE."
    );

    const timer = window.setTimeout(() => {
      const row = document.querySelector(
        '[data-login-reference-row="' + targetIndex + '"]'
      ) as HTMLElement | null;

      row?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      const select = row?.querySelector(
        '[data-login-reference-select="true"]'
      ) as HTMLSelectElement | null;

      select?.focus();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    open,
    activeView,
    targetMatchAgency,
    agents.length,
  ]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void (async () => {
      try {
        const rows = await adminAgentList("ALL");
        if (!cancelled) setReportAccounts(rows);
      } catch (error) {
        console.error("LOAD REPORT ACCOUNTS ERROR:", error);
        if (!cancelled) setReportAccounts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!reportAccounts.length) return;

    const accountByName = new Map(
      reportAccounts.map((account) => [
        normalize(
          `${account.nome || ""} ${account.cognome || ""}`
        ),
        account,
      ])
    );

    let changed = false;
    const next = agents.map((agent) => {
      if (agent.agent_id || !agent.report_notify) {
        return agent;
      }

      const match = accountByName.get(
        normalize(agent.agenzia)
      );
      if (!match?.id) return agent;

      changed = true;
      return {
        ...agent,
        agent_id: Number(match.id),
      };
    });

    if (changed) {
      setAgents(next);
      setDirty(true);
    }
  }, [reportAccounts, agents]);

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

  const unassociatedSourceAgencies = useMemo(
    () => sourceAgencies.filter((_, sourceIndex) => !assignment.usedSources.has(sourceIndex)),
    [sourceAgencies, assignment]
  );

  const unmatchedManualSources = useMemo(
    () =>
      fileMode === "separate"
        ? manualSources.filter((_, sourceIndex) => !manualAssignment.usedSources.has(sourceIndex))
        : [],
    [fileMode, manualSources, manualAssignment]
  );

  const nonAssignedSourceAgencies = useMemo(
    () =>
      unassociatedSourceAgencies.filter((source) => {
        if (excludedUnmatchedKeys.has(source.key)) return false;
        return !isValidEmail(unmatchedDirectEmails[source.key] || "");
      }),
    [unassociatedSourceAgencies, excludedUnmatchedKeys, unmatchedDirectEmails]
  );

  useEffect(() => {
    let cancelled = false;
    if (fileMode !== "single" || !nonAssignedSourceAgencies.length) {
      setNonAssignedFile(null);
      return;
    }

    void buildNonAssignedWorkbook(
      nonAssignedSourceAgencies,
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
  }, [fileMode, nonAssignedSourceAgencies, generatedByAgency, preferredAgencyHeader, sourceFile]);

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

  const directUnmatchedRows = useMemo<PreparedRow[]>(() => {
    if (fileMode === "single") {
      return unassociatedSourceAgencies
        .filter(
          (source) =>
            !excludedUnmatchedKeys.has(source.key) &&
            isValidEmail(unmatchedDirectEmails[source.key] || "")
        )
        .map((source) => ({
          agenzia: source.label,
          email: (unmatchedDirectEmails[source.key] || "").trim(),
          allegato: source.fileName,
          dm: "",
          report_notify: false,
          file: generatedByAgency.get(source.key) || null,
          sourceLabel: source.label,
        }))
        .filter((row) => Boolean(row.file));
    }

    return unmatchedManualSources
      .filter(
        (source) =>
          !excludedUnmatchedKeys.has(source.key) &&
          isValidEmail(unmatchedDirectEmails[source.key] || "")
      )
      .map((source) => {
        const sourceIndex = manualSources.findIndex((item) => item.key === source.key);
        return {
          agenzia: source.label,
          email: (unmatchedDirectEmails[source.key] || "").trim(),
          allegato: source.fileName,
          dm: "",
          report_notify: false,
          file: sourceIndex >= 0 ? files[sourceIndex] || null : null,
          sourceLabel: source.label,
        };
      })
      .filter((row) => Boolean(row.file));
  }, [fileMode, unassociatedSourceAgencies, unmatchedManualSources, excludedUnmatchedKeys, unmatchedDirectEmails, generatedByAgency, manualSources, files]);

  const readyRows = useMemo(
    () => [
      ...matched.filter((row, index) => !removedRows.has(index) && row.file && row.email.trim()),
      ...directUnmatchedRows,
    ],
    [matched, removedRows, directUnmatchedRows]
  );

  const filesWithMissingEmail = useMemo(
    () => matched.filter((row, index) => !removedRows.has(index) && row.file && !row.email.trim()),
    [matched, removedRows]
  );

  const unresolvedManualSources = useMemo(
    () =>
      unmatchedManualSources.filter((source) => {
        if (excludedUnmatchedKeys.has(source.key)) return false;
        return !isValidEmail(unmatchedDirectEmails[source.key] || "");
      }),
    [unmatchedManualSources, excludedUnmatchedKeys, unmatchedDirectEmails]
  );

  const recipientsWithoutSourceData = useMemo(
    () => agents.filter((agent, agentIndex) => !isNonAssignedAgent(agent) && !assignment.byAgent.has(agentIndex)),
    [agents, assignment]
  );

  const dmSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          agents
            .map((agent) => agent.dm.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "it")),
    [agents]
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

  const emailMatchedSummary = useMemo(
    () =>
      matched
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row }) =>
            Boolean(row.file) && !isNonAssignedAgent(row)
        ),
    [matched]
  );

  const emailUnmatchedSummary = useMemo(
    () =>
      fileMode === "single"
        ? unassociatedSourceAgencies.map((item) => ({
            key: item.key,
            label: item.label,
            file: generatedByAgency.get(item.key) || null,
          }))
        : unmatchedManualSources.map((item) => {
            const sourceIndex = manualSources.findIndex((source) => source.key === item.key);
            return {
              key: item.key,
              label: item.label,
              file: sourceIndex >= 0 ? files[sourceIndex] || null : null,
            };
          }),
    [fileMode, unassociatedSourceAgencies, generatedByAgency, unmatchedManualSources, manualSources, files]
  );

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
          dm: String(row.DM ?? row.Dm ?? row.dm ?? "").trim(),
          report_notify: ["SI", "SÌ", "TRUE", "1", "X", "YES"].includes(
            String(
              row.REPORT ??
                row.Report ??
                row.report ??
                row.REPORT_NOTIFY ??
                row.report_notify ??
                ""
            )
              .trim()
              .toUpperCase()
          ),
        }))
        .filter(
          (row) => row.agenzia || row.email || row.allegato || row.dm
        );
      if (!parsed.length) throw new Error("Il file deve avere le colonne AGENZIA, EMAIL e ALLEGATO.");
      setAgents(parsed);
      setRemovedRows(new Set());
      setDirty(true);
      setEditingRecipients(false);
      setPendingRecipientFile(null);
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
      const lines = ["CONTROLLO ABBINAMENTO EMAIL", ""];
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

  const updateAgent = (
    index: number,
    fieldName: keyof AgentRow,
    value: AgentRow[keyof AgentRow]
  ) => {
    setAgents((current) =>
      current.map((agent, i) =>
        i === index ? { ...agent, [fieldName]: value } : agent
      )
    );
    setDirty(true);
  };

  const deleteAgent = (index: number) => {
    setAgents((current) => current.filter((_, i) => i !== index));
    setRemovedRows(new Set());
    setDirty(true);
  };

  const addAgent = () => {
    setAgents((current) => [
      ...current,
      { agenzia: "", email: "", allegato: "", dm: "", report_notify: false, agent_id: null },
    ]);
    setEditingRecipients(true);
    setDirty(true);
  };

  const switchFileMode = (mode: FileMode) => {
    setFileMode(mode);
    setFiles([]);
    setPendingSourceFile(null);
    setPendingSeparateFiles([]);
    setSourceFile(null);
    setSourceAgencies([]);
    setGeneratedByAgency(new Map());
    setSplitWarnings([]);
    setNonAssignedFile(null);
    setNotice("");
  };

  const openFilePreview = (agency: string, fileName?: string) => {
    if (!fileName) return;
    window.dispatchEvent(
      new CustomEvent("outlook-email-open-preview", {
        detail: { agency, fileName },
      })
    );
  };

  const toggleMatchedRemoved = (index: number) => {
    setRemovedRows((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleUnmatchedExcluded = (key: string) => {
    setExcludedUnmatchedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const createLocalDrafts = async () => {
    setNotice("");
    if (!subject.trim()) return setNotice("Inserisci l'oggetto della mail.");
    if (!files.length) return setNotice(fileMode === "single" ? "Carica prima il file unico." : "Carica prima i file degli agenti.");
    if (fileMode === "single" && nonAssignedSourceAgencies.length && !nonAssignedConfigured) return setNotice(`Ci sono ${nonAssignedSourceAgencies.length} agenzie del file senza nominativo associato. Inserisci un'email diretta oppure configura “NON ASSEGNATI”.`);
    if (fileMode === "single" && nonAssignedSourceAgencies.length && nonAssignedConfigured && !nonAssignedFile) return setNotice("Sto preparando il file NON ASSEGNATI con il nome del file originale. Attendi un istante e riprova.");
    if (fileMode === "separate" && unresolvedManualSources.length) return setNotice(`Ci sono ${unresolvedManualSources.length} file non associati. Inserisci un'email diretta oppure escludili dall'invio.`);
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
  const hasAssociationAlerts =
    (nonAssignedSourceAgencies.length > 0 && !nonAssignedConfigured) ||
    unresolvedManualSources.length > 0 ||
    splitWarnings.length > 0;

  const renderRecipientEditButtons = () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {editingRecipients && (
        <button
          onClick={addAgent}
          style={{
            ...button,
            background: "#dcfce7",
            color: "#166534",
            padding: "7px 11px",
          }}
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
  );

  return (
    <>
      {portalHost && createPortal(
        <button
          onClick={() => {
            setActiveView("email");
            setOpen(true);
          }}
          style={{
            ...button,
            background: "#2563eb",
            color: "white",
            marginRight: 8,
          }}
        >
          ✉️ INVIO EMAIL
        </button>,
        portalHost
      )}

      {open && (
        <div
          style={{
            position: "fixed",
            top: overlayTop,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100vw",
            maxWidth: "100vw",
            boxSizing: "border-box",
            zIndex: 9999,
            background: "#f8fafc",
            overflowY: "auto",
            overflowX: "hidden",
            color: "#0f172a",
            borderTop: "1px solid #dbe5f2",
          }}
        >
          <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto", padding: "20px clamp(12px, 2vw, 20px)", boxSizing: "border-box", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap" }}>
              <div
                className="ge-section-hero ge-section-hero--email"
                style={{ flex: "1 1 620px", marginBottom: 0 }}
              >
                <div className="ge-section-hero__icon">✉</div>
                <div>
                  <div className="ge-section-hero__title">INVIO EMAIL</div>
                  <div className="ge-section-hero__subtitle">
                    Prepara comunicazioni, allegati e bozze Outlook.
                  </div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ ...button, background: "#e2e8f0" }}>Chiudi</button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
                padding: 6,
                borderRadius: 12,
                background: "#e2e8f0",
                width: "fit-content",
                maxWidth: "100%",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveView("email")}
                style={{
                  ...button,
                  background:
                    activeView === "email" ? "#2563eb" : "transparent",
                  color:
                    activeView === "email" ? "white" : "#0f172a",
                }}
              >
                ✉ INVIO EMAIL
              </button>
              <button
                type="button"
                onClick={() => setActiveView("matches")}
                style={{
                  ...button,
                  background:
                    activeView === "matches" ? "#7c3aed" : "transparent",
                  color:
                    activeView === "matches" ? "white" : "#0f172a",
                }}
              >
                ⇄ CONTROLLO ABBINAMENTO EMAIL
              </button>
              <button
                type="button"
                onClick={() => setActiveView("report")}
                style={{
                  ...button,
                  background:
                    activeView === "report" ? "#16a34a" : "transparent",
                  color:
                    activeView === "report" ? "white" : "#0f172a",
                }}
              >
                🔔 INVIO NOTIFICA REPORT
              </button>
            </div>

            {activeView === "email" && (
              <>

            <div style={{ ...card, marginBottom: 16, background: "#ecfdf5", borderColor: "#a7f3d0" }}>
              <strong>✓ Nessun collegamento Outlook richiesto</strong>
              <div style={{ marginTop: 6, color: "#475569" }}>I nominativi possono essere salvati online. I file Excel restano sul dispositivo.</div>
              <div style={{ marginTop: 8, fontSize: 13, color: dirty ? "#b45309" : "#64748b", fontWeight: dirty ? 700 : 400 }}>
                {dirty ? "Hai modifiche ai nominativi non ancora salvate online." : savedAt ? `Ultimo salvataggio nominativi: ${new Date(savedAt).toLocaleString("it-IT")}` : "Nessun salvataggio online rilevato."}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={card}>
                <strong>1. File da allegare</strong>
                <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <button onClick={() => switchFileMode("single")} style={{ ...button, background: fileMode === "single" ? "#2563eb" : "#e2e8f0", color: fileMode === "single" ? "white" : "#0f172a" }}>File unico (consigliato)</button>
                  <button onClick={() => switchFileMode("separate")} style={{ ...button, background: fileMode === "separate" ? "#2563eb" : "#e2e8f0", color: fileMode === "separate" ? "white" : "#0f172a" }}>File già separati</button>
                </div>

                {fileMode === "single" ? (
                  <>
                    <p style={{ color: "#64748b", fontSize: 14 }}>Carica il file completo. La webapp crea un Excel per ogni agenzia e riconosce anche nomi scritti in ordine diverso o con parole aggiuntive.</p>
                    <label style={{ fontSize: 13, color: "#475569" }}>Nome colonna agenzia</label>
                    <input style={{ ...field, marginTop: 6, marginBottom: 8 }} value={preferredAgencyHeader} onChange={(e) => setPreferredAgencyHeader(e.target.value)} placeholder="AGENZIA" />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="file" accept=".xlsx,.xls,.xlsm" onChange={(e) => setPendingSourceFile(e.target.files?.[0] || null)} />
                      <button
                        type="button"
                        disabled={!pendingSourceFile || splitBusy}
                        onClick={async () => {
                          if (!pendingSourceFile) return;
                          await splitSourceWorkbook(pendingSourceFile);
                          setPendingSourceFile(null);
                        }}
                        style={{ ...button, padding: "7px 12px", background: pendingSourceFile ? "#2563eb" : "#cbd5e1", color: "white", opacity: pendingSourceFile ? 1 : 0.65 }}
                      >
                        CARICA
                      </button>
                    </div>
                    {sourceFile && <div style={{ marginTop: 8, fontSize: 13, color: "#166534", fontWeight: 700 }}>✓ Caricato: {sourceFile.name}</div>}
                    <div style={{ marginTop: 10, fontWeight: 700 }}>{splitBusy ? "Sto dividendo il file..." : `${files.length} file generati automaticamente`}</div>
                  </>
                ) : (
                  <>
                    <p style={{ color: "#64748b", fontSize: 14 }}>Seleziona tutti i file già separati. La webapp prova ad abbinarli anche se il nome è scritto in modo leggermente diverso.</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="file" multiple onChange={(e) => setPendingSeparateFiles(Array.from(e.target.files || []))} />
                      <button
                        type="button"
                        disabled={!pendingSeparateFiles.length}
                        onClick={() => {
                          handleSeparateFiles(pendingSeparateFiles);
                          setPendingSeparateFiles([]);
                        }}
                        style={{ ...button, padding: "7px 12px", background: pendingSeparateFiles.length ? "#2563eb" : "#cbd5e1", color: "white", opacity: pendingSeparateFiles.length ? 1 : 0.65 }}
                      >
                        CARICA
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontWeight: 700 }}>{files.length} file caricati</div>
                  </>
                )}
              </div>
            </div>

            {(hasAssociationAlerts || (fileMode === "single" && sourceAgencies.length > 0)) && (
              <div style={{ ...card, marginBottom: 16, background: hasAssociationAlerts ? "#fff7ed" : "#ecfdf5", borderColor: hasAssociationAlerts ? "#fdba74" : "#a7f3d0" }}>
                <strong>{hasAssociationAlerts ? "⚠️ Controllo associazioni" : "✓ Associazioni file corrette"}</strong>
                {fileMode === "single" && sourceAgencies.length > 0 && <div style={{ marginTop: 8 }}>Trovate <strong>{sourceAgencies.length}</strong> agenzie nel file; <strong>{readyRows.length}</strong> email sono pronte.</div>}
                {!!nonAssignedSourceAgencies.length && nonAssignedConfigured && <div style={{ marginTop: 8, color: "#166534" }}><strong>{nonAssignedSourceAgencies.length} agenzie non associate</strong> saranno raccolte nel file <strong>NON ASSEGNATI.xlsx</strong> e inviate a <strong>{nonAssignedAgent?.email}</strong>.</div>}
                {!!nonAssignedSourceAgencies.length && !nonAssignedConfigured && <div style={{ marginTop: 8, color: "#9a3412" }}><strong>Agenzie del file senza destinatario ({nonAssignedSourceAgencies.length}):</strong> {nonAssignedSourceAgencies.map((item) => item.label).join(", ")}<div style={{ marginTop: 4 }}>Puoi indicare un'email diretta nel riepilogo oppure configurare <strong>NON ASSEGNATI</strong>.</div></div>}
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

            {notice && <div style={{ ...card, marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe" }}>{notice}</div>}

            {(files.length > 0 || sourceFile) && (
              <div
                style={{
                  ...card,
                  marginBottom: 16,
                  borderColor: "#cbd5e1",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <strong>RIEPILOGO ABBINAMENTI DEL FILE</strong>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      Verifica chi riceverà il proprio file e quali nominativi
                      finiranno nel riepilogo NON ASSEGNATI.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit,minmax(280px,1fr))",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #86efac",
                      background: "#f0fdf4",
                      borderRadius: 12,
                      padding: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <strong style={{ color: "#166534" }}>
                        ✓ ABBINATI
                      </strong>
                      <span
                        style={{
                          background: "#16a34a",
                          color: "white",
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {emailMatchedSummary.length}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 7,
                        maxHeight: 340,
                        overflowY: "auto",
                      }}
                    >
                      {emailMatchedSummary.map(({ row, index }) => {
                        const removed = removedRows.has(index);
                        return (
                          <div
                            key={`matched-summary-${index}`}
                            style={{
                              padding: "8px 9px",
                              borderRadius: 9,
                              background: "white",
                              border: "1px solid #dcfce7",
                              opacity: removed ? 0.65 : 1,
                            }}
                          >
                            <div style={{ fontWeight: 800, overflowWrap: "anywhere" }}>
                              {row.agenzia || row.sourceLabel || "—"}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 12, color: "#64748b", overflowWrap: "anywhere" }}>
                              {row.file?.name || "File associato"}
                            </div>
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 12,
                                color: removed || !row.email.trim() ? "#b91c1c" : "#166534",
                                fontWeight: 700,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {removed
                                ? "NON INVIATA · esclusa manualmente"
                                : row.email.trim()
                                  ? row.email
                                  : "EMAIL MANCANTE"}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  openFilePreview(
                                    row.agenzia || row.sourceLabel || "File",
                                    row.file?.name
                                  )
                                }
                                style={{
                                  ...button,
                                  padding: "6px 9px",
                                  background: "#dbeafe",
                                  color: "#1d4ed8",
                                  fontSize: 12,
                                }}
                              >
                                👁 Anteprima
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleMatchedRemoved(index)}
                                style={{
                                  ...button,
                                  padding: "6px 9px",
                                  background: removed ? "#dcfce7" : "#fee2e2",
                                  color: removed ? "#166534" : "#991b1b",
                                  fontSize: 12,
                                }}
                              >
                                {removed ? "↩ Ripristina" : "✕ Elimina"}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {!emailMatchedSummary.length && (
                        <div
                          style={{
                            padding: 10,
                            color: "#64748b",
                            fontSize: 13,
                          }}
                        >
                          Nessun nominativo abbinato.
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #fdba74",
                      background: "#fff7ed",
                      borderRadius: 12,
                      padding: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <strong style={{ color: "#9a3412" }}>
                        ⚠ NON ABBINATI
                      </strong>
                      <span
                        style={{
                          background: "#f97316",
                          color: "white",
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {emailUnmatchedSummary.length}
                      </span>
                    </div>

                    {fileMode === "single" && (
                      <div
                        style={{
                          marginBottom: 10,
                          padding: "8px 9px",
                          borderRadius: 9,
                          background: "white",
                          border: "1px solid #fed7aa",
                          fontSize: 12,
                          color: nonAssignedConfigured
                            ? "#166534"
                            : "#b91c1c",
                          fontWeight: 700,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {nonAssignedConfigured
                          ? `Questi nominativi vengono raccolti automaticamente in NON ASSEGNATI.xlsx e inviati a ${nonAssignedAgent?.email || ""}.`
                          : "Per l'invio automatico dei non abbinati configura il nominativo NON ASSEGNATI con il tuo indirizzo email."}
                      </div>
                    )}

                    {fileMode === "separate" && (
                      <div
                        style={{
                          marginBottom: 10,
                          fontSize: 12,
                          color: "#9a3412",
                          fontWeight: 700,
                        }}
                      >
                        Con i file già separati, i file non abbinati non vengono
                        inviati automaticamente.
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gap: 7,
                        maxHeight: 340,
                        overflowY: "auto",
                      }}
                    >
                      {emailUnmatchedSummary.map((item, index) => {
                        const excluded = excludedUnmatchedKeys.has(item.key);
                        const directEmail = unmatchedDirectEmails[item.key] || "";
                        const directReady = !excluded && isValidEmail(directEmail);
                        const editingEmail = editingUnmatchedEmailKey === item.key;

                        return (
                          <div
                            key={`unmatched-summary-${index}-${item.key}`}
                            data-email-unmatched-summary="true"
                            data-email-agency={item.label}
                            data-email-direct-email={directReady ? directEmail.trim() : ""}
                            data-email-file-name={item.file?.name || ""}
                            data-email-removed={excluded ? "true" : "false"}
                            style={{
                              padding: "8px 9px",
                              borderRadius: 9,
                              background: "white",
                              border: "1px solid #ffedd5",
                              overflowWrap: "anywhere",
                              opacity: excluded ? 0.65 : 1,
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>{item.label}</div>

                            {directReady && (
                              <div style={{ marginTop: 4, fontSize: 12, color: "#166534", fontWeight: 800 }}>
                                INVIO DIRETTO · {directEmail.trim()}
                              </div>
                            )}

                            {excluded && (
                              <div style={{ marginTop: 4, fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>
                                NON INVIATA · esclusa manualmente
                              </div>
                            )}

                            {!excluded && !directReady && fileMode === "single" && (
                              <div style={{ marginTop: 4, fontSize: 11, color: "#9a3412", fontWeight: 700 }}>
                                Destinazione: NON ASSEGNATI
                              </div>
                            )}

                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() => openFilePreview(item.label, item.file?.name)}
                                disabled={!item.file}
                                style={{
                                  ...button,
                                  padding: "6px 9px",
                                  background: "#dbeafe",
                                  color: "#1d4ed8",
                                  fontSize: 12,
                                  opacity: item.file ? 1 : 0.5,
                                }}
                              >
                                👁 Anteprima
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleUnmatchedExcluded(item.key)}
                                style={{
                                  ...button,
                                  padding: "6px 9px",
                                  background: excluded ? "#dcfce7" : "#fee2e2",
                                  color: excluded ? "#166534" : "#991b1b",
                                  fontSize: 12,
                                }}
                              >
                                {excluded ? "↩ Ripristina" : "✕ Elimina"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingUnmatchedEmailKey((current) =>
                                    current === item.key ? null : item.key
                                  )
                                }
                                style={{
                                  ...button,
                                  padding: "6px 9px",
                                  background: directReady ? "#dcfce7" : "#e0e7ff",
                                  color: directReady ? "#166534" : "#3730a3",
                                  fontSize: 12,
                                }}
                              >
                                ✉ Email
                              </button>
                            </div>

                            {editingEmail && (
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                                <input
                                  type="email"
                                  value={directEmail}
                                  onChange={(event) =>
                                    setUnmatchedDirectEmails((current) => ({
                                      ...current,
                                      [item.key]: event.target.value,
                                    }))
                                  }
                                  placeholder="email destinatario"
                                  style={{
                                    ...field,
                                    padding: "7px 9px",
                                    fontSize: 12,
                                    flex: "1 1 220px",
                                    minWidth: 0,
                                  }}
                                />
                                {!!directEmail.trim() && !isValidEmail(directEmail) && (
                                  <span style={{ color: "#b91c1c", fontSize: 11, fontWeight: 800 }}>
                                    Email non valida
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {!emailUnmatchedSummary.length && (
                        <div
                          style={{
                            padding: 10,
                            color: "#166534",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          Tutti i nominativi risultano abbinati.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 30, flexWrap: "wrap" }}>
              <button onClick={() => { setSubject(""); setBody(""); setNotice(""); }} style={{ ...button, background: "#e2e8f0" }}>Pulisci messaggio</button>
              <button disabled={busy || splitBusy || !readyRows.length} onClick={createLocalDrafts} style={{ ...button, background: "#16a34a", color: "white", opacity: busy || splitBusy || !readyRows.length ? 0.55 : 1 }}>{busy ? "Creo il pacchetto..." : `Scarica ${readyRows.length || ""} bozze Outlook (.zip)`}</button>
            </div>
              </>
            )}

            {activeView === "report" && (
              <ReportNotificationPanel
                agents={agents}
                dirty={dirty}
                onOpenMatches={() => setActiveView("matches")}
              />
            )}

            {activeView === "matches" && (
              <>
                <div style={{ ...card, marginBottom: 16 }}>
                  <strong>Elenco destinatari</strong>
                  <p style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>Importa l'Excel AGENZIA / EMAIL / ALLEGATO oppure usa l'elenco salvato online. Il campo ALLEGATO viene usato come Parole chiave agente.</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="file" accept=".xlsx,.xls" onChange={(e) => setPendingRecipientFile(e.target.files?.[0] || null)} />
                    <button
                      type="button"
                      disabled={!pendingRecipientFile}
                      onClick={() => pendingRecipientFile && void importRecipientsExcel(pendingRecipientFile)}
                      style={{ ...button, padding: "7px 12px", background: pendingRecipientFile ? "#2563eb" : "#cbd5e1", color: "white", opacity: pendingRecipientFile ? 1 : 0.65 }}
                    >
                      CARICA
                    </button>
                  </div>
                  <div style={{ marginTop: 10, fontWeight: 700 }}>{agents.length} nominativi presenti</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button onClick={() => void saveRecipients()} disabled={syncBusy} style={{ ...button, background: "#16a34a", color: "white", opacity: syncBusy ? 0.6 : 1, padding: "7px 11px" }}>{syncBusy ? "Sincronizzo..." : "Salva elenco online"}</button>
                    <button onClick={() => void loadSavedRecipients(true)} disabled={syncBusy} style={{ ...button, background: "#e2e8f0", opacity: syncBusy ? 0.6 : 1, padding: "7px 11px" }}>Ricarica elenco</button>
                  </div>
                </div>

                <div
                  style={{
                    ...card,
                    marginBottom: 16,
                    background: "#f5f3ff",
                    borderColor: "#c4b5fd",
                  }}
                >
                  <strong>⇄ Controllo abbinamento email</strong>
                  <div
                    style={{
                      marginTop: 6,
                      color: "#64748b",
                      fontSize: 14,
                    }}
                  >
                    Gestisci Agenzia, Email, Allegato previsto, DM e LOGIN DI
                    RIFERIMENTO. Le modifiche restano evidenziate finché non
                    premi Salva elenco online.
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: dirty ? "#b45309" : "#64748b",
                      fontWeight: dirty ? 700 : 400,
                    }}
                  >
                    {dirty
                      ? "Hai modifiche non ancora salvate online."
                      : savedAt
                        ? `Ultimo salvataggio: ${new Date(savedAt).toLocaleString("it-IT")}`
                        : "Nessun salvataggio online rilevato."}
                  </div>
                </div>

            <div style={{ ...card, marginBottom: 16, overflowX: "hidden", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <strong>Controllo abbinamento email</strong>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>{readyRows.length} email pronte. I nominativi senza file associato vengono esclusi.</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {renderRecipientEditButtons()}
                </div>
              </div>

              <datalist id="outlook-email-dm-options">
                {dmSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 12, tableLayout: "fixed" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <th style={{ padding: 5, width: "13%" }}>Agenzia</th>
                    <th style={{ padding: 5, width: "18%" }}>Email</th>
                    <th style={{ padding: 5, width: "12%" }}>Allegato previsto</th>
                    <th style={{ padding: 5, width: "20%" }}>File associato / Stato</th>
                    {editingRecipients && (
                      <th style={{ padding: 5, width: "12%" }}>Azioni</th>
                    )}
                    <th style={{ padding: 5, width: "8%" }}>DM</th>
                    <th style={{ padding: 5, width: "7%", textAlign: "center" }}>
                      REPORT
                    </th>
                    <th style={{ padding: 5, width: "14%" }}>
                      LOGIN DI RIFERIMENTO
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((row, index) => (
                    <tr
                      key={index}
                      data-email-row-index={index}
                      data-login-reference-row={index}
                      data-email-removed={removedRows.has(index) ? "true" : "false"}
                      data-email-file-name={row.file?.name || ""}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        opacity: removedRows.has(index) ? 0.62 : 1,
                        background:
                          targetMatchAgency &&
                          normalize(row.agenzia) === normalize(targetMatchAgency)
                            ? "#fff7ed"
                            : "transparent",
                        outline:
                          targetMatchAgency &&
                          normalize(row.agenzia) === normalize(targetMatchAgency)
                            ? "2px solid #f97316"
                            : "none",
                        outlineOffset: "-2px",
                      }}
                    >
                      <td style={{ padding: 6, overflowWrap: "anywhere" }}>{editingRecipients ? <input style={{ ...smallField, minWidth: 0 }} value={agents[index]?.agenzia ?? ""} onChange={(e) => updateAgent(index, "agenzia", e.target.value)} placeholder="Agenzia" /> : row.agenzia || "—"}</td>
                      <td style={{ padding: 6, overflowWrap: "anywhere" }}>{editingRecipients ? <input style={{ ...smallField, minWidth: 0 }} value={agents[index]?.email ?? ""} onChange={(e) => updateAgent(index, "email", e.target.value)} placeholder="email@esempio.it" type="email" /> : row.email || "—"}</td>
                      <td style={{ padding: 6, overflowWrap: "anywhere" }}>{editingRecipients ? <input style={{ ...smallField, minWidth: 0 }} value={agents[index]?.allegato ?? ""} onChange={(e) => updateAgent(index, "allegato", e.target.value)} placeholder="NOMEFILE.xlsx" /> : row.allegato || "—"}</td>
                      <td style={{ padding: 6, fontWeight: 700, fontSize: 11, lineHeight: 1.2, color: removedRows.has(index) ? "#b91c1c" : row.file && row.email ? "#15803d" : row.file && !row.email ? "#b91c1c" : "#64748b", whiteSpace: "normal", overflowWrap: "anywhere" }}>
                        {removedRows.has(index) ? "Rimosso manualmente — non inviata" : row.file && row.email ? `✓ ${row.file.name}` : row.file && !row.email ? `Email mancante — ${row.file.name}` : fileMode === "single" && sourceAgencies.length ? "Nessun dato nel file — non inviata" : files.length ? "Nessun file associato — non inviata" : "File non caricati"}
                      </td>
                      {editingRecipients && (
                        <td style={{ padding: 5 }}>
                          <button
                            onClick={() => deleteAgent(index)}
                            style={{
                              ...button,
                              background: "#fee2e2",
                              color: "#991b1b",
                              padding: "5px 7px",
                              fontSize: 11,
                            }}
                          >
                            Elimina
                          </button>
                        </td>
                      )}
                      <td style={{ padding: 5, overflowWrap: "anywhere" }}>
                        {editingRecipients ? (
                          <input
                            list="outlook-email-dm-options"
                            value={agents[index]?.dm ?? ""}
                            onChange={(e) =>
                              updateAgent(index, "dm", e.target.value)
                            }
                            placeholder="Scrivi o scegli DM"
                            style={{
                              ...smallField,
                              minWidth: 0,
                            }}
                          />
                        ) : (
                          row.dm || "—"
                        )}
                      </td>
                      <td style={{ padding: 5, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={agents[index]?.report_notify === true}
                          onChange={(e) =>
                            updateAgent(index, "report_notify", e.target.checked)
                          }
                          aria-label={`Abilita notifica Report per ${row.agenzia || row.email || "agente"}`}
                          title="Partecipa agli invii Notifica Report"
                        />
                      </td>
                      <td style={{ padding: 5 }}>
                        <select
                          data-login-reference-select="true"
                          value={agents[index]?.agent_id ?? ""}
                          onChange={(event) =>
                            updateAgent(
                              index,
                              "agent_id",
                              event.target.value
                                ? Number(event.target.value)
                                : null
                            )
                          }
                          style={{
                            ...smallField,
                            minWidth: 0,
                            background: agents[index]?.agent_id
                              ? "#f0fdf4"
                              : "#fff7ed",
                          }}
                        >
                          <option value="">NON ASSOCIATO</option>
                          {reportAccounts.map((account) => (
                            <option
                              key={account.id}
                              value={account.id}
                            >
                              {`${account.nome} ${account.cognome}`.toLocaleUpperCase("it")} · {account.username}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!matched.length && <tr><td colSpan={editingRecipients ? 8 : 7} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>Nessun nominativo presente.</td></tr>}
                </tbody>
              </table>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 12,
                }}
              >
                {renderRecipientEditButtons()}
              </div>
            </div>



                {notice && (
                  <div
                    style={{
                      ...card,
                      marginBottom: 16,
                      background: "#eff6ff",
                      borderColor: "#bfdbfe",
                    }}
                  >
                    {notice}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
