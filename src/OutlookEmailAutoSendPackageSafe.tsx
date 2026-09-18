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

const escapeHtmlForOutlook = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r\n|\n|\r/g, "<br>");

const vbString = (value: string) => `"${String(value || "").replace(/"/g, '""')}"`;

function buildVbsScript(
  recipients: Array<{ agency: string; email: string; attachments: string[] }>,
  subject: string,
  body: string
) {
  const rows = recipients
    .map((item, index) => {
      const attachmentList = item.attachments.map((rel) => rel.replace(/\//g, "\\\\")).join("|");
      return [
        `recipients(${index}) = Array(${vbString(item.agency)}, ${vbString(item.email)}, ${vbString(attachmentList)})`,
      ].join("");
    })
    .join("\r\n");

  const htmlBody = `<div style='font-family:Calibri,Arial,sans-serif;font-size:11pt;'>${escapeHtmlForOutlook(body)}</div><br>`;

  return [
    "' INVIO EMAIL TRAMITE OUTLOOK CLASSICO",
    "Option Explicit",
    "",
    "Dim fso, root, outlook, recipients(), mode, confirm, maxItems, i, item, mail, signatureHtml",
    "Dim rels, rel, fullPath, sent, bodyHtml",
    "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
    "root = fso.GetParentFolderName(WScript.ScriptFullName)",
    `ReDim recipients(${Math.max(0, recipients.length - 1)})`,
    rows,
    "",
    `bodyHtml = ${vbString(htmlBody)}`,
    "",
    'mode = UCase(Trim(InputBox("Scrivi TEST per inviare solo la prima email oppure INVIA per inviarle tutte.", "Invio Email Outlook", "TEST")))',
    'If mode <> "TEST" And mode <> "INVIA" Then',
    '  MsgBox "Operazione annullata.", vbInformation, "Invio Email Outlook"',
    "  WScript.Quit 0",
    "End If",
    "",
    'If mode = "TEST" Then',
    "  maxItems = 1",
    "Else",
    "  maxItems = UBound(recipients) + 1",
    "End If",
    "",
    'confirm = MsgBox("Stai per inviare " & maxItems & " email tramite Outlook." & vbCrLf & vbCrLf & "Oggetto: " & ' + vbString(subject) + ' & vbCrLf & vbCrLf & "Continuare?", vbYesNo + vbQuestion + vbDefaultButton2, "Conferma invio")',
    "If confirm <> vbYes Then WScript.Quit 0",
    "",
    "On Error Resume Next",
    'Set outlook = CreateObject("Outlook.Application")',
    "If Err.Number <> 0 Then",
    '  MsgBox "Outlook classico non disponibile: " & Err.Description, vbCritical, "Errore"',
    "  WScript.Quit 1",
    "End If",
    "On Error GoTo 0",
    "",
    "sent = 0",
    "For i = 0 To maxItems - 1",
    "  item = recipients(i)",
    "  On Error Resume Next",
    "  Err.Clear",
    "  Set mail = outlook.CreateItem(0)",
    "  mail.To = CStr(item(1))",
    "  mail.Subject = " + vbString(subject),
    "  mail.BodyFormat = 2",
    "  mail.Display False",
    "  WScript.Sleep 600",
    "  signatureHtml = CStr(mail.HTMLBody)",
    "  mail.HTMLBody = bodyHtml & signatureHtml",
    "",
    "  rels = Split(CStr(item(2)), \"|\")",
    "  For Each rel In rels",
    '    If Len(Trim(CStr(rel))) > 0 Then',
    "      fullPath = fso.BuildPath(root, CStr(rel))",
    "      If Not fso.FileExists(fullPath) Then",
    '        MsgBox "Allegato non trovato per " & CStr(item(0)) & ":" & vbCrLf & fullPath, vbCritical, "Errore allegato"',
    "        WScript.Quit 1",
    "      End If",
    "      mail.Attachments.Add fullPath",
    "    End If",
    "  Next",
    "",
    "  mail.Send",
    "  If Err.Number <> 0 Then",
    '    MsgBox "Errore per " & CStr(item(1)) & ":" & vbCrLf & Err.Description, vbCritical, "Invio interrotto"',
    "    WScript.Quit 1",
    "  End If",
    "  On Error GoTo 0",
    "  sent = sent + 1",
    "  WScript.Sleep 250",
    "Next",
    "",
    'MsgBox "Operazione completata." & vbCrLf & "Email inviate: " & sent, vbInformation, "Invio Email Outlook"',
    "",
  ].join("\r\n");
}

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
        zip.file("INVIA_EMAIL_OUTLOOK.vbs", buildVbsScript(manifestRecipients, subject, body));
        zip.file("LEGGIMI.txt", [
          "INVIO RAPIDO CON OUTLOOK CLASSICO",
          "",
          "1) Estrai completamente lo ZIP in una cartella.",
          "2) Fai doppio clic su INVIA_EMAIL_OUTLOOK.vbs.",
          "3) Scrivi TEST per inviare solo la prima email.",
          "4) Se il test e corretto, riapri lo stesso file e scrivi INVIA.",
          "5) Conferma nella finestra che compare.",
          "",
          "Non serve PowerShell e non devi aprire il Prompt dei comandi.",
          "La firma predefinita di Outlook viene aggiunta automaticamente, compreso il logo.",
          "Gli allegati vengono presi dalla cartella allegati del pacchetto.",
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
        button.textContent = "⚡ INVIO RAPIDO PC";
        button.style.border = "0";
        button.style.borderRadius = "10px";
        button.style.padding = "10px 14px";
        button.style.fontWeight = "700";
        button.style.cursor = "pointer";
        button.style.background = "#2563eb";
        button.style.color = "white";
        button.title = "Prepara il pacchetto Windows: estrai lo ZIP e fai doppio clic su INVIA_EMAIL_OUTLOOK.vbs";
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
