import { useEffect } from "react";

const extractFileName = (statusText: string) => {
  const match = String(statusText || "").match(/([^\n—–]+?\.(?:xlsx|xlsm|xls|csv))/i);
  return match ? match[1].replace(/^\s*✓\s*/, "").trim() : "";
};

export default function OutlookEmailPreviewRefresh() {
  useEffect(() => {
    let scheduled = false;

    const refresh = () => {
      scheduled = false;
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));

      tables.forEach((table) => {
        const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
        const statusIndex = headers.findIndex((cell) =>
          (cell.textContent || "").includes("File associato / Stato")
        );
        if (statusIndex < 0) return;

        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
          if (cells.length <= statusIndex) return;

          const statusText = (cells[statusIndex]?.textContent || "").trim();
          const shouldHavePreview = Boolean(extractFileName(statusText));
          const previewCell = row.querySelector<HTMLTableCellElement>('[data-email-preview-cell="true"]');
          if (!previewCell) return;

          const hasPreviewButton = Boolean(previewCell.querySelector("button"));
          if (shouldHavePreview !== hasPreviewButton) {
            previewCell.remove();
          }
        });
      });
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(refresh);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(schedule, 350);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
