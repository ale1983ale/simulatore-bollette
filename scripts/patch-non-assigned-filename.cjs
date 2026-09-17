const fs = require('fs');
const path = 'src/OutlookEmail.tsx';
let s = fs.readFileSync(path, 'utf8');

const oldSig = `async function buildNonAssignedWorkbook(\n  sources: SourceAgency[],\n  generatedByAgency: Map<string, File>,\n  preferredHeader: string\n): Promise<File | null> {`;
const newSig = `async function buildNonAssignedWorkbook(\n  sources: SourceAgency[],\n  generatedByAgency: Map<string, File>,\n  preferredHeader: string,\n  originalFileName: string\n): Promise<File | null> {`;
if (!s.includes(oldSig)) throw new Error('Firma buildNonAssignedWorkbook non trovata');
s = s.replace(oldSig, newSig);

const oldReturn = `  const outData = XLSX.write(outWorkbook, { type: \"array\", bookType: \"xlsx\" }) as ArrayBuffer;\n  return new File([outData], NON_ASSIGNED_LABEL + \".xlsx\", {\n    type: \"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\",\n  });`;
const newReturn = `  const outData = XLSX.write(outWorkbook, { type: \"array\", bookType: \"xlsx\" }) as ArrayBuffer;\n  const originalStem = sanitizeFileName(stripExtension(originalFileName || \"\")).trim();\n  const nonAssignedName = originalStem\n    ? \`\${NON_ASSIGNED_LABEL} \${originalStem}.xlsx\`\n    : \`\${NON_ASSIGNED_LABEL}.xlsx\`;\n  return new File([outData], nonAssignedName, {\n    type: \"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\",\n  });`;
if (!s.includes(oldReturn)) throw new Error('Blocco nome NON ASSEGNATI non trovato');
s = s.replace(oldReturn, newReturn);

const oldCall = `    void buildNonAssignedWorkbook(\n      unassociatedSourceAgencies,\n      generatedByAgency,\n      preferredAgencyHeader\n    )`;
const newCall = `    void buildNonAssignedWorkbook(\n      unassociatedSourceAgencies,\n      generatedByAgency,\n      preferredAgencyHeader,\n      sourceFile?.name || \"\"\n    )`;
if (!s.includes(oldCall)) throw new Error('Chiamata buildNonAssignedWorkbook non trovata');
s = s.replace(oldCall, newCall);

const oldDeps = `  }, [fileMode, unassociatedSourceAgencies, generatedByAgency, preferredAgencyHeader]);`;
const newDeps = `  }, [fileMode, unassociatedSourceAgencies, generatedByAgency, preferredAgencyHeader, sourceFile]);`;
if (!s.includes(oldDeps)) throw new Error('Dipendenze useEffect non trovate');
s = s.replace(oldDeps, newDeps);

s = s.replace('Sto preparando NON ASSEGNATI.xlsx. Attendi un istante e riprova.', 'Sto preparando il file NON ASSEGNATI con il nome del file originale. Attendi un istante e riprova.');
s = s.replace('Errore nella creazione di NON ASSEGNATI.xlsx:', 'Errore nella creazione del file NON ASSEGNATI:');

fs.writeFileSync(path, s);
console.log('Patch applicata');
