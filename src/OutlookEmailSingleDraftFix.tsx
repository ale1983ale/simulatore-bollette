import { useEffect, useRef } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";

type DraftRow = {
  agency: string;
  email: string;
  fileName: string;
};

type GroupData = {
  label: string;
  sheets: Map<string, unknown[][]>;
};

const normalize = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

const sanitizeFileName = (value: string) =>
  String(value || "file")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "file";

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

async function buildEml(row: DraftRow, file: File, subject: string, body: string) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const attachmentBytes = new Uint8Array(await file.arrayBuffer());
  const attachmentBase64 = wrapBase64(bytesToBase64(attachmentBytes));
  const bodyBase64 = wrapBase64(utf8ToBase64(body));
  const encodedName = encodeRfc5987(file.name);

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
    `Content-Type: ${file.type || "application/octet-stream"}; name*=UTF-8''${encodedName}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename*=UTF-8''${encodedName}`,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function findFileCard(input: HTMLInputElement) {
  let node: HTMLElement | null = input.parentElement;
  while (node && node !== document.body) {
    const directStrong = Array.from(node.children).find(
      (child) =>
        child.tagName === "STRONG" &&
        (child.textContent || "").trim().startsWith("2. File da allegare")
    );
    if (directStrong) return node;
    node = node.parentElement;
  }
  return null;
}

function findPreferredAgencyHeader() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'));
  const field = inputs.find((input) => {
    let node: HTMLElement | null = input.parentElement;
    while (node && node !== document.body) {
      if ((node.textContent || "").includes("Nome colonna agenzia")) return true;
      node = node.parentElement;
    }
    return false;
  });
  return field?.value?.trim() || "AGENZIA";
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
        return { rowIndex, colIndex };
      }
    }
  }
  return null;
}

function extractFileName(statusText: string) {
  const match = String(statusText || "").match(/([^\n—–]+?\.(?:xlsx|xlsm|xls|csv))/i);
  return match ? match[1].replace(/^\s*✓\s*/, "").trim() : "";
}

function readReadyRows(): DraftRow[] {
  const table = Array.from(document.querySelectorAll<HTMLTableElement>("table")).find((candidate) =>
    Array.from(candidate.querySelectorAll("thead th")).some((cell) =>
      (cell.textContent || "").includes("File associato / Stato")
    )
  );
  if (!table) return [];

  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const agencyIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Agenzia");
  const emailIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Email");
  const statusIndex = headers.findIndex((cell) =>
    (cell.textContent || "").includes("File associato / Stato")
  );
  if (agencyIndex < 0 || emailIndex < 0 || statusIndex < 0) return [];

  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
    .map((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
      const agencyInput = cells[agencyIndex]?.querySelector<HTMLInputElement>("input");
      const emailInput = cells[emailIndex]?.querySelector<HTMLInputElement>("input");
      const agency = (agencyInput?.value || cells[agencyIndex]?.textContent || "").trim();
      const email = (emailInput?.value || cells[emailIndex]?.textContent || "").trim();
      const fileName = extractFileName((cells[statusIndex]?.textContent || "").trim());
      return { agency, email, fileName };
    })
    .filter((row) => row.email && row.fileName);
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

async function splitWorkbook(sourceFile: File) {
  const data = await sourceFile.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const preferredHeader = findPreferredAgencyHeader();
  const groups = new Map<string, GroupData>();

  for (const sheetName of workbook.SheetNames) {
    const sourceSheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    if (!matrix.length) continue;

    const detected = detectAgencyColumn(matrix, preferredHeader);
    if (!detected) continue;

    const prefix = matrix.slice(0, detected.rowIndex + 1).map((row) => [...row]);
    for (let rowIndex = detected.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex] || [];
      const label = String(row[detected.colIndex] ?? "").trim();
      const key = normalize(label);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { label, sheets: new Map() });
      const group = groups.get(key)!;
      if (!group.sheets.has(sheetName)) {
        group.sheets.set(sheetName, prefix.map((item) => [...item]));
      }
      group.sheets.get(sheetName)!.push([...row]);
    }
  }

  const generated = new Map<string, File>();
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
    const file = new File([outData], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    generated.set(normalize(fileName), file);
  }

  return generated;
}

export default function OutlookEmailSingleDraftFix() {
  const sourceFileRef = useRef<File | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const onFileChange = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      const card = findFileCard(input);
      if (!card) return;
      const selected = Array.from(input.files || []);
      if (!selected.length) return;

      if (input.multiple) {
        sourceFileRef.current = null;
      } else {
        sourceFileRef.current = selected[0];
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (busyRef.current || !sourceFileRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button") as HTMLButtonElement | null;
      if (!button) return;
      if (button.dataset.commonDownload === "true") return;
      const text = (button.textContent || "").trim();
      if (!text.includes("bozze Outlook") || !text.startsWith("Scarica")) return;

      const readyRows = readReadyRows();
      if (!readyRows.length) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      void (async () => {
        const sourceFile = sourceFileRef.current;
        if (!sourceFile) return;
        const { subject, body } = readMessage();
        if (!subject) {
          window.alert("Inserisci l'oggetto della mail.");
          return;
        }

        busyRef.current = true;
        const oldText = button.textContent || "";
        const oldDisabled = button.disabled;
        button.disabled = true;
        button.textContent = "Creo il pacchetto...";

        try {
          const splitFiles = await splitWorkbook(sourceFile);
          const missing = readyRows.filter((row) => !splitFiles.has(normalize(row.fileName)));
          if (missing.length) {
            throw new Error(
              `Non riesco a ricostruire ${missing.length} file: ${missing
                .slice(0, 5)
                .map((row) => row.fileName)
                .join(", ")}`
            );
          }

          const zip = new JSZip();
          const usedNames = new Set<string>();
          for (let index = 0; index < readyRows.length; index += 1) {
            const row = readyRows[index];
            const file = splitFiles.get(normalize(row.fileName))!;
            const eml = await buildEml(row, file, subject, body);
            const baseName = sanitizeFileName(row.agency || `email-${index + 1}`);
            let emlName = `${baseName}.eml`;
            let suffix = 2;
            while (usedNames.has(emlName.toLowerCase())) emlName = `${baseName}-${suffix++}.eml`;
            usedNames.add(emlName.toLowerCase());
            zip.file(emlName, eml);
          }

          zip.file(
            "LEGGIMI.txt",
            [
              "BOZZE EMAIL PER OUTLOOK",
              "",
              `Bozze create: ${readyRows.length}`,
              `File origine: ${sourceFile.name}`,
              "",
              "Ogni bozza contiene il file separato della relativa agenzia.",
              "Apri ciascun .eml, controlla il contenuto e premi Invia manualmente.",
              "Nessuna mail è stata inviata automaticamente.",
            ].join("\r\n")
          );

          const blob = await zip.generateAsync({ type: "blob" });
          downloadBlob(blob, `BOZZE_EMAIL_${new Date().toISOString().slice(0, 10)}.zip`);
        } catch (error: any) {
          window.alert(`Errore nella creazione delle bozze: ${error?.message || error}`);
        } finally {
          busyRef.current = false;
          button.disabled = oldDisabled;
          button.textContent = oldText;
        }
      })();
    };

    document.addEventListener("change", onFileChange, true);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("change", onFileChange, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return null;
}
