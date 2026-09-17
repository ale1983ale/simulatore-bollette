import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

type PreviewSheet = {
  name: string;
  rows: string[][];
};

type PreviewState = {
  agency: string;
  fileName: string;
  sheets: PreviewSheet[];
  activeSheet: number;
  loading: boolean;
  error: string;
};

const normalize = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

const stripExtension = (value: string) => String(value || "").replace(/\.[^.]+$/, "");

const sanitizeFileName = (value: string) =>
  String(value || "file")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "file";

const findFileCard = (input: HTMLInputElement) => {
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
};

const findPreferredAgencyHeader = () => {
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
};

const detectAgencyColumn = (matrix: unknown[][], preferredHeader: string) => {
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
};

const extractFileName = (statusText: string) => {
  const match = statusText.match(/([^\n—–]+?\.(?:xlsx|xlsm|xls|csv))/i);
  if (!match) return "";
  return match[1].replace(/^\s*✓\s*/, "").trim();
};

const matrixToStrings = (matrix: unknown[][]) =>
  matrix.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));

async function parseWorkbookFile(file: File): Promise<PreviewSheet[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  return workbook.SheetNames.map((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    return { name: sheetName, rows: matrixToStrings(matrix) };
  });
}

function readAssignedNormalFileNames() {
  const table = Array.from(document.querySelectorAll<HTMLTableElement>("table")).find((candidate) =>
    Array.from(candidate.querySelectorAll("thead th")).some((cell) =>
      (cell.textContent || "").includes("File associato / Stato")
    )
  );
  if (!table) return new Set<string>();

  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const agencyIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Agenzia");
  const statusIndex = headers.findIndex((cell) => (cell.textContent || "").includes("File associato / Stato"));
  if (agencyIndex < 0 || statusIndex < 0) return new Set<string>();

  const names = new Set<string>();
  Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).forEach((row) => {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
    const agencyInput = cells[agencyIndex]?.querySelector<HTMLInputElement>("input");
    const agency = (agencyInput?.value || cells[agencyIndex]?.textContent || "").trim();
    if (normalize(agency) === "NONASSEGNATI") return;
    const fileName = extractFileName((cells[statusIndex]?.textContent || "").trim());
    if (fileName) names.add(normalize(stripExtension(fileName)));
  });
  return names;
}

async function parseSplitPreview(sourceFile: File, targetFileName: string): Promise<PreviewSheet[]> {
  const data = await sourceFile.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const targetStem = normalize(stripExtension(targetFileName));
  const preferredHeader = findPreferredAgencyHeader();
  const sheets: PreviewSheet[] = [];
  const isNonAssignedTarget = targetStem === normalize("NON ASSEGNATI");
  const assignedNormalFiles = isNonAssignedTarget ? readAssignedNormalFileNames() : new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    if (!matrix.length) continue;

    const detected = detectAgencyColumn(matrix, preferredHeader);
    if (!detected) continue;

    const prefix = matrix.slice(0, detected.rowIndex + 1);
    const matchedRows = matrix.slice(detected.rowIndex + 1).filter((row) => {
      const label = String((row || [])[detected.colIndex] ?? "").trim();
      if (!label) return false;
      const generatedStem = normalize(stripExtension(sanitizeFileName(label) + ".xlsx"));
      if (isNonAssignedTarget) return !assignedNormalFiles.has(generatedStem);
      return generatedStem === targetStem || normalize(label) === targetStem;
    });

    if (matchedRows.length) {
      sheets.push({
        name: sheetName,
        rows: matrixToStrings([...prefix, ...matchedRows]),
      });
    }
  }

  return sheets;
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function OutlookEmailPreview() {
  const sourceFileRef = useRef<File | null>(null);
  const separateFilesRef = useRef<Map<string, File>>(new Map());
  const openPreviewRef = useRef<(agency: string, statusText: string) => void>(() => {});
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const openPreview = async (agency: string, statusText: string) => {
    const fileName = extractFileName(statusText);
    if (!fileName) return;

    setPreview({
      agency,
      fileName,
      sheets: [],
      activeSheet: 0,
      loading: true,
      error: "",
    });

    try {
      let sheets: PreviewSheet[] = [];
      const directFile = separateFilesRef.current.get(normalize(fileName));

      if (directFile) {
        sheets = await parseWorkbookFile(directFile);
      } else if (sourceFileRef.current) {
        sheets = await parseSplitPreview(sourceFileRef.current, fileName);
      }

      if (!sheets.length) {
        throw new Error("Non riesco a ricostruire l'anteprima di questo file. Ricarica il file unico o i file separati e riprova.");
      }

      setPreview((current) =>
        current
          ? { ...current, sheets, activeSheet: 0, loading: false, error: "" }
          : current
      );
    } catch (error: any) {
      setPreview((current) =>
        current
          ? {
              ...current,
              loading: false,
              error: error?.message || String(error),
            }
          : current
      );
    }
  };

  openPreviewRef.current = (agency, statusText) => {
    void openPreview(agency, statusText);
  };

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
        separateFilesRef.current = new Map(selected.map((file) => [normalize(file.name), file]));
      } else {
        sourceFileRef.current = selected[0];
        separateFilesRef.current = new Map();
      }
    };

    document.addEventListener("change", onFileChange, true);
    return () => document.removeEventListener("change", onFileChange, true);
  }, []);

  useEffect(() => {
    let scheduled = false;

    const ensurePreviewButtons = () => {
      scheduled = false;
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));

      tables.forEach((table) => {
        const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
        const statusIndex = headerCells.findIndex((cell) =>
          (cell.textContent || "").includes("File associato / Stato")
        );
        if (statusIndex < 0) return;

        const headerRow = table.querySelector("thead tr");
        if (headerRow && !headerRow.querySelector('[data-email-preview-header="true"]')) {
          const th = document.createElement("th");
          th.textContent = "Anteprima";
          th.style.padding = "8px";
          th.setAttribute("data-email-preview-header", "true");
          headerRow.appendChild(th);
        }

        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
        rows.forEach((row) => {
          if (row.querySelector('[data-email-preview-cell="true"]')) return;
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
          if (cells.length <= statusIndex) return;

          const statusText = (cells[statusIndex]?.textContent || "").trim();
          const fileName = extractFileName(statusText);
          const td = document.createElement("td");
          td.style.padding = "8px";
          td.style.whiteSpace = "nowrap";
          td.setAttribute("data-email-preview-cell", "true");

          if (fileName) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "👁 Anteprima";
            button.style.border = "0";
            button.style.borderRadius = "9px";
            button.style.padding = "7px 10px";
            button.style.fontWeight = "700";
            button.style.cursor = "pointer";
            button.style.background = "#dbeafe";
            button.style.color = "#1d4ed8";
            button.addEventListener("click", () => {
              const agency = (cells[0]?.textContent || "").trim();
              openPreviewRef.current(agency, statusText);
            });
            td.appendChild(button);
          } else {
            td.textContent = "—";
            td.style.color = "#94a3b8";
          }

          row.appendChild(td);
        });
      });
    };

    const requestEnsure = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(ensurePreviewButtons);
    };

    requestEnsure();
    const observer = new MutationObserver(requestEnsure);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(requestEnsure, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelectorAll('[data-email-preview-header="true"], [data-email-preview-cell="true"]').forEach((node) => node.remove());
    };
  }, []);

  if (!preview) return null;

  const active = preview.sheets[preview.activeSheet];
  const rows = active?.rows || [];
  const visibleRows = rows.slice(0, 500);
  const maxColumns = Math.min(
    40,
    visibleRows.reduce((max, row) => Math.max(max, row.length), 0)
  );

  const separateFile = separateFilesRef.current.get(normalize(preview.fileName));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15,23,42,.55)",
        padding: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setPreview(null);
      }}
    >
      <div
        style={{
          width: "min(1500px, 98vw)",
          height: "min(900px, 94vh)",
          background: "white",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 24px 70px rgba(15,23,42,.3)",
          display: "flex",
          flexDirection: "column",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Anteprima file — {preview.agency}</div>
            <div style={{ marginTop: 3, color: "#64748b", fontSize: 13 }}>{preview.fileName}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {separateFile && (
              <button
                onClick={() => downloadFile(separateFile)}
                style={{
                  border: 0,
                  borderRadius: 9,
                  padding: "9px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "#dcfce7",
                  color: "#166534",
                }}
              >
                Scarica Excel
              </button>
            )}
            <button
              onClick={() => setPreview(null)}
              style={{
                border: 0,
                borderRadius: 9,
                padding: "9px 12px",
                fontWeight: 700,
                cursor: "pointer",
                background: "#e2e8f0",
              }}
            >
              Chiudi
            </button>
          </div>
        </div>

        {preview.loading ? (
          <div style={{ padding: 28 }}>Caricamento anteprima...</div>
        ) : preview.error ? (
          <div style={{ padding: 28, color: "#b91c1c", fontWeight: 700 }}>{preview.error}</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "10px 12px",
                borderBottom: "1px solid #e2e8f0",
                overflowX: "auto",
                background: "#f8fafc",
              }}
            >
              {preview.sheets.map((sheet, index) => (
                <button
                  key={`${sheet.name}-${index}`}
                  onClick={() => setPreview((current) => current ? { ...current, activeSheet: index } : current)}
                  style={{
                    border: 0,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: index === preview.activeSheet ? "#2563eb" : "#e2e8f0",
                    color: index === preview.activeSheet ? "white" : "#0f172a",
                  }}
                >
                  {sheet.name}
                </button>
              ))}
            </div>

            <div style={{ padding: "8px 12px", color: "#64748b", fontSize: 12 }}>
              {rows.length > 500
                ? `Anteprima delle prime 500 righe su ${rows.length}.`
                : `${rows.length} righe nel foglio.`}
            </div>

            <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid #f1f5f9" }}>
              <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 12 }}>
                <tbody>
                  {visibleRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: maxColumns }).map((_, colIndex) => (
                        <td
                          key={colIndex}
                          style={{
                            border: "1px solid #e2e8f0",
                            padding: "5px 7px",
                            whiteSpace: "nowrap",
                            background: rowIndex === 0 ? "#f8fafc" : "white",
                            fontWeight: rowIndex === 0 ? 700 : 400,
                          }}
                        >
                          {row[colIndex] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
