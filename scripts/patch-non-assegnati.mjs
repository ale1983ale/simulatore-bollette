import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(content, oldText, newText, label) {
  if (!content.includes(oldText)) throw new Error(`Anchor not found: ${label}`);
  return content.replace(oldText, newText);
}
function replaceRegex(content, regex, replacement, label) {
  if (!regex.test(content)) throw new Error(`Pattern not found: ${label}`);
  return content.replace(regex, replacement);
}

const NON_ASSIGNED_HELPER = `const NON_ASSIGNED_LABEL = "NON ASSEGNATI";\nconst isNonAssignedAgent = (agent: AgentRow) => normalize(agent.agenzia) === normalize(NON_ASSIGNED_LABEL);\n\nasync function buildNonAssignedWorkbook(\n  sources: SourceAgency[],\n  generatedByAgency: Map<string, File>,\n  preferredHeader: string\n): Promise<File | null> {\n  if (!sources.length) return null;\n\n  const mergedSheets = new Map<string, { rows: unknown[][]; cols?: any }>();\n\n  for (const source of sources) {\n    const file = generatedByAgency.get(source.key);\n    if (!file) continue;\n    const data = await file.arrayBuffer();\n    const workbook = XLSX.read(data, { type: "array", cellDates: true });\n\n    for (const sheetName of workbook.SheetNames) {\n      const sheet = workbook.Sheets[sheetName] as any;\n      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {\n        header: 1,\n        defval: "",\n        raw: false,\n      }) as unknown[][];\n      if (!matrix.length) continue;\n\n      const current = mergedSheets.get(sheetName);\n      if (!current) {\n        mergedSheets.set(sheetName, {\n          rows: matrix.map((row) => [...row]),\n          cols: sheet?.["!cols"],\n        });\n        continue;\n      }\n\n      const detected = detectAgencyColumn(matrix, preferredHeader);\n      const dataStart = detected ? detected.rowIndex + 1 : 1;\n      current.rows.push(...matrix.slice(dataStart).map((row) => [...row]));\n    }\n  }\n\n  if (!mergedSheets.size) return null;\n\n  const outWorkbook = XLSX.utils.book_new();\n  for (const [sheetName, value] of mergedSheets) {\n    const outSheet = XLSX.utils.aoa_to_sheet(value.rows as any[][]);\n    if (value.cols) (outSheet as any)["!cols"] = value.cols;\n    XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);\n  }\n\n  const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;\n  return new File([outData], NON_ASSIGNED_LABEL + ".xlsx", {\n    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n  });\n}\n\n`;

{
  const path = 'src/OutlookEmail.tsx';
  let s = read(path);

  s = replaceOnce(
    s,
    'function matchScore(agent: AgentRow, sourceLabel: string) {\n  const sourceNorm = normalize(sourceLabel);',
    'function matchScore(agent: AgentRow, sourceLabel: string) {\n  if (normalize(agent.agenzia) === normalize(NON_ASSIGNED_LABEL)) return 0;\n  const sourceNorm = normalize(sourceLabel);',
    'OutlookEmail matchScore special recipient'
  );

  s = replaceOnce(
    s,
    'export default function OutlookEmail() {',
    NON_ASSIGNED_HELPER + 'export default function OutlookEmail() {',
    'OutlookEmail helper insertion'
  );

  s = replaceOnce(
    s,
    '  const [splitWarnings, setSplitWarnings] = useState<string[]>([]);\n  const [preferredAgencyHeader, setPreferredAgencyHeader] = useState("AGENZIA");',
    '  const [splitWarnings, setSplitWarnings] = useState<string[]>([]);\n  const [nonAssignedFile, setNonAssignedFile] = useState<File | null>(null);\n  const [preferredAgencyHeader, setPreferredAgencyHeader] = useState("AGENZIA");',
    'OutlookEmail nonAssigned state'
  );

  s = replaceOnce(
    s,
    '  const assignment = useMemo(() => buildAssignments(agents, sourceAgencies), [agents, sourceAgencies]);\n\n  const manualSources',
    '  const assignment = useMemo(() => buildAssignments(agents, sourceAgencies), [agents, sourceAgencies]);\n  const nonAssignedAgentIndex = useMemo(() => agents.findIndex(isNonAssignedAgent), [agents]);\n  const nonAssignedAgent = nonAssignedAgentIndex >= 0 ? agents[nonAssignedAgentIndex] : null;\n  const nonAssignedConfigured = Boolean(nonAssignedAgent?.email.trim());\n\n  const manualSources',
    'OutlookEmail nonAssigned config'
  );

  s = replaceOnce(
    s,
    '    return agents.map((agent, agentIndex) => {\n      if (fileMode === "separate") {',
    '    return agents.map((agent, agentIndex) => {\n      if (fileMode === "single" && isNonAssignedAgent(agent)) {\n        return {\n          ...agent,\n          file: nonAssignedFile,\n          sourceLabel: nonAssignedFile ? NON_ASSIGNED_LABEL : undefined,\n        };\n      }\n      if (fileMode === "separate") {',
    'OutlookEmail matched special row'
  );

  s = replaceOnce(
    s,
    '  }, [agents, files, fileMode, sourceAgencies, generatedByAgency, assignment, manualAssignment, manualSources]);',
    '  }, [agents, files, fileMode, sourceAgencies, generatedByAgency, assignment, manualAssignment, manualSources, nonAssignedFile]);',
    'OutlookEmail matched deps'
  );

  s = replaceOnce(
    s,
    '  const unassociatedSourceAgencies = useMemo(\n    () => sourceAgencies.filter((_, sourceIndex) => !assignment.usedSources.has(sourceIndex)),\n    [sourceAgencies, assignment]\n  );\n\n  const recipientsWithoutSourceData = useMemo(\n    () => agents.filter((_, agentIndex) => !assignment.byAgent.has(agentIndex)),\n    [agents, assignment]\n  );',
    '  const unassociatedSourceAgencies = useMemo(\n    () => sourceAgencies.filter((_, sourceIndex) => !assignment.usedSources.has(sourceIndex)),\n    [sourceAgencies, assignment]\n  );\n\n  useEffect(() => {\n    let cancelled = false;\n    if (fileMode !== "single" || !unassociatedSourceAgencies.length) {\n      setNonAssignedFile(null);\n      return;\n    }\n\n    void buildNonAssignedWorkbook(\n      unassociatedSourceAgencies,\n      generatedByAgency,\n      preferredAgencyHeader\n    )\n      .then((file) => {\n        if (!cancelled) setNonAssignedFile(file);\n      })\n      .catch((error) => {\n        if (!cancelled) {\n          setNonAssignedFile(null);\n          setNotice(`Errore nella creazione di NON ASSEGNATI.xlsx: ${error?.message || error}`);\n        }\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [fileMode, unassociatedSourceAgencies, generatedByAgency, preferredAgencyHeader]);\n\n  const recipientsWithoutSourceData = useMemo(\n    () => agents.filter((agent, agentIndex) => !isNonAssignedAgent(agent) && !assignment.byAgent.has(agentIndex)),\n    [agents, assignment]\n  );',
    'OutlookEmail aggregate effect'
  );

  s = s.replaceAll('    setSplitWarnings([]);\n', '    setSplitWarnings([]);\n    setNonAssignedFile(null);\n');

  s = replaceOnce(
    s,
    '      const unmatched = sourceAgencies.filter((_, index) => !nowAssignment.usedSources.has(index));\n      if (!unmatched.length && !splitWarnings.length) return;\n      const lines = ["CONTROLLO ABBINAMENTI", ""];\n      if (unmatched.length) {\n        lines.push(`${unmatched.length} agenzie del file non sono associate a un nominativo:`, ...unmatched.slice(0, 15).map((item) => `• ${item.label}`));\n        if (unmatched.length > 15) lines.push(`• ...e altre ${unmatched.length - 15}`);\n      }',
    '      const unmatched = sourceAgencies.filter((_, index) => !nowAssignment.usedSources.has(index));\n      const unmatchedNeedsAttention = unmatched.length > 0 && !nonAssignedConfigured;\n      if (!unmatchedNeedsAttention && !splitWarnings.length) return;\n      const lines = ["CONTROLLO ABBINAMENTI", ""];\n      if (unmatchedNeedsAttention) {\n        lines.push(`${unmatched.length} agenzie del file non sono associate a un nominativo. Aggiungi il nominativo “NON ASSEGNATI” con la tua email per riceverle in un unico file:`, ...unmatched.slice(0, 15).map((item) => `• ${item.label}`));\n        if (unmatched.length > 15) lines.push(`• ...e altre ${unmatched.length - 15}`);\n      }',
    'OutlookEmail unmatched alert'
  );

  s = replaceOnce(
    s,
    '  }, [sourceAgencies, agents, fileMode, splitWarnings]);',
    '  }, [sourceAgencies, agents, fileMode, splitWarnings, nonAssignedConfigured]);',
    'OutlookEmail alert deps'
  );

  s = replaceOnce(
    s,
    '    if (fileMode === "single" && unassociatedSourceAgencies.length) return setNotice(`Ci sono ${unassociatedSourceAgencies.length} agenzie del file senza nominativo associato. Correggi prima gli abbinamenti.`);',
    '    if (fileMode === "single" && unassociatedSourceAgencies.length && !nonAssignedConfigured) return setNotice(`Ci sono ${unassociatedSourceAgencies.length} agenzie del file senza nominativo associato. Aggiungi il nominativo “NON ASSEGNATI” con l’email a cui inviarle.`);\n    if (fileMode === "single" && unassociatedSourceAgencies.length && nonAssignedConfigured && !nonAssignedFile) return setNotice("Sto preparando NON ASSEGNATI.xlsx. Attendi un istante e riprova.");',
    'OutlookEmail local drafts guard'
  );

  s = replaceOnce(
    s,
    '  const hasAssociationAlerts = unassociatedSourceAgencies.length > 0 || unmatchedManualFiles.length > 0 || splitWarnings.length > 0;',
    '  const hasAssociationAlerts = (unassociatedSourceAgencies.length > 0 && !nonAssignedConfigured) || unmatchedManualFiles.length > 0 || splitWarnings.length > 0;',
    'OutlookEmail association alert flag'
  );

  s = replaceOnce(
    s,
    '                {!!unassociatedSourceAgencies.length && <div style={{ marginTop: 8, color: "#9a3412" }}><strong>Agenzie del file senza nominativo associato ({unassociatedSourceAgencies.length}):</strong> {unassociatedSourceAgencies.map((item) => item.label).join(", ")}</div>}',
    '                {!!unassociatedSourceAgencies.length && nonAssignedConfigured && <div style={{ marginTop: 8, color: "#166534" }}><strong>{unassociatedSourceAgencies.length} agenzie non associate</strong> saranno raccolte nel file <strong>NON ASSEGNATI.xlsx</strong> e inviate a <strong>{nonAssignedAgent?.email}</strong>.</div>}\n                {!!unassociatedSourceAgencies.length && !nonAssignedConfigured && <div style={{ marginTop: 8, color: "#9a3412" }}><strong>Agenzie del file senza nominativo associato ({unassociatedSourceAgencies.length}):</strong> {unassociatedSourceAgencies.map((item) => item.label).join(", ")}<div style={{ marginTop: 4 }}>Aggiungi un nominativo chiamato <strong>NON ASSEGNATI</strong> e inserisci la tua email.</div></div>}',
    'OutlookEmail association UI'
  );

  write(path, s);
}

function makeSplitWorkbookFunction(rowType) {
  return `async function splitWorkbook(sourceFile: File, recipients: ${rowType}[]) {\n  const data = await sourceFile.arrayBuffer();\n  const workbook = XLSX.read(data, { type: "array", cellDates: true });\n  const preferredHeader = findPreferredAgencyHeader();\n  const groups = new Map<string, GroupData>();\n\n  for (const sheetName of workbook.SheetNames) {\n    const sourceSheet = workbook.Sheets[sheetName];\n    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, { header: 1, defval: "", raw: false }) as unknown[][];\n    if (!matrix.length) continue;\n    const detected = detectAgencyColumn(matrix, preferredHeader);\n    if (!detected) continue;\n    const prefix = matrix.slice(0, detected.rowIndex + 1).map((row) => [...row]);\n    for (let rowIndex = detected.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {\n      const row = matrix[rowIndex] || [];\n      const label = String(row[detected.colIndex] ?? "").trim();\n      const key = normalize(label);\n      if (!key) continue;\n      if (!groups.has(key)) groups.set(key, { label, sheets: new Map() });\n      const group = groups.get(key)!;\n      if (!group.sheets.has(sheetName)) group.sheets.set(sheetName, prefix.map((item) => [...item]));\n      group.sheets.get(sheetName)!.push([...row]);\n    }\n  }\n\n  const generated = new Map<string, File>();\n  const generatedNameByKey = new Map<string, string>();\n  for (const [key, group] of groups) {\n    const outWorkbook = XLSX.utils.book_new();\n    for (const [sheetName, rows] of group.sheets) {\n      const outSheet = XLSX.utils.aoa_to_sheet(rows as any[][]);\n      const originalSheet = workbook.Sheets[sheetName] as any;\n      if (originalSheet?.["!cols"]) (outSheet as any)["!cols"] = originalSheet["!cols"];\n      XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);\n    }\n    const fileName = sanitizeFileName(group.label || key).replace(/\\.xlsx$/i, "") + ".xlsx";\n    const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;\n    generated.set(normalize(fileName), new File([outData], fileName, {\n      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n    }));\n    generatedNameByKey.set(key, fileName);\n  }\n\n  const wantsNonAssigned = recipients.some((row) => normalize(row.agency) === "NONASSEGNATI");\n  if (wantsNonAssigned) {\n    const assignedFileNames = new Set(\n      recipients\n        .filter((row) => normalize(row.agency) !== "NONASSEGNATI")\n        .map((row) => normalize(row.fileName || ""))\n        .filter(Boolean)\n    );\n    const mergedSheets = new Map<string, { rows: unknown[][]; cols?: any }>();\n\n    for (const [key, group] of groups) {\n      const generatedName = generatedNameByKey.get(key) || "";\n      if (assignedFileNames.has(normalize(generatedName))) continue;\n\n      for (const [sheetName, rows] of group.sheets) {\n        const current = mergedSheets.get(sheetName);\n        if (!current) {\n          mergedSheets.set(sheetName, {\n            rows: rows.map((row) => [...row]),\n            cols: (workbook.Sheets[sheetName] as any)?.["!cols"],\n          });\n          continue;\n        }\n        const detected = detectAgencyColumn(rows, preferredHeader);\n        const dataStart = detected ? detected.rowIndex + 1 : 1;\n        current.rows.push(...rows.slice(dataStart).map((row) => [...row]));\n      }\n    }\n\n    if (mergedSheets.size) {\n      const outWorkbook = XLSX.utils.book_new();\n      for (const [sheetName, value] of mergedSheets) {\n        const outSheet = XLSX.utils.aoa_to_sheet(value.rows as any[][]);\n        if (value.cols) (outSheet as any)["!cols"] = value.cols;\n        XLSX.utils.book_append_sheet(outWorkbook, outSheet, sheetName);\n      }\n      const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;\n      const fileName = "NON ASSEGNATI.xlsx";\n      generated.set(normalize(fileName), new File([outData], fileName, {\n        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n      }));\n    }\n  }\n\n  return generated;\n}\n\n`;
}

{
  const path = 'src/OutlookEmailSingleDraftFix.tsx';
  let s = read(path);
  s = replaceRegex(
    s,
    /async function splitWorkbook\(sourceFile: File\) \{[\s\S]*?\n\}\n\nexport default function OutlookEmailSingleDraftFix\(\) \{/,
    makeSplitWorkbookFunction('DraftRow') + 'export default function OutlookEmailSingleDraftFix() {',
    'SingleDraft splitWorkbook'
  );
  s = replaceOnce(s, 'const splitFiles = await splitWorkbook(sourceFile);', 'const splitFiles = await splitWorkbook(sourceFile, readyRows);', 'SingleDraft call');
  write(path, s);
}

{
  const path = 'src/OutlookEmailAutoSendPackageSafe.tsx';
  let s = read(path);
  s = replaceRegex(
    s,
    /async function splitWorkbook\(sourceFile: File\) \{[\s\S]*?\n\}\n\nconst psScript/,
    makeSplitWorkbookFunction('Recipient') + 'const psScript',
    'AutoSend splitWorkbook'
  );
  s = replaceOnce(s, 'if (sourceFileRef.current) available = await splitWorkbook(sourceFileRef.current);', 'if (sourceFileRef.current) available = await splitWorkbook(sourceFileRef.current, recipients);', 'AutoSend call');
  write(path, s);
}

{
  const path = 'src/OutlookEmailPreview.tsx';
  let s = read(path);
  const newPreview = `function readAssignedNormalFileNames() {\n  const table = Array.from(document.querySelectorAll<HTMLTableElement>("table")).find((candidate) =>\n    Array.from(candidate.querySelectorAll("thead th")).some((cell) =>\n      (cell.textContent || "").includes("File associato / Stato")\n    )\n  );\n  if (!table) return new Set<string>();\n\n  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));\n  const agencyIndex = headers.findIndex((cell) => (cell.textContent || "").trim() === "Agenzia");\n  const statusIndex = headers.findIndex((cell) => (cell.textContent || "").includes("File associato / Stato"));\n  if (agencyIndex < 0 || statusIndex < 0) return new Set<string>();\n\n  const names = new Set<string>();\n  Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).forEach((row) => {\n    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));\n    const agencyInput = cells[agencyIndex]?.querySelector<HTMLInputElement>("input");\n    const agency = (agencyInput?.value || cells[agencyIndex]?.textContent || "").trim();\n    if (normalize(agency) === "NONASSEGNATI") return;\n    const fileName = extractFileName((cells[statusIndex]?.textContent || "").trim());\n    if (fileName) names.add(normalize(stripExtension(fileName)));\n  });\n  return names;\n}\n\nasync function parseSplitPreview(sourceFile: File, targetFileName: string): Promise<PreviewSheet[]> {\n  const data = await sourceFile.arrayBuffer();\n  const workbook = XLSX.read(data, { type: "array", cellDates: true });\n  const targetStem = normalize(stripExtension(targetFileName));\n  const preferredHeader = findPreferredAgencyHeader();\n  const sheets: PreviewSheet[] = [];\n  const isNonAssignedTarget = targetStem === normalize("NON ASSEGNATI");\n  const assignedNormalFiles = isNonAssignedTarget ? readAssignedNormalFileNames() : new Set<string>();\n\n  for (const sheetName of workbook.SheetNames) {\n    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {\n      header: 1,\n      defval: "",\n      raw: false,\n    }) as unknown[][];\n    if (!matrix.length) continue;\n\n    const detected = detectAgencyColumn(matrix, preferredHeader);\n    if (!detected) continue;\n\n    const prefix = matrix.slice(0, detected.rowIndex + 1);\n    const matchedRows = matrix.slice(detected.rowIndex + 1).filter((row) => {\n      const label = String((row || [])[detected.colIndex] ?? "").trim();\n      if (!label) return false;\n      const generatedStem = normalize(stripExtension(sanitizeFileName(label) + ".xlsx"));\n      if (isNonAssignedTarget) return !assignedNormalFiles.has(generatedStem);\n      return generatedStem === targetStem || normalize(label) === targetStem;\n    });\n\n    if (matchedRows.length) {\n      sheets.push({\n        name: sheetName,\n        rows: matrixToStrings([...prefix, ...matchedRows]),\n      });\n    }\n  }\n\n  return sheets;\n}\n\n`;
  s = replaceRegex(
    s,
    /async function parseSplitPreview\(sourceFile: File, targetFileName: string\): Promise<PreviewSheet\[]> \{[\s\S]*?\n\}\n\nfunction downloadFile/,
    newPreview + 'function downloadFile',
    'Preview NON ASSEGNATI parser'
  );
  write(path, s);
}

console.log('NON ASSEGNATI patch applied successfully.');
