import fs from "node:fs";

const path = "src/OutlookEmail.tsx";
let source = fs.readFileSync(path, "utf8");
const original = source;

const signatureOld = `async function buildNonAssignedWorkbook(\n  sources: SourceAgency[],\n  generatedByAgency: Map<string, File>,\n  preferredHeader: string\n): Promise<File | null> {`;
const signatureNew = `async function buildNonAssignedWorkbook(\n  sources: SourceAgency[],\n  generatedByAgency: Map<string, File>,\n  preferredHeader: string,\n  sourceFileName: string\n): Promise<File | null> {`;
if (!source.includes(signatureOld)) throw new Error("Firma buildNonAssignedWorkbook non trovata");
source = source.replace(signatureOld, signatureNew);

const fileOld = `  const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;\n  return new File([outData], NON_ASSIGNED_LABEL + ".xlsx", {\n    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n  });`;
const fileNew = `  const outData = XLSX.write(outWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;\n  const originalStem = stripExtension(sourceFileName).trim();\n  const nonAssignedStem = originalStem\n    ? \`\${NON_ASSIGNED_LABEL} \${originalStem}\`\n    : NON_ASSIGNED_LABEL;\n  const nonAssignedName = \`\${sanitizeFileName(nonAssignedStem).replace(/\\.xlsx$/i, "")}\.xlsx\`;\n\n  return new File([outData], nonAssignedName, {\n    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n  });`;
if (!source.includes(fileOld)) throw new Error("Creazione file NON ASSEGNATI non trovata");
source = source.replace(fileOld, fileNew);

const callOld = `    void buildNonAssignedWorkbook(\n      unassociatedSourceAgencies,\n      generatedByAgency,\n      preferredAgencyHeader\n    )`;
const callNew = `    void buildNonAssignedWorkbook(\n      unassociatedSourceAgencies,\n      generatedByAgency,\n      preferredAgencyHeader,\n      sourceFile?.name || ""\n    )`;
if (!source.includes(callOld)) throw new Error("Chiamata buildNonAssignedWorkbook non trovata");
source = source.replace(callOld, callNew);

const depsOld = `  }, [fileMode, unassociatedSourceAgencies, generatedByAgency, preferredAgencyHeader]);`;
const depsNew = `  }, [fileMode, unassociatedSourceAgencies, generatedByAgency, preferredAgencyHeader, sourceFile?.name]);`;
if (!source.includes(depsOld)) throw new Error("Dipendenze useEffect NON ASSEGNATI non trovate");
source = source.replace(depsOld, depsNew);

if (source === original) throw new Error("Nessuna modifica applicata");
fs.writeFileSync(path, source);
console.log("Patch NON ASSEGNATI applicata");
