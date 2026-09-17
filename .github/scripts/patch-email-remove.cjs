const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function mustReplace(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Pattern non trovato: ${label}`);
  return text.replace(search, replacement);
}

// 1) Stato di esclusione e filtro reale nelle email generate.
{
  const path = 'src/OutlookEmail.tsx';
  let s = read(path);

  s = mustReplace(
    s,
    '  const [savedAt, setSavedAt] = useState<string | null>(null);',
    `  const [savedAt, setSavedAt] = useState<string | null>(null);\n  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set());\n\n  useEffect(() => {\n    const onToggleRemoved = (event: Event) => {\n      const detail = (event as CustomEvent<{ index?: number; removed?: boolean }>).detail;\n      const rowIndex = Number(detail?.index);\n      if (!Number.isInteger(rowIndex) || rowIndex < 0) return;\n\n      setRemovedRows((current) => {\n        const next = new Set(current);\n        if (detail?.removed === false) next.delete(rowIndex);\n        else next.add(rowIndex);\n        return next;\n      });\n    };\n\n    window.addEventListener('outlook-email-toggle-remove', onToggleRemoved as EventListener);\n    return () => window.removeEventListener('outlook-email-toggle-remove', onToggleRemoved as EventListener);\n  }, []);\n\n  useEffect(() => {\n    setRemovedRows(new Set());\n  }, [fileMode, sourceFile, files]);`,
    'stato removedRows'
  );

  s = mustReplace(
    s,
    '      setAgents(cleaned);\n      setDirty(false);',
    '      setAgents(cleaned);\n      setRemovedRows(new Set());\n      setDirty(false);',
    'reset su ricarica elenco'
  );

  s = mustReplace(
    s,
    '      setAgents(parsed);\n      setDirty(true);',
    '      setAgents(parsed);\n      setRemovedRows(new Set());\n      setDirty(true);',
    'reset su import elenco'
  );

  s = mustReplace(
    s,
    '  const deleteAgent = (index: number) => {\n    setAgents((current) => current.filter((_, i) => i !== index));\n    setDirty(true);\n  };',
    '  const deleteAgent = (index: number) => {\n    setAgents((current) => current.filter((_, i) => i !== index));\n    setRemovedRows(new Set());\n    setDirty(true);\n  };',
    'reset su eliminazione nominativo'
  );

  s = mustReplace(
    s,
    '  const readyRows = useMemo(() => matched.filter((row) => row.file && row.email.trim()), [matched]);\n  const filesWithMissingEmail = useMemo(() => matched.filter((row) => row.file && !row.email.trim()), [matched]);',
    `  const readyRows = useMemo(\n    () => matched.filter((row, index) => !removedRows.has(index) && row.file && row.email.trim()),\n    [matched, removedRows]\n  );\n  const filesWithMissingEmail = useMemo(\n    () => matched.filter((row, index) => !removedRows.has(index) && row.file && !row.email.trim()),\n    [matched, removedRows]\n  );`,
    'filtri readyRows'
  );

  s = mustReplace(
    s,
    '<tr key={index} style={{ borderBottom: "1px solid #f1f5f9" }}>',
    '<tr key={index} data-email-row-index={index} data-email-removed={removedRows.has(index) ? "true" : "false"} data-email-file-name={row.file?.name || ""} style={{ borderBottom: "1px solid #f1f5f9", opacity: removedRows.has(index) ? 0.62 : 1 }}>',
    'attributi riga email'
  );

  s = mustReplace(
    s,
    '<td style={{ padding: 8, fontWeight: 700, color: row.file && row.email ? "#15803d" : row.file && !row.email ? "#b91c1c" : "#64748b", whiteSpace: "nowrap" }}>',
    '<td style={{ padding: 8, fontWeight: 700, color: removedRows.has(index) ? "#b91c1c" : row.file && row.email ? "#15803d" : row.file && !row.email ? "#b91c1c" : "#64748b", whiteSpace: "nowrap" }}>',
    'colore stato rimosso'
  );

  s = mustReplace(
    s,
    '{row.file && row.email ? `✓ ${row.file.name}` : row.file && !row.email ? `Email mancante — ${row.file.name}` : fileMode === "single" && sourceAgencies.length ? "Nessun dato nel file — non inviata" : files.length ? "Nessun file associato — non inviata" : "File non caricati"}',
    '{removedRows.has(index) ? "Rimosso manualmente — non inviata" : row.file && row.email ? `✓ ${row.file.name}` : row.file && !row.email ? `Email mancante — ${row.file.name}` : fileMode === "single" && sourceAgencies.length ? "Nessun dato nel file — non inviata" : files.length ? "Nessun file associato — non inviata" : "File non caricati"}',
    'testo stato rimosso'
  );

  write(path, s);
}

// 2) Tasto Rimuovi/Ripristina a destra dell'Anteprima.
{
  const path = 'src/OutlookEmailPreview.tsx';
  let s = read(path);

  s = mustReplace(
    s,
    '    const fileName = extractFileName((cells[statusIndex]?.textContent || "").trim());',
    '    const fileName = row.dataset.emailFileName || extractFileName((cells[statusIndex]?.textContent || "").trim());',
    'preview NON ASSEGNATI mantiene file rimosso come assegnato'
  );

  s = mustReplace(
    s,
    '          th.textContent = "Anteprima";',
    '          th.textContent = "Anteprima / Invio";',
    'header anteprima'
  );

  const re = /        const rows = Array\.from\(table\.querySelectorAll<HTMLTableRowElement>\("tbody tr"\)\);\n        rows\.forEach\(\(row\) => \{[\s\S]*?          row\.appendChild\(td\);\n        \}\);/;
  if (!re.test(s)) throw new Error('Pattern non trovato: blocco pulsanti anteprima');
  s = s.replace(re, `        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));\n        rows.forEach((row, fallbackIndex) => {\n          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));\n          if (cells.length <= statusIndex) return;\n\n          const statusText = (cells[statusIndex]?.textContent || "").trim();\n          const fileName = row.dataset.emailFileName || extractFileName(statusText);\n          const removed = row.dataset.emailRemoved === "true";\n          const rowIndex = Number(row.dataset.emailRowIndex ?? fallbackIndex);\n\n          let td = row.querySelector<HTMLTableCellElement>('[data-email-preview-cell="true"]');\n          if (!td) {\n            td = document.createElement("td");\n            td.setAttribute("data-email-preview-cell", "true");\n            row.appendChild(td);\n          }\n          td.replaceChildren();\n          td.style.padding = "8px";\n          td.style.whiteSpace = "nowrap";\n          td.style.display = "flex";\n          td.style.gap = "6px";\n          td.style.alignItems = "center";\n\n          if (fileName) {\n            const previewButton = document.createElement("button");\n            previewButton.type = "button";\n            previewButton.textContent = "👁 Anteprima";\n            previewButton.style.border = "0";\n            previewButton.style.borderRadius = "9px";\n            previewButton.style.padding = "7px 10px";\n            previewButton.style.fontWeight = "700";\n            previewButton.style.cursor = "pointer";\n            previewButton.style.background = "#dbeafe";\n            previewButton.style.color = "#1d4ed8";\n            previewButton.addEventListener("click", () => {\n              const agencyInput = cells[0]?.querySelector<HTMLInputElement>("input");\n              const agency = (agencyInput?.value || cells[0]?.textContent || "").trim();\n              openPreviewRef.current(agency, \`✓ \${fileName}\`);\n            });\n            td.appendChild(previewButton);\n          }\n\n          if (fileName || removed) {\n            const removeButton = document.createElement("button");\n            removeButton.type = "button";\n            removeButton.textContent = removed ? "↩ Ripristina" : "✕ Rimuovi";\n            removeButton.style.border = "0";\n            removeButton.style.borderRadius = "9px";\n            removeButton.style.padding = "7px 10px";\n            removeButton.style.fontWeight = "700";\n            removeButton.style.cursor = "pointer";\n            removeButton.style.background = removed ? "#dcfce7" : "#fee2e2";\n            removeButton.style.color = removed ? "#166534" : "#991b1b";\n            removeButton.addEventListener("click", () => {\n              window.dispatchEvent(new CustomEvent("outlook-email-toggle-remove", {\n                detail: { index: rowIndex, removed: !removed },\n              }));\n            });\n            td.appendChild(removeButton);\n          }\n\n          if (!fileName && !removed) {\n            td.textContent = "—";\n            td.style.color = "#94a3b8";\n          }\n        });`);

  write(path, s);
}

// 3) Anche il pacchetto Windows/Android deve ignorare le righe rimosse,
// inclusa la modalità "Stesso file per tutti".
{
  const path = 'src/OutlookEmailAutoSendPackageSafe.tsx';
  let s = read(path);
  s = mustReplace(
    s,
    '  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))\n    .map((row) => {',
    '  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))\n    .filter((row) => row.dataset.emailRemoved !== "true")\n    .map((row) => {',
    'filtro removed auto-send'
  );
  write(path, s);
}

// 4) Anche le bozze della modalità "Stesso file per tutti" ignorano le righe rimosse.
{
  const path = 'src/OutlookEmailCommonFiles.tsx';
  let s = read(path);
  s = mustReplace(
    s,
    '  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))\n    .map((row) => {',
    '  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))\n    .filter((row) => row.dataset.emailRemoved !== "true")\n    .map((row) => {',
    'filtro removed common files'
  );
  write(path, s);
}

console.log('Patch Rimuovi email applicata con successo.');
