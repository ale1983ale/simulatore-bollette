import { useEffect } from "react";

const normalizeText = (value: string) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

export default function OutlookEmailKeywords() {
  useEffect(() => {
    let scheduled = false;

    const enhanceKeywordField = () => {
      scheduled = false;

      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
      tables.forEach((table) => {
        const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
        const expectedHeader = headerCells.find(
          (cell) => normalizeText(cell.textContent || "") === "Allegato previsto"
        );
        if (expectedHeader) {
          expectedHeader.textContent = "Parole chiave agente";
          expectedHeader.title =
            "Parole usate insieme al campo Agenzia per riconoscere il file corretto. Non serve indicare il nome completo del file.";
        }

        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
        rows.forEach((row) => {
          const inputs = Array.from(row.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'));
          const keywordInput = inputs.find((input) => input.placeholder === "NOMEFILE.xlsx");
          if (keywordInput) {
            keywordInput.placeholder = "es. MASIELLO DANILA / TRADE NETWORK";
            keywordInput.title =
              "Inserisci una o più parole che compaiono nel nome agente/agenzia del file. La ricerca usa anche le parole del campo Agenzia.";
          }
        });

        const controlTitle = Array.from(table.parentElement?.querySelectorAll("strong") || []).find(
          (node) => normalizeText(node.textContent || "") === "4. Controllo abbinamenti"
        );
        const controlContainer = controlTitle?.parentElement;
        if (controlContainer && !controlContainer.querySelector('[data-agent-keyword-help="true"]')) {
          const help = document.createElement("div");
          help.setAttribute("data-agent-keyword-help", "true");
          help.style.marginTop = "5px";
          help.style.fontSize = "12px";
          help.style.color = "#475569";
          help.textContent =
            "Abbinamento: la webapp cerca usando le parole presenti in “Agenzia” + “Parole chiave agente”. Non serve più scrivere il nome esatto del file.";
          controlContainer.appendChild(help);
        }
      });

      const paragraphs = Array.from(document.querySelectorAll<HTMLParagraphElement>("p"));
      paragraphs.forEach((paragraph) => {
        const text = normalizeText(paragraph.textContent || "");
        if (text.includes("Importa l'Excel AGENZIA / EMAIL / ALLEGATO")) {
          paragraph.textContent =
            "Importa l'Excel AGENZIA / EMAIL / ALLEGATO oppure usa l'elenco salvato online. Il campo ALLEGATO viene usato come Parole chiave agente.";
        }
        if (text.startsWith("Seleziona tutti i file già separati.")) {
          paragraph.textContent =
            "Seleziona tutti i file già separati. La webapp li cerca usando le parole presenti in Agenzia e in Parole chiave agente, anche se il nome del file non coincide esattamente.";
        }
      });
    };

    const scheduleEnhance = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(enhanceKeywordField);
    };

    enhanceKeywordField();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
