/** Report A4 da righe e filtri reali della webapp, senza servizi esterni. */
export type ReportColumn = { label: string; width: number; align?: "left" | "right" };
export type ReportStat = { label: string; value: string; detail?: string };
export type FilteredPdfReport = {
  title: string; subtitle: string; filename: string;
  columns: ReportColumn[];
  rows: Array<Array<string | number | null | undefined>>;
  filters?: string[];
  stats?: ReportStat[];
  note?: string;
};

const clean = (v: unknown): string => String(v ?? "")
  .replace(/[\u0000-\u001f]/g, " ").replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-")
  .replace(/\u2022/g, "-").replace(/\s+/g, " ").trim();

export const pdfNumber = (v: number, decimals = 2): string =>
  v.toLocaleString("it-IT", { maximumFractionDigits: decimals });

export const pdfSelection = (label: string, values: readonly string[],
  fallback = "Tutti"): string =>
  label + ": " + (values.length ? values.join(", ") : fallback);

const fileNameFor = (v: string) => {
  const name = clean(v).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 125) || "Report";
  return name.toLowerCase().endsWith(".pdf") ? name : name + ".pdf";
};

async function saveGeneratedPdf(pdf: import("jspdf").jsPDF, filename: string): Promise<void> {
  const bridge = (window as Window & {
    AndroidFiles?: { savePdf?: (base64: string, name: string) => void };
  }).AndroidFiles;
  if (typeof bridge?.savePdf === "function") {
    const data = new Uint8Array(pdf.output("arraybuffer"));
    const segments: string[] = [];
    for (let i = 0; i < data.length; i += 0x8000) {
      segments.push(String.fromCharCode(...data.subarray(i, i + 0x8000)));
    }
    bridge.savePdf(btoa(segments.join("")), fileNameFor(filename));
    return;
  }
  if (/GestioneEnergiaAndroid/i.test(navigator.userAgent)) {
    throw new Error("Download PDF non supportato in questo APK. Apri Gestione Energia da Chrome o aggiorna l'APK.");
  }
  const url = URL.createObjectURL(new Blob([pdf.output("arraybuffer")], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = fileNameFor(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function exportFilteredA4Pdf(report: FilteredPdfReport): Promise<void> {
  if (!report.rows.length) throw new Error("Non ci sono risultati filtrati da esportare.");
  if (!report.columns.length || report.rows.some(row => row.length !== report.columns.length)) {
    throw new Error("I dati del report non corrispondono alle intestazioni.");
  }
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const W = 297, H = 210, M = 13, width = W - 2 * M, endY = H - 17;
  const totalWeight = report.columns.reduce((sum, col) => sum + Math.max(col.width, 1), 0);
  const colWidths = report.columns.map(col => width * Math.max(col.width, 1) / totalWeight);
  const xs: number[] = [];
  let nextX = M;
  for (const w of colWidths) { xs.push(nextX); nextX += w; }
  const printed = new Date().toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const head = (continued: boolean) => {
    pdf.setFillColor(15, 35, 65); pdf.rect(0, 0, W, 20, "F");
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11); pdf.text("GESTIONE ENERGIA", M, 8.5);
    pdf.setFontSize(7.5);
    pdf.text("DATI PRODUZIONE  /  ESPORTAZIONE FILTRATA", W - M, 8.5, { align: "right" });
    pdf.setTextColor(15, 35, 65); pdf.setFontSize(10);
    pdf.text(clean(report.title) + (continued ? " - CONTINUA" : ""), M, 28.5);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(88, 105, 125);
    pdf.text("Generato il " + printed, W - M, 28.5, { align: "right" });
    pdf.setDrawColor(214, 225, 235); pdf.line(M, 32, W - M, 32);
    return 37;
  };
  const tableHeader = (at: number) => {
    pdf.setFillColor(227, 236, 247); pdf.rect(M, at, width, 13, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.2); pdf.setTextColor(15, 35, 65);
    report.columns.forEach((col, index) => {
      const lines = pdf.splitTextToSize(clean(col.label), Math.max(4, colWidths[index] - 3)).slice(0, 2);
      const right = col.align === "right";
      pdf.text(lines, xs[index] + (right ? colWidths[index] - 1.6 : 1.6),
        at + (lines.length > 1 ? 4.6 : 7.4),
        { align: right ? "right" : "left", lineHeightFactor: 1.1 });
    });
    pdf.setDrawColor(179, 197, 219); pdf.line(M, at + 13, W - M, at + 13);
    return at + 13;
  };
  let y = head(false);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(15, 35, 65);
  const subLines = pdf.splitTextToSize(clean(report.subtitle), width);
  pdf.text(subLines, M, y); y += subLines.length * 4 + 4;
  const appliedFilters = (report.filters || []).filter(Boolean);
  if (appliedFilters.length) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(21, 85, 160);
    pdf.text("FILTRI APPLICATI", M, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setTextColor(88, 105, 125); pdf.setFontSize(7.7);
    for (let i = 0; i < appliedFilters.length; i += 1) {
      if (y > 115) {
        pdf.text("Ulteriori filtri inclusi nella selezione dei dati.", M, y); y += 4;
        break;
      }
      const lines = pdf.splitTextToSize(clean(appliedFilters[i]), width - 3);
      pdf.text(lines, M + 1, y);
      y += lines.length * 3.5 + 1.5;
    }
    y += 2;
  }
  const stats = (report.stats || []).slice(0, 4);
  if (stats.length) {
    const gap = 3.5, boxWidth = (width - gap * (stats.length - 1)) / stats.length;
    stats.forEach((stat, i) => {
      const x = M + i * (boxWidth + gap);
      pdf.setFillColor(244, 248, 252); pdf.setDrawColor(217, 229, 241);
      pdf.roundedRect(x, y, boxWidth, 19, 2, 2, "FD");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(91, 107, 124);
      pdf.text(clean(stat.label).slice(0, 37), x + 3, y + 5);
      pdf.setFontSize(13); pdf.setTextColor(15, 35, 65);
      pdf.text(clean(stat.value).slice(0, 40), x + 3, y + 12);
      if (stat.detail) {
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(91, 107, 124);
        pdf.text(clean(stat.detail).slice(0, 41), x + 3, y + 16.5);
      }
    });
    y += 24;
  }
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(21, 85, 160); pdf.setFontSize(8.5);
  pdf.text("DETTAGLIO - " + pdfNumber(report.rows.length, 0) + " RIGHE FILTRATE", M, y);
  y += 4.5;
  if (y > endY - 28) { pdf.addPage(); y = head(true); }
  y = tableHeader(y);
  report.rows.forEach((values, rowIndex) => {
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.3);
    const lines = values.map((v, i) => {
      const wrapped: string[] = pdf.splitTextToSize(clean(v) || "-", Math.max(4, colWidths[i] - 3.4));
      return wrapped.length > 5 ? [...wrapped.slice(0, 4), wrapped[4].slice(0, -2) + "..."] : wrapped;
    });
    const height = Math.max(8, 3.5 * Math.max(1, ...lines.map(item => item.length)) + 3);
    if (y + height > endY) { pdf.addPage(); y = tableHeader(head(true) + 2); }
    if (rowIndex % 2 === 1) {
      pdf.setFillColor(249, 251, 253); pdf.rect(M, y, width, height, "F");
    }
    pdf.setTextColor(15, 35, 65); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.3);
    lines.forEach((part, i) => {
      const right = report.columns[i].align === "right";
      pdf.text(part, xs[i] + (right ? colWidths[i] - 1.6 : 1.6), y + 4.2,
        { align: right ? "right" : "left", lineHeightFactor: 1.05 });
    });
    pdf.setDrawColor(235, 239, 244); pdf.setLineWidth(0.15);
    pdf.line(M, y + height, W - M, y + height);
    y += height;
  });
  if (report.note) {
    const lines = pdf.splitTextToSize("NOTA: " + clean(report.note), width);
    if (y + lines.length * 4 + 6 > endY) { pdf.addPage(); y = head(true); }
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(7.3); pdf.setTextColor(88, 105, 125);
    pdf.text(lines, M, y + 6);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(211, 224, 235); pdf.line(M, 198, W - M, 198);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.2); pdf.setTextColor(88, 105, 125);
    pdf.text("GESTIONE ENERGIA - " + clean(report.title), M, 203);
    pdf.text("Pagina " + page + " di " + pages, W - M, 203, { align: "right" });
  }
  await saveGeneratedPdf(pdf, report.filename);
}
