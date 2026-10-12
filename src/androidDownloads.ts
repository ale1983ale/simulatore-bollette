/** Salvataggio ZIP: i blob: URL non sono gestiti dalla WebView Android. */
type AndroidZipBridge = { saveZip?: (base64: string, fileName: string) => void };
export async function downloadZipBlob(blob: Blob, fileName: string): Promise<"native" | "browser"> {
  const bridge = (window as Window & { AndroidFiles?: AndroidZipBridge }).AndroidFiles;
  if (typeof bridge?.saveZip === "function") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    }
    bridge.saveZip(btoa(chunks.join("")), fileName);
    return "native";
  }
  if (/GestioneEnergiaAndroid/i.test(navigator.userAgent)) {
    throw new Error("Questa versione di Gestione Energia non gestisce i download ZIP. Aggiorna l'APK alla versione 1.0.7 oppure apri la webapp in Chrome.");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "browser";
}
