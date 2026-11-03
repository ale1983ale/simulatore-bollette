import React, { useEffect, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getRecruitingPerformaCvBlob } from "./performaIntegration";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function RecruitingCvMobilePreview({ sourceId, zoom }: { sourceId: string; zoom: number }) {
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof getDocument> | null = null;
    setPages([]);
    setError("");
    void (async () => {
      try {
        const blob = await getRecruitingPerformaCvBlob(sourceId);
        const data = new Uint8Array(await blob.arrayBuffer());
        task = getDocument({ data });
        const pdf = await task.promise;
        const rendered: HTMLCanvasElement[] = [];
        for (let index = 1; index <= pdf.numPages; index++) {
          if (cancelled) return;
          const page = await pdf.getPage(index);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas non disponibile.");
          await page.render({ canvasContext: context, viewport }).promise;
          rendered.push(canvas);
          if (!cancelled) setPages([...rendered]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Anteprima non disponibile.");
      }
    })();
    return () => { cancelled = true; void task?.destroy(); };
  }, [sourceId]);
  if (error) return <div style={{ padding: 24, textAlign: "center", color: "#b91c1c" }}>{error}</div>;
  if (!pages.length) return <div style={{ padding: 24, textAlign: "center" }}>Caricamento curriculum…</div>;
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 10 }}>
    {pages.map((canvas, index) => <div key={index} style={{ width: (zoom * 100) + "%", maxWidth: "none", background: "white", boxShadow: "0 2px 8px #0002" }}>
      <img src={canvas.toDataURL("image/png")} alt={"Pagina " + (index + 1)} draggable={false} style={{ display: "block", width: "100%", height: "auto" }} />
    </div>)}
  </div>;
}
