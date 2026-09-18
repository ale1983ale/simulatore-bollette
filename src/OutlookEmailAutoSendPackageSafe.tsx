import { useEffect, useRef } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";

type Recipient = { agency: string; email: string; fileName?: string };
type GroupData = { label: string; sheets: Map<string, unknown[][]> };

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
    .slice(0, 110) || "file";

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

function findFileCard(input: HTMLInputElement) {
  let node: HTMLElement | null = input.parentElement;
  while (node && node !== document.body) {
    const title = Array.from(node.children).find(
      (child) => child.tagName === "STRONG" && (child.textContent || "").trim().startsWith("2. File da allegare")
    );
    if (title) return node;
    node = node.parentElement;
  }
  return null;
}

function findPreferredAgencyHeader() {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]')).find((field) => {
    let node: HTMLElement | null = field.parentElement;
    while (node && node !== document.body) {
      if ((node.textContent || "").includes("Nome colonna agenzia")) return true;
      node = node.parentElement;
    }
    return false;
  });
  return input?.value?.trim() || "AGENZIA";
}

function detectAgencyColumn(matrix: unknown[][], preferredHeader: string) {
  const candidates = new Set(
    [preferredHeader, "AGENZIA", "AGENZIA AGENTE", "NOME AGENZIA", "NOME AGENZIA/AGENTE", "AGENTE", "NOME AGENTE", "CONSULENTE"]
      .map(normalize)
      .filter(Boolean)
  );
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 20); rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (candidates.has(normalize(String(row[colIndex] ?? "")))) return { rowIndex, colIndex };
    }
  }
  return null;
}

function extractFileName(statusText: string) {
  const match = String(statusText || "").match(/([^\n—–]+?\.(?:xlsx|xlsm|xls|csv))/i);
  return match ? match[1].replace(/^\s*✓\s*/, "").trim() : "";
}

function findEmailTable() {
  return Array.from(document.querySelectorAll<HTMLTableElement>("table")).find((table) =>
    Array.from(table.querySelectorAll("thead th")).some((cell) => (cell.textContent || "").includes("File associato / Stato"))
  );
}

function readRecipients(requireFile: boolean): Recipient[] {
  const table = findEmailTable();
  if (!table) return [];
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const agencyIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Agenzia");
  const emailIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Email");
  const statusIndex = headers.findIndex((cell) => (cell.textContent || "").includes("File associato / Stato"));
  if (agencyIndex < 0 || emailIndex < 0) return [];

  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
    .filter((row) => row.dataset.emailRemoved !== "true")
    .map((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
      const agencyInput = cells[agencyIndex]?.querySelector<HTMLInputElement>("input");
      const emailInput = cells[emailIndex]?.querySelector<HTMLInputElement>("input");
      const agency = (agencyInput?.value || cells[agencyIndex]?.textContent || "").trim();
      const email = (emailInput?.value || cells[emailIndex]?.textContent || "").trim();
      const fileName = statusIndex >= 0 ? extractFileName((cells[statusIndex]?.textContent || "").trim()) : "";
      return { agency, email, fileName };
    })
    .filter((row) => row.email && (!requireFile || row.fileName));
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

function commonModeIsActive() {
  const panel = document.querySelector<HTMLElement>('[data-common-panel="true"]');
  return Boolean(panel && panel.offsetParent !== null && panel.style.display !== "none");
}

async function splitWorkbook(sourceFile: File, recipients: Recipient[]) {
  const data = await sourceFile.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const preferredHeader = findPreferredAgencyHeader();
  const groups = new Map<string, GroupData>();

  for (const sheetName of workbook.SheetNames) {
    const sourceSheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, { header: 1, defval: "", raw: false }) as unknown[][];
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
      if (!group.sheets.has(sheetName)) group.sheets.set(sheetName, prefix.map((item) => [...item]));
      group.sheets.get(sheetName)!.push([...row]);
    }
  }

  const generated = new Map<string, File>();
  const generatedNameByKey = new Map<string, string>();
  for (const [key, group] of groups) {
    const outWorkbook = XLSX.utils.book_new();
    for (const [sheetName, rows] of group.sheets) {
      const outSheet = XLSX.utils.aoa_to_sheet(rows as any[][]);
      const originalSheet = workbook.Sheets[sheetName] as any;
      if (originalSheet?.["!cols"]) (outSheet as any)["!cols"] = originalSheet["!cols"];
      XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);
    }
    const fileName = sanitizeFileName(group.label || key).replace(/\.xlsx$/i, "") + ".xlsx";
    const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    generated.set(normalize(fileName), new File([outData], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    generatedNameByKey.set(key, fileName);
  }

  const wantsNonAssigned = recipients.some((row) => normalize(row.agency) === "NONASSEGNATI");
  if (wantsNonAssigned) {
    const assignedFileNames = new Set(
      recipients
        .filter((row) => normalize(row.agency) !== "NONASSEGNATI")
        .map((row) => normalize(row.fileName || ""))
        .filter(Boolean)
    );
    const mergedSheets = new Map<string, { rows: unknown[][]; cols?: any }>();

    for (const [key, group] of groups) {
      const generatedName = generatedNameByKey.get(key) || "";
      if (assignedFileNames.has(normalize(generatedName))) continue;

      for (const [sheetName, rows] of group.sheets) {
        const current = mergedSheets.get(sheetName);
        if (!current) {
          mergedSheets.set(sheetName, {
            rows: rows.map((row) => [...row]),
            cols: (workbook.Sheets[sheetName] as any)?.["!cols"],
          });
          continue;
        }
        const detected = detectAgencyColumn(rows, preferredHeader);
        const dataStart = detected ? detected.rowIndex + 1 : 1;
        current.rows.push(...rows.slice(dataStart).map((row) => [...row]));
      }
    }

    if (mergedSheets.size) {
      const outWorkbook = XLSX.utils.book_new();
      for (const [sheetName, value] of mergedSheets) {
        const outSheet = XLSX.utils.aoa_to_sheet(value.rows as any[][]);
        if (value.cols) (outSheet as any)["!cols"] = value.cols;
        XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);
      }
      const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const originalStem = sanitizeFileName(sourceFile.name.replace(/\.[^.]+$/, "")).trim();
      const fileName = originalStem ? `NON ASSEGNATI ${originalStem}.xlsx` : "NON ASSEGNATI.xlsx";
      const nonAssignedFile = new File([outData], fileName, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      generated.set(normalize(fileName), nonAssignedFile);
      // Alias di sicurezza per pacchetti/righe creati da versioni precedenti.
      generated.set(normalize("NON ASSEGNATI.xlsx"), nonAssignedFile);
    }
  }

  return generated;
}

const psScript = String.raw`param([int]$Limit = 0)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$items = @($manifest.recipients)
if ($Limit -gt 0 -and $items.Count -gt $Limit) { $items = @($items | Select-Object -First $Limit) }
Write-Host ''
Write-Host 'INVIO EMAIL TRAMITE OUTLOOK CLASSICO' -ForegroundColor Cyan
Write-Host ('Email da inviare: ' + $items.Count)
Write-Host ('Oggetto: ' + [string]$manifest.subject)
Write-Host ''
Write-Host 'La firma predefinita di Outlook verra aggiunta automaticamente, compreso il logo.' -ForegroundColor Yellow
$confirm = Read-Host 'Per procedere digita INVIA'
if ($confirm -cne 'INVIA') { Write-Host 'Operazione annullata.'; exit 0 }
try { $outlook = New-Object -ComObject Outlook.Application }
catch { Write-Host 'Outlook classico non disponibile.' -ForegroundColor Red; exit 1 }
$bodyHtml = [System.Net.WebUtility]::HtmlEncode([string]$manifest.body)
$bodyHtml = [regex]::Replace($bodyHtml, '\r\n|\n|\r', '<br>')
$sent = 0
foreach ($item in $items) {
  try {
    $mail = $outlook.CreateItem(0)
    $mail.To = [string]$item.email
    $mail.Subject = [string]$manifest.subject
    $mail.BodyFormat = 2
    $mail.Display($false)
    Start-Sleep -Milliseconds 450
    $signatureHtml = [string]$mail.HTMLBody
    $mail.HTMLBody = "<div style='font-family:Calibri,Arial,sans-serif;font-size:11pt;'>$bodyHtml</div><br>" + $signatureHtml
    foreach ($rel in @($item.attachments)) {
      $relative = ([string]$rel) -replace '/', '\\'
      $path = Join-Path $root $relative
      if (-not (Test-Path -LiteralPath $path)) { throw "Allegato non trovato: $path" }
      [void]$mail.Attachments.Add($path)
    }
    $mail.Send()
    $sent++
    Write-Host ("OK " + $sent + '/' + $items.Count + ' - ' + [string]$item.email) -ForegroundColor Green
    Start-Sleep -Milliseconds 250
  } catch {
    Write-Host ('ERRORE per ' + [string]$item.email + ': ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Invio interrotto. Le email gia inviate restano inviate.' -ForegroundColor Yellow
    exit 1
  }
}
Write-Host ''
Write-Host ("Operazione completata. Email inviate: $sent") -ForegroundColor Green
Write-Host 'Premi INVIO per chiudere.'
[void](Read-Host)
`;

const sendAllBat = String.raw`@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0invia_tutte.ps1"
if errorlevel 1 pause
`;

const testOneBat = String.raw`@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0invia_tutte.ps1" -Limit 1
if errorlevel 1 pause
`;

export default function OutlookEmailAutoSendPackageSafe() {
  const sourceFileRef = useRef<File | null>(null);
  const separateFilesRef = useRef<Map<string, File>>(new Map());
  const commonFilesRef = useRef<File[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    const onFileChange = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      const selected = Array.from(input.files || []);
      if (!selected.length) return;
      if (input.closest('[data-common-panel="true"]')) {
        commonFilesRef.current = selected;
        return;
      }
      const card = findFileCard(input);
      if (!card) return;
      if (input.multiple) {
        sourceFileRef.current = null;
        separateFilesRef.current = new Map(selected.map((file) => [normalize(file.name), file]));
      } else {
        sourceFileRef.current = selected[0];
        separateFilesRef.current = new Map();
      }
    };

    const makePackage = async (button: HTMLButtonElement) => {
      if (busyRef.current) return;
      const { subject, body } = readMessage();
      if (!subject) return window.alert("Inserisci prima l'oggetto della mail.");
      const commonMode = commonModeIsActive();
      const recipients = readRecipients(!commonMode);
      if (!recipients.length) return window.alert("Non trovo email pronte da preparare.");

      busyRef.current = true;
      const oldText = button.textContent || "";
      button.disabled = true;
      button.textContent = "Preparo il pacchetto...";
      try {
        const zip = new JSZip();
        const manifestRecipients: Array<{ agency: string; email: string; attachments: string[] }> = [];

        if (commonMode) {
          const commonFiles = commonFilesRef.current;
          if (!commonFiles.length) throw new Error("Carica almeno un file nella modalità Stesso file per tutti.");
          const paths: string[] = [];
          for (let i = 0; i < commonFiles.length; i += 1) {
            const file = commonFiles[i];
            const rel = `allegati/comune_${String(i + 1).padStart(2, "0")}_${sanitizeFileName(file.name)}`;
            zip.file(rel, file);
            paths.push(rel);
          }
          recipients.forEach((row) => manifestRecipients.push({ agency: row.agency, email: row.email, attachments: paths }));
        } else {
          let available = separateFilesRef.current;
          if (sourceFileRef.current) available = await splitWorkbook(sourceFileRef.current, recipients);
          if (!available.size) throw new Error("Ricarica il file unico o i file separati e riprova.");
          for (let i = 0; i < recipients.length; i += 1) {
            const row = recipients[i];
            const requestedKey = normalize(row.fileName || "");
            const file =
              available.get(requestedKey) ||
              (normalize(row.agency) === "NONASSEGNATI"
                ? Array.from(available.entries()).find(([key]) => key.startsWith("NONASSEGNATI"))?.[1]
                : undefined);
            if (!file) throw new Error(`Non trovo l'allegato per ${row.agency}: ${row.fileName || "file non indicato"}`);
            const rel = `allegati/${String(i + 1).padStart(3, "0")}_${sanitizeFileName(file.name)}`;
            zip.file(rel, file);
            manifestRecipients.push({ agency: row.agency, email: row.email, attachments: [rel] });
          }
        }

        zip.file("manifest.json", JSON.stringify({ subject, body, recipients: manifestRecipients }, null, 2));
        zip.file("invia_tutte.ps1", psScript);
        zip.file("INVIA_TUTTE.bat", sendAllBat);
        zip.file("TEST_1_EMAIL.bat", testOneBat);
        zip.file("LEGGIMI.txt", [
          "INVIO AUTOMATICO CON OUTLOOK CLASSICO",
          "",
          "1) Estrai completamente lo ZIP in una cartella.",
          "2) Fai prima doppio clic su TEST_1_EMAIL.bat.",
          "3) Se la prima email e corretta, usa INVIA_TUTTE.bat.",
          "4) Digita INVIA quando richiesto.",
          "",
          "La firma predefinita di Outlook viene aggiunta automaticamente, compreso il logo.",
          "Outlook puo aprire per un istante ogni messaggio per inserire la firma.",
          "La webapp non accede alla casella Microsoft e non richiede autorizzazioni Entra.",
        ].join("\r\n"));

        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, `INVIO_AUTOMATICO_OUTLOOK_${new Date().toISOString().slice(0, 10)}.zip`);
      } catch (error: any) {
        window.alert(`Errore: ${error?.message || error}`);
      } finally {
        busyRef.current = false;
        button.disabled = false;
        button.textContent = oldText;
      }
    };

    const ensureButton = () => {
      const clearButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === "Pulisci messaggio" && button.offsetParent !== null
      );
      const row = clearButton?.parentElement;
      if (!row) return;
      let button = row.querySelector<HTMLButtonElement>('[data-auto-send-outlook="true"]');
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.autoSendOutlook = "true";
        button.textContent = "⚡ Invio unico Outlook + firma";
        button.style.border = "0";
        button.style.borderRadius = "10px";
        button.style.padding = "10px 14px";
        button.style.fontWeight = "700";
        button.style.cursor = "pointer";
        button.style.background = "#2563eb";
        button.style.color = "white";
        button.title = "Prepara un pacchetto per inviare tutte le email tramite Outlook classico usando la firma predefinita";
        button.addEventListener("click", () => void makePackage(button!));
        row.insertBefore(button, row.lastElementChild || null);
      }
    };

    document.addEventListener("change", onFileChange, true);
    ensureButton();
    const timer = window.setInterval(ensureButton, 900);
    return () => {
      document.removeEventListener("change", onFileChange, true);
      window.clearInterval(timer);
      document.querySelector('[data-auto-send-outlook="true"]')?.remove();
    };
  }, []);

  return null;
}
