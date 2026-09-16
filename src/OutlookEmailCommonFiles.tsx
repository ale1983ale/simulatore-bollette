import { useEffect, useRef } from "react";
import JSZip from "jszip";

type Recipient = {
  agency: string;
  email: string;
};

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
  const bodyBase64 = wrapBase64(utf8ToBase64(body));
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
    bodyBase64,
    "",
  ];

  for (const file of files) {
    const attachmentBytes = new Uint8Array(await file.arrayBuffer());
    const attachmentBase64 = wrapBase64(bytesToBase64(attachmentBytes));
    const encodedName = encodeRfc5987(file.name);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.type || "application/octet-stream"}; name*=UTF-8''${encodedName}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename*=UTF-8''${encodedName}`,
      "",
      attachmentBase64,
      ""
    );
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

function findEmailTable() {
  return Array.from(document.querySelectorAll<HTMLTableElement>("table")).find((table) =>
    Array.from(table.querySelectorAll("thead th")).some((cell) =>
      (cell.textContent || "").includes("File associato / Stato")
    )
  );
}

function readRecipients(): Recipient[] {
  const table = findEmailTable();
  if (!table) return [];
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const agencyIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Agenzia");
  const emailIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Email");
  if (agencyIndex < 0 || emailIndex < 0) return [];

  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
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
  if (!card) return { subject: "", body: "" };
  const subject = card.querySelector<HTMLInputElement>('input:not([type="file"])')?.value || "";
  const body = card.querySelector<HTMLTextAreaElement>("textarea")?.value || "";
  return { subject: subject.trim(), body };
}

function findFileCardAndButtons() {
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
  return { card, row, singleButton, separateButton };
}

export default function OutlookEmailCommonFiles() {
  const activeRef = useRef(false);
  const commonFilesRef = useRef<File[]>([]);
  const buildingRef = useRef(false);

  useEffect(() => {
    let timer = 0;
    let observer: MutationObserver | null = null;

    const restoreOriginalControls = () => {
      const found = findFileCardAndButtons();
      if (!found) return;
      Array.from(found.card.children).forEach((child) => {
        const element = child as HTMLElement;
        if (element.dataset.commonOriginalDisplay !== undefined) {
          element.style.display = element.dataset.commonOriginalDisplay;
          delete element.dataset.commonOriginalDisplay;
        }
      });
    };

    const setOriginalControlsHidden = (hidden: boolean) => {
      const found = findFileCardAndButtons();
      if (!found) return;
      let afterModeRow = false;
      Array.from(found.card.children).forEach((child) => {
        if (child === found.row) {
          afterModeRow = true;
          return;
        }
        if (!afterModeRow) return;
        const element = child as HTMLElement;
        if (element.dataset.commonFilesPanel === "true") return;
        if (hidden) {
          if (element.dataset.commonOriginalDisplay === undefined) {
            element.dataset.commonOriginalDisplay = element.style.display || "";
          }
          element.style.display = "none";
        } else if (element.dataset.commonOriginalDisplay !== undefined) {
          element.style.display = element.dataset.commonOriginalDisplay;
          delete element.dataset.commonOriginalDisplay;
        }
      });
    };

    const updatePanel = () => {
      const panel = document.querySelector<HTMLElement>('[data-common-files-panel="true"]');
      if (!panel) return;
      const details = panel.querySelector<HTMLElement>('[data-common-files-details="true"]');
      if (!details) return;
      const files = commonFilesRef.current;
      details.textContent = files.length
        ? `${files.length} file caricati: ${files.map((file) => file.name).join(", ")}`
        : "Nessun file caricato";
    };

    const ensurePanel = () => {
      const found = findFileCardAndButtons();
      if (!found) return null;
      let panel = found.card.querySelector<HTMLElement>('[data-common-files-panel="true"]');
      if (panel) return panel;

      panel = document.createElement("div");
      panel.dataset.commonFilesPanel = "true";
      panel.style.marginTop = "4px";
      panel.style.padding = "12px";
      panel.style.border = "1px solid #bfdbfe";
      panel.style.borderRadius = "10px";
      panel.style.background = "#eff6ff";

      const text = document.createElement("p");
      text.style.margin = "0 0 10px";
      text.style.color = "#475569";
      text.style.fontSize = "14px";
      text.textContent = "Carica uno o più file: gli stessi allegati verranno inseriti nella mail di tutti i nominativi con un indirizzo email.";

      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.dataset.commonFilesInput = "true";
      input.addEventListener("change", () => {
        commonFilesRef.current = Array.from(input.files || []);
        updatePanel();
        ensureUi();
      });

      const details = document.createElement("div");
      details.dataset.commonFilesDetails = "true";
      details.style.marginTop = "9px";
      details.style.fontWeight = "700";
      details.style.fontSize = "13px";

      panel.append(text, input, details);
      found.row.insertAdjacentElement("afterend", panel);
      updatePanel();
      return panel;
    };

    const updateCommonTable = () => {
      if (!activeRef.current) return;
      const table = findEmailTable();
      if (!table) return;
      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
      const statusIndex = headers.findIndex((cell) =>
        (cell.textContent || "").includes("File associato / Stato")
      );
      const emailIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Email");
      if (statusIndex < 0 || emailIndex < 0) return;

      const attachmentCount = commonFilesRef.current.length;
      Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).forEach((row) => {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        if (cells.length <= Math.max(statusIndex, emailIndex)) return;
        const emailInput = cells[emailIndex]?.querySelector<HTMLInputElement>("input");
        const email = (emailInput?.value || cells[emailIndex]?.textContent || "").trim();
        const statusCell = cells[statusIndex];
        statusCell.style.fontWeight = "700";
        statusCell.style.whiteSpace = "nowrap";
        if (!email) {
          statusCell.textContent = "Email mancante — non inviata";
          statusCell.style.color = "#b91c1c";
        } else if (attachmentCount) {
          statusCell.textContent = `✓ ${attachmentCount} ${attachmentCount === 1 ? "file comune" : "file comuni"}`;
          statusCell.style.color = "#15803d";
        } else {
          statusCell.textContent = "Carica almeno un file comune";
          statusCell.style.color = "#64748b";
        }
      });

      const controlTitle = Array.from(document.querySelectorAll("strong")).find(
        (node) => (node.textContent || "").trim() === "4. Controllo abbinamenti"
      );
      const info = Array.from(controlTitle?.parentElement?.children || []).find(
        (node) => node.tagName === "DIV"
      ) as HTMLElement | undefined;
      if (info) {
        const recipients = readRecipients().length;
        info.textContent = attachmentCount
          ? `${recipients} email pronte. Gli stessi ${attachmentCount} ${attachmentCount === 1 ? "file verranno allegati" : "file verranno allegati"} a tutti.`
          : `${recipients} destinatari disponibili. Carica almeno un file da inviare a tutti.`;
      }
    };

    const updateDownloadButton = () => {
      if (!activeRef.current) return;
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (node) => (node.textContent || "").includes("bozze Outlook")
      );
      if (!button) return;
      const recipients = readRecipients().length;
      const ready = commonFilesRef.current.length > 0 && recipients > 0 && !buildingRef.current;
      button.disabled = !ready;
      button.style.opacity = ready ? "1" : "0.55";
      button.textContent = buildingRef.current
        ? "Creo il pacchetto..."
        : `Scarica ${recipients || ""} bozze Outlook (.zip)`;
    };

    const deactivateCommonMode = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      commonFilesRef.current = [];
      restoreOriginalControls();
      const panel = document.querySelector<HTMLElement>('[data-common-files-panel="true"]');
      if (panel) panel.style.display = "none";
    };

    const ensureModeButtons = () => {
      const found = findFileCardAndButtons();
      if (!found) return;

      if (!found.singleButton.dataset.commonExitBound) {
        found.singleButton.dataset.commonExitBound = "true";
        found.singleButton.addEventListener("click", deactivateCommonMode);
      }
      if (!found.separateButton.dataset.commonExitBound) {
        found.separateButton.dataset.commonExitBound = "true";
        found.separateButton.addEventListener("click", deactivateCommonMode);
      }

      let commonButton = found.row.querySelector<HTMLButtonElement>('[data-common-files-mode="true"]');
      if (!commonButton) {
        commonButton = document.createElement("button");
        commonButton.type = "button";
        commonButton.dataset.commonFilesMode = "true";
        commonButton.textContent = "Stesso file per tutti";
        commonButton.style.border = "0";
        commonButton.style.borderRadius = "10px";
        commonButton.style.padding = "10px 14px";
        commonButton.style.fontWeight = "700";
        commonButton.style.cursor = "pointer";
        commonButton.addEventListener("click", () => {
          activeRef.current = true;
          const panel = ensurePanel();
          if (panel) panel.style.display = "block";
          setOriginalControlsHidden(true);
          ensureUi();
        });
        found.row.appendChild(commonButton);
      }

      if (activeRef.current) {
        found.singleButton.style.background = "#e2e8f0";
        found.singleButton.style.color = "#0f172a";
        found.separateButton.style.background = "#e2e8f0";
        found.separateButton.style.color = "#0f172a";
        commonButton.style.background = "#2563eb";
        commonButton.style.color = "white";
        const panel = ensurePanel();
        if (panel) panel.style.display = "block";
        setOriginalControlsHidden(true);
      } else {
        commonButton.style.background = "#e2e8f0";
        commonButton.style.color = "#0f172a";
      }
    };

    const ensureUi = () => {
      ensureModeButtons();
      if (!activeRef.current) return;
      updatePanel();
      updateCommonTable();
      updateDownloadButton();
    };

    const createCommonDrafts = async () => {
      if (buildingRef.current) return;
      const files = commonFilesRef.current;
      const recipients = readRecipients();
      const { subject, body } = readMessage();

      if (!files.length) return window.alert("Carica almeno un file da inviare a tutti.");
      if (!recipients.length) return window.alert("Non trovo destinatari con un indirizzo email.");
      if (!subject) return window.alert("Inserisci l'oggetto della mail.");

      buildingRef.current = true;
      ensureUi();
      try {
        const zip = new JSZip();
        const usedNames = new Set<string>();
        for (let index = 0; index < recipients.length; index += 1) {
          const recipient = recipients[index];
          const eml = await buildEml(recipient, subject, body, files);
          const baseName = sanitizeFileName(recipient.agency || `email-${index + 1}`);
          let fileName = `${baseName}.eml`;
          let suffix = 2;
          while (usedNames.has(fileName.toLowerCase())) fileName = `${baseName}-${suffix++}.eml`;
          usedNames.add(fileName.toLowerCase());
          zip.file(fileName, eml);
        }
        zip.file(
          "LEGGIMI.txt",
          [
            "BOZZE EMAIL PER OUTLOOK - STESSI FILE PER TUTTI",
            "",
            `Destinatari: ${recipients.length}`,
            `Allegati per ogni destinatario: ${files.length}`,
            ...files.map((file) => `- ${file.name}`),
            "",
            "Apri ciascun .eml, controlla il contenuto e premi Invia manualmente.",
            "Nessuna mail è stata inviata automaticamente.",
          ].join("\r\n")
        );
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, `BOZZE_EMAIL_STESSI_FILE_${new Date().toISOString().slice(0, 10)}.zip`);
      } catch (error: any) {
        window.alert(`Errore nella creazione delle bozze: ${error?.message || error}`);
      } finally {
        buildingRef.current = false;
        ensureUi();
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!activeRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button || !(button.textContent || "").includes("bozze Outlook")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void createCommonDrafts();
    };

    document.addEventListener("click", onClickCapture, true);
    observer = new MutationObserver(() => ensureUi());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    timer = window.setInterval(ensureUi, 500);
    ensureUi();

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      observer?.disconnect();
      window.clearInterval(timer);
      restoreOriginalControls();
      document.querySelector('[data-common-files-mode="true"]')?.remove();
      document.querySelector('[data-common-files-panel="true"]')?.remove();
    };
  }, []);

  return null;
}
