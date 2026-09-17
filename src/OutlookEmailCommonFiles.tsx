import { useEffect, useRef } from "react";
import JSZip from "jszip";

type Recipient = { agency: string; email: string };

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

const sanitizeFileName = (value: string) =>
  String(value || "email")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "email";

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

async function buildEml(recipient: Recipient, subject: string, body: string, files: File[]) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    "X-Unsent: 1",
    `To: ${recipient.email}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(utf8ToBase64(body)),
    "",
  ];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encodedName = encodeRfc5987(file.name);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.type || "application/octet-stream"}; name*=UTF-8''${encodedName}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename*=UTF-8''${encodedName}`,
      "",
      wrapBase64(bytesToBase64(bytes)),
      ""
    );
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

function findFileArea() {
  const separateButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "File già separati" && button.offsetParent !== null
  );
  if (!separateButton?.parentElement?.parentElement) return null;
  const row = separateButton.parentElement;
  const card = row.parentElement;
  const singleButton = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "File unico (consigliato)"
  );
  if (!singleButton) return null;
  return { row, card, singleButton, separateButton };
}

function findEmailTable() {
  return Array.from(document.querySelectorAll<HTMLTableElement>("table")).find((table) =>
    Array.from(table.querySelectorAll("thead th")).some((th) =>
      (th.textContent || "").includes("File associato / Stato")
    )
  );
}

function readRecipients(): Recipient[] {
  const table = findEmailTable();
  if (!table) return [];
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const agencyIndex = headers.findIndex((th) => (th.textContent || "").trim() === "Agenzia");
  const emailIndex = headers.findIndex((th) => (th.textContent || "").trim() === "Email");
  if (agencyIndex < 0 || emailIndex < 0) return [];

  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
    .filter((row) => row.dataset.emailRemoved !== "true")
    .map((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
      const agencyInput = cells[agencyIndex]?.querySelector<HTMLInputElement>("input");
      const emailInput = cells[emailIndex]?.querySelector<HTMLInputElement>("input");
      return {
        agency: (agencyInput?.value || cells[agencyIndex]?.textContent || "").trim(),
        email: (emailInput?.value || cells[emailIndex]?.textContent || "").trim(),
      };
    })
    .filter((item) => item.email);
}

function readMessage() {
  const title = Array.from(document.querySelectorAll("strong")).find(
    (node) => (node.textContent || "").trim() === "3. Messaggio"
  );
  const card = title?.parentElement;
  return {
    subject: card?.querySelector<HTMLInputElement>('input:not([type="file"])')?.value.trim() || "",
    body: card?.querySelector<HTMLTextAreaElement>("textarea")?.value || "",
  };
}

export default function OutlookEmailCommonFiles() {
  const activeRef = useRef(false);
  const filesRef = useRef<File[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    let timer = 0;

    const restoreOriginal = () => {
      const found = findFileArea();
      if (!found) return;
      Array.from(found.card.children).forEach((child) => {
        const el = child as HTMLElement;
        if (el.dataset.commonHidden === "true") {
          el.style.display = el.dataset.commonDisplay || "";
          delete el.dataset.commonHidden;
          delete el.dataset.commonDisplay;
        }
      });
    };

    const hideOriginal = () => {
      const found = findFileArea();
      if (!found) return;
      let afterButtons = false;
      Array.from(found.card.children).forEach((child) => {
        if (child === found.row) {
          afterButtons = true;
          return;
        }
        if (!afterButtons) return;
        const el = child as HTMLElement;
        if (el.dataset.commonPanel === "true") return;
        if (el.dataset.commonHidden !== "true") {
          el.dataset.commonHidden = "true";
          el.dataset.commonDisplay = el.style.display || "";
          el.style.display = "none";
        }
      });
    };

    const refreshPanel = () => {
      if (!activeRef.current) return;
      const panel = document.querySelector<HTMLElement>('[data-common-panel="true"]');
      if (!panel) return;
      const details = panel.querySelector<HTMLElement>('[data-common-details="true"]');
      const download = panel.querySelector<HTMLButtonElement>('[data-common-download="true"]');
      const recipients = readRecipients();
      const fileCount = filesRef.current.length;
      const detailsText = fileCount
        ? `${fileCount} ${fileCount === 1 ? "file caricato" : "file caricati"}: ${filesRef.current.map((file) => file.name).join(", ")}. Destinatari: ${recipients.length}.`
        : `Nessun file caricato. Destinatari disponibili: ${recipients.length}.`;
      if (details && details.textContent !== detailsText) details.textContent = detailsText;
      if (download) {
        const enabled = fileCount > 0 && recipients.length > 0 && !busyRef.current;
        download.disabled = !enabled;
        download.style.opacity = enabled ? "1" : "0.55";
        const label = busyRef.current ? "Creo il pacchetto..." : `Scarica ${recipients.length || ""} bozze Outlook (.zip)`;
        if (download.textContent !== label) download.textContent = label;
      }
    };

    const createDrafts = async () => {
      if (busyRef.current) return;
      const recipients = readRecipients();
      const files = filesRef.current;
      const { subject, body } = readMessage();
      if (!files.length) return window.alert("Carica almeno un file da inviare a tutti.");
      if (!recipients.length) return window.alert("Non trovo destinatari con email.");
      if (!subject) return window.alert("Inserisci l'oggetto della mail.");

      busyRef.current = true;
      refreshPanel();
      try {
        const zip = new JSZip();
        const used = new Set<string>();
        for (let i = 0; i < recipients.length; i += 1) {
          const recipient = recipients[i];
          const eml = await buildEml(recipient, subject, body, files);
          const base = sanitizeFileName(recipient.agency || `email-${i + 1}`);
          let name = `${base}.eml`;
          let n = 2;
          while (used.has(name.toLowerCase())) name = `${base}-${n++}.eml`;
          used.add(name.toLowerCase());
          zip.file(name, eml);
        }
        zip.file("LEGGIMI.txt", `Bozze create: ${recipients.length}\r\nAllegati uguali per tutti: ${files.length}\r\nNessuna mail è stata inviata automaticamente.`);
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, `BOZZE_EMAIL_STESSI_FILE_${new Date().toISOString().slice(0, 10)}.zip`);
      } catch (error: any) {
        window.alert(`Errore nella creazione delle bozze: ${error?.message || error}`);
      } finally {
        busyRef.current = false;
        refreshPanel();
      }
    };

    const ensurePanel = () => {
      const found = findFileArea();
      if (!found) return null;
      let panel = found.card.querySelector<HTMLElement>('[data-common-panel="true"]');
      if (!panel) {
        panel = document.createElement("div");
        panel.dataset.commonPanel = "true";
        panel.style.marginTop = "8px";
        panel.style.padding = "14px";
        panel.style.border = "1px solid #bfdbfe";
        panel.style.borderRadius = "10px";
        panel.style.background = "#eff6ff";

        const text = document.createElement("div");
        text.textContent = "Carica uno o più file: gli stessi allegati saranno inseriti nella mail di tutti i nominativi con email.";
        text.style.color = "#475569";
        text.style.fontSize = "14px";
        text.style.marginBottom = "10px";

        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.addEventListener("change", () => {
          filesRef.current = Array.from(input.files || []);
          refreshPanel();
        });

        const details = document.createElement("div");
        details.dataset.commonDetails = "true";
        details.style.marginTop = "10px";
        details.style.fontWeight = "700";
        details.style.fontSize = "13px";

        const download = document.createElement("button");
        download.type = "button";
        download.dataset.commonDownload = "true";
        download.style.marginTop = "12px";
        download.style.border = "0";
        download.style.borderRadius = "10px";
        download.style.padding = "10px 14px";
        download.style.fontWeight = "700";
        download.style.cursor = "pointer";
        download.style.background = "#16a34a";
        download.style.color = "white";
        download.addEventListener("click", () => void createDrafts());

        const note = document.createElement("div");
        note.textContent = "In questa modalità la colonna di abbinamento individuale viene ignorata: gli stessi file vanno a tutti.";
        note.style.marginTop = "8px";
        note.style.fontSize = "12px";
        note.style.color = "#64748b";

        panel.append(text, input, details, download, note);
        found.row.insertAdjacentElement("afterend", panel);
      }
      return panel;
    };

    const deactivate = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      filesRef.current = [];
      restoreOriginal();
      const panel = document.querySelector<HTMLElement>('[data-common-panel="true"]');
      if (panel) panel.style.display = "none";
    };

    const ensureUi = () => {
      const found = findFileArea();
      if (!found) return;

      if (!found.singleButton.dataset.commonSafeExit) {
        found.singleButton.dataset.commonSafeExit = "true";
        found.singleButton.addEventListener("click", deactivate);
      }
      if (!found.separateButton.dataset.commonSafeExit) {
        found.separateButton.dataset.commonSafeExit = "true";
        found.separateButton.addEventListener("click", deactivate);
      }

      let common = found.row.querySelector<HTMLButtonElement>('[data-common-safe-mode="true"]');
      if (!common) {
        common = document.createElement("button");
        common.type = "button";
        common.dataset.commonSafeMode = "true";
        common.textContent = "Stesso file per tutti";
        common.style.border = "0";
        common.style.borderRadius = "10px";
        common.style.padding = "10px 14px";
        common.style.fontWeight = "700";
        common.style.cursor = "pointer";
        common.addEventListener("click", () => {
          activeRef.current = true;
          hideOriginal();
          const panel = ensurePanel();
          if (panel) panel.style.display = "block";
          refreshPanel();
        });
        found.row.appendChild(common);
      }

      if (activeRef.current) {
        common.style.background = "#2563eb";
        common.style.color = "white";
        hideOriginal();
        const panel = ensurePanel();
        if (panel && panel.style.display !== "block") panel.style.display = "block";
        refreshPanel();
      } else {
        common.style.background = "#e2e8f0";
        common.style.color = "#0f172a";
      }
    };

    ensureUi();
    timer = window.setInterval(ensureUi, 700);

    return () => {
      window.clearInterval(timer);
      restoreOriginal();
      document.querySelector('[data-common-safe-mode="true"]')?.remove();
      document.querySelector('[data-common-panel="true"]')?.remove();
    };
  }, []);

  return null;
}
