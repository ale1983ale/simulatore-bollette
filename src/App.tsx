import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "./supabase";

type MonthlyRow = {
  mese: string;
  anno: number;
  mono: number;
  f1: number;
  f2: number;
  f3: number;
  psv: number;
};

type DispCpRow = {
  mese: string;
  dispacciamento: number;
  cpMarket: number;
};

type EnergyOffer = {
  nome: string;
  canone: number;
  spread: number;
  maggiorazioneCapacityMarket: number;
};

type GasOffer = {
  nome: string;
  canone: number;
  spread: number;
  quotaVariabile: number;
};

type GasAcciseSettings = {
  agevolata: number;
  nonAgevolata: number;
};

type Agent = {
  id?: number;
  nome: string;
  cognome: string;
  username: string;
  password: string;
  owner_auth_id?: string;
};

type AdminProfile = {
  id?: number;
  nome?: string;
  username: string;
  password: string;
  role: "super_admin" | "admin";
};
type PunPsvRow = {
  mese: string;
  mono: number;
  f1: number;
  f2: number;
  f3: number;
  psv: number;
};

const PUN_PSV_MONTHS = [
"GENNAIO 2024",
"FEBBRAIO 2024",
"MARZO 2024",
"APRILE 2024",
"MAGGIO 2024",
"GIUGNO 2024",
"LUGLIO 2024",
"AGOSTO 2024",
"SETTEMBRE 2024",
"OTTOBRE 2024",
"NOVEMBRE 2024",
"DICEMBRE 2024","GENNAIO 2025",
  "FEBBRAIO 2025",
  "MARZO 2025",
  "APRILE 2025",
  "MAGGIO 2025",
  "GIUGNO 2025",
  "LUGLIO 2025",
  "AGOSTO 2025",
  "SETTEMBRE 2025",
  "OTTOBRE 2025",
  "NOVEMBRE 2025",
  "DICEMBRE 2025",
  "GENNAIO 2026",
  "FEBBRAIO 2026",
  "MARZO 2026",
  "APRILE 2026",
  "MAGGIO 2026",
  "GIUGNO 2026",
  "LUGLIO 2026",
  "AGOSTO 2026",
  "SETTEMBRE 2026",
  "OTTOBRE 2026",
  "NOVEMBRE 2026",
  "DICEMBRE 2026",
  "GENNAIO 2027",
  "FEBBRAIO 2027",
  "MARZO 2027",
  "APRILE 2027",
  "MAGGIO 2027",
  "GIUGNO 2027",
  "LUGLIO 2027",
  "AGOSTO 2027",
  "SETTEMBRE 2027",
  "OTTOBRE 2027",
  "NOVEMBRE 2027",
  "DICEMBRE 2027",
  "GENNAIO 2028",
  "FEBBRAIO 2028",
  "MARZO 2028",
  "APRILE 2028",
  "MAGGIO 2028",
  "GIUGNO 2028",
  "LUGLIO 2028",
  "AGOSTO 2028",
  "SETTEMBRE 2028",
  "OTTOBRE 2028",
  "NOVEMBRE 2028",
  "DICEMBRE 2028",
  "GENNAIO 2029",
  "FEBBRAIO 2029",
  "MARZO 2029",
  "APRILE 2029",
  "MAGGIO 2029",
  "GIUGNO 2029",
  "LUGLIO 2029",
  "AGOSTO 2029",
  "SETTEMBRE 2029",
  "OTTOBRE 2029",
  "NOVEMBRE 2029",
  "DICEMBRE 2029",
];

const INITIAL_PUN_PSV_ROWS: PunPsvRow[] = [
  { mese: "FISSO DOMESTICO", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  { mese: "FISSO BUSINESS", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  ...PUN_PSV_MONTHS.map((mese) => ({
    mese,
    mono: 0,
    f1: 0,
    f2: 0,
    f3: 0,
    psv: 0,
  })),
];

function getLast12PunPsvRows(rows: any[], selectedMonth: string) {
  const index = rows.findIndex((r) => r.mese === selectedMonth);
  if (index === -1) return [];

  return rows.slice(Math.max(0, index - 11), index + 1);
}

function getSvgPoints(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const paddingX = 28;
  const usableWidth = width - paddingX * 2;

  return values
    .map((v, i) => {
      const x =
        paddingX + (i / Math.max(values.length - 1, 1)) * usableWidth;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}
function getChartCoords(values: number[], width: number, height: number) {
  if (!values.length) return [];

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const paddingX = 28; // margine laterale per non tagliare i mesi
  const usableWidth = width - paddingX * 2;

  return values.map((v, i) => {
    const x =
      paddingX + (i / Math.max(values.length - 1, 1)) * usableWidth;
    const y = height - ((v - min) / range) * height;
    return { x, y, value: v };
  });
}
const MESI = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

const ANNI = [2024,2025, 2026, 2027, 2028, 2029];

function getMonthYearSortValue(label: string) {
  if (label === "FISSO DOMESTICO") return Number.MAX_SAFE_INTEGER;
  if (label === "FISSO BUSINESS") return Number.MAX_SAFE_INTEGER - 1;

  const parts = String(label).trim().split(" ");
  if (parts.length < 2) return -1;

  const mese = parts[0];
  const anno = Number(parts[1]);
  const meseIndex = MESI.indexOf(mese);

  if (!Number.isFinite(anno) || meseIndex === -1) return -1;

  return anno * 100 + meseIndex;
}

const INITIAL_MONTHLY: MonthlyRow[] = [
  { mese: "FISSO DOMESTICO", anno: 0, mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
  { mese: "FISSO BUSINESS", anno: 0, mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },

  ...ANNI.flatMap((anno) =>
    MESI.map((mese) => ({
      mese,
      anno,
      mono: 0,
      f1: 0,
      f2: 0,
      f3: 0,
      psv: 0,
    }))
  ),
];

const INITIAL_DISP_CP_ROWS: DispCpRow[] = [
  { mese: "GENNAIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "FEBBRAIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "MARZO", dispacciamento: 0, cpMarket: 0 },
  { mese: "APRILE", dispacciamento: 0, cpMarket: 0 },
  { mese: "MAGGIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "GIUGNO", dispacciamento: 0, cpMarket: 0 },
  { mese: "LUGLIO", dispacciamento: 0, cpMarket: 0 },
  { mese: "AGOSTO", dispacciamento: 0, cpMarket: 0 },
  { mese: "SETTEMBRE", dispacciamento: 0, cpMarket: 0 },
  { mese: "OTTOBRE", dispacciamento: 0, cpMarket: 0 },
  { mese: "NOVEMBRE", dispacciamento: 0, cpMarket: 0 },
  { mese: "DICEMBRE", dispacciamento: 0, cpMarket: 0 },
];

const INITIAL_ENERGY_OFFERS: EnergyOffer[] = [
  { nome: "IMPRESA", canone: 16, spread: 0.03, maggiorazioneCapacityMarket: 0.01 },
  { nome: "IMPRESAUNICA", canone: 15, spread: 0.02, maggiorazioneCapacityMarket: 0.008 },
  { nome: "IMPRESASPECIAL", canone: 14, spread: 0.015, maggiorazioneCapacityMarket: 0.005 },
  { nome: "SCELTA", canone: 16, spread: 0.025, maggiorazioneCapacityMarket: 0.01 },
  { nome: "SCELTAUNICA", canone: 15, spread: 0.015, maggiorazioneCapacityMarket: 0.01 },
  { nome: "SCELTASPECIAL", canone: 14, spread: 0.011, maggiorazioneCapacityMarket: 0.004 },
  { nome: "VALORE", canone: 15, spread: 0.03, maggiorazioneCapacityMarket: 0.01 },
  { nome: "VALOREUNICA", canone: 14, spread: 0.02, maggiorazioneCapacityMarket: 0.01 },
  { nome: "VALORESPECIAL", canone: 13, spread: 0.015, maggiorazioneCapacityMarket: 0.007 },
  { nome: "CASA", canone: 12, spread: 0.04, maggiorazioneCapacityMarket: 0 },
  { nome: "CASAUNICA", canone: 12, spread: 0.03, maggiorazioneCapacityMarket: 0 },
  { nome: "CASASPECIAL", canone: 10, spread: 0.025, maggiorazioneCapacityMarket: 0 },
  { nome: "DEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0 },
  { nome: "SICURADOMESTICO", canone: 12, spread: 0, maggiorazioneCapacityMarket: 0.011 },
  { nome: "SICURABUSINESS", canone: 15, spread: 0, maggiorazioneCapacityMarket: 0.011 },
  { nome: "CONDOMINI 5", canone: 20, spread: 0.022, maggiorazioneCapacityMarket: 0.022 },
  { nome: "CONDOMINI 10", canone: 25, spread: 0.022, maggiorazioneCapacityMarket: 0.022 },
  { nome: "CONDOMINI 15", canone: 30, spread: 0.022, maggiorazioneCapacityMarket: 0.022 },
  { nome: "BILANCIATA", canone: 18.5, spread: 0, maggiorazioneCapacityMarket: 0 },
];

const INITIAL_GAS_OFFERS: GasOffer[] = [
  { nome: "IMPRESA", canone: 16, spread: 0.12, quotaVariabile: 0.1 },
  { nome: "IMPRESAUNICA", canone: 14, spread: 0.09, quotaVariabile: 0.08 },
  { nome: "SCELTA", canone: 16, spread: 0.1, quotaVariabile: 0.1 },
  { nome: "SCELTAUNICA", canone: 13, spread: 0.08, quotaVariabile: 0.05 },
  { nome: "VALORE", canone: 15, spread: 0.15, quotaVariabile: 0.1 },
  { nome: "VALOREUNICA", canone: 13, spread: 0.1, quotaVariabile: 0.09 },
  { nome: "DEDICATA", canone: 0, spread: 0, quotaVariabile: 0 },
  { nome: "CASA", canone: 12, spread: 0.15, quotaVariabile: 0.1 },
  { nome: "CASAUNICA", canone: 10, spread: 0.1, quotaVariabile: 0.09 },
  { nome: "SICURADOMESTICO", canone: 12, spread: 0, quotaVariabile: 0.1 },
  { nome: "SICURABUSINESS", canone: 15, spread: 0, quotaVariabile: 0.1 },
  { nome: "CONDOMINI 5", canone: 0, spread: 0, quotaVariabile: 0 },
  { nome: "CONDOMINI 10", canone: 0, spread: 0, quotaVariabile: 0 },
  { nome: "CONDOMINI 15", canone: 0, spread: 0, quotaVariabile: 0 },
];

const energyTypes = [
  "RESIDENTE",
  "NON RESIDENTE",
  "RESIDENTE CANONE ESENTE",
  "BTA1",
  "BTA2",
  "BTA3",
  "BTA4",
  "BTA5",
  "BTA6",
  "MTA1",
  "MTA2",
  "MTA3",
];

const energyBilling = [
  "MENSILE",
  "BIMESTRALE",
  "MULTI POD MENSILE",
  "MULTI POD BIMESTRALE",
];

const gasBilling = [
  "MENSILE",
  "BIMESTRALE",
  "TRIMESTRALE",
  "QUADRIMESTRALE",
];

const n = (v: any) => {
  const x = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

const money = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(v || 0);

const numFormat = (v: number, decimals: number) =>
  Number(v || 0).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const isSi = (v: string) => String(v).trim().toUpperCase() === "SI";

const energyMonths = (f: string) =>
  f === "BIMESTRALE" || f === "MULTI POD BIMESTRALE" ? 2 : 1;

const gasMonths = (f: string) =>
  f === "BIMESTRALE" ? 2 : f === "TRIMESTRALE" ? 3 : f === "QUADRIMESTRALE" ? 4 : 1;

const energyVatRate = (tipo: string, iva: string) =>
  ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(tipo) ? 10 : n(iva);

function energyPdfTipologia(tipo: string) {
  if (tipo === "RESIDENTE" || tipo === "RESIDENTE CANONE ESENTE") return "DOMESTICO RESIDENTE";
  if (tipo === "NON RESIDENTE") return "DOMESTICO NON RESIDENTE";
  if (["BTA1", "BTA2", "BTA3", "BTA4", "BTA5", "BTA6"].includes(tipo)) return "ALTRI USI BT";
  if (["MTA1", "MTA2", "MTA3"].includes(tipo)) return "ALTRI USI MT";
  return tipo || "-";
}

function sanitizeFileName(name: string) {
  const cleaned = (name || "Cliente")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Cliente";
}

function printHtmlDocument(title: string, html: string, fileName?: string) {
  const win = window.open("", "_blank", "width=1000,height=900");
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 12px;
            background: #ffffff;
            color: #0f172a;
          }
          .page {
            width: 100%;
            max-width: 650px;
            margin: 0 auto;
          }
          .topbar {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .topbar-energy {
            border-bottom: 2px solid #f97316;
          }
          .topbar-gas {
            border-bottom: 2px solid #2563eb;
          }
          .title {
            font-size: 19px;
            font-weight: 700;
            margin: 0;
          }
          .box {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 9px;
            margin-bottom: 10px;
          }
          .box-energy {
            border: 2px solid #f97316 !important;
          }
          .box-gas {
            border: 2px solid #2563eb !important;
          }
          .section-title {
            font-size: 11px;
            font-weight: 700;
            margin: 0 0 6px 0;
            text-transform: uppercase;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .bar {
            height: 7px;
            border-radius: 0;
            margin-bottom: 6px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px 10px;
          }
          .label {
            font-size: 9px;
            color: #64748b;
            margin-bottom: 1px;
          }
          .value {
            font-size: 10px;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
          }
          th, td {
            padding: 4px 3px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            font-size: 10px;
            vertical-align: top;
          }
          th {
            font-size: 8px;
            color: #7c3aed;
            font-weight: 700;
          }
          th:nth-child(2), th:nth-child(3), th:nth-child(4),
          td:nth-child(2), td:nth-child(3), td:nth-child(4) {
            text-align: right;
            white-space: nowrap;
          }
          .strong-row td {
            font-weight: 700;
          }
          .sub-row td:first-child {
            color: #4b5563;
          }
          .total {
            margin-top: 8px;
            border-radius: 0;
            padding: 9px 11px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 15px;
            font-weight: 700;
            color: white;
          }
          .savings {
            margin-top: 8px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 8px 10px;
          }
          .savings-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            font-size: 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          .savings-row:last-child {
            border-bottom: none;
          }
          .savings-row strong {
            font-size: 11px;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          @media print {
            html, body {
              background: #ffffff !important;
            }
            body {
              padding: 0;
            }
            .page {
              max-width: none;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);

  win.document.close();
  win.focus();

  const finalFileName = sanitizeFileName(fileName || title);

  setTimeout(async () => {
    try {
      const doc = win.document;
      const page = doc.querySelector(".page") as HTMLElement | null;

      if (!page) {
        win.print();
        return;
      }

      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default;

      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 8;
      const usableWidth = pdfWidth - margin * 2;
      const usableHeight = pdfHeight - margin * 2;

      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= usableHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= usableHeight;
      }

      pdf.save(`${finalFileName}.pdf`);
      win.close();
    } catch {
      win.print();
    }
  }, 400);
}

function field(label: string, value: string, setValue: (v: string) => void, type = "text") {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <input
        style={{
          width: "100%",
          padding: 8,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          boxSizing: "border-box",
        }}
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function selectField(label: string, value: string, setValue: (v: string) => void, options: string[]) {
  return (
    <div>
      <div
 style={{
   fontSize:12,
   fontWeight:700,
   marginBottom:4,
   color:
     label === "Mese 1" || label === "Mese 2"
       ? "#c96a00"
       : "inherit"
 }}
>
 {label}
</div>
      <select
        style={{
          width: "100%",
          padding: 8,
          border:
            label === "Mese 1" || label === "Mese 2"
              ? "2px solid #d97706"
              : "1px solid #cbd5e1",
        
          background:
            label === "Mese 1" || label === "Mese 2"
              ? "#fff4e8"
              : "white",
        
          color:
            label === "Mese 1" || label === "Mese 2"
              ? "#c96a00"
              : "inherit",
        
          fontWeight:
            label === "Mese 1" || label === "Mese 2"
              ? 700
              : 400,
        
          borderRadius: 8,
          boxSizing: "border-box",
        }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "-"}
          </option>
        ))}
      </select>
    </div>
  );
}

function readonlyField(label: string, value: string) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <input
        style={{
          width: "100%",
          padding: 8,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          boxSizing: "border-box",
          background: "#f8fafc",
          color: "#0f172a",
        }}
        type="text"
        value={value}
        readOnly
      />
    </div>
  );
}

function toggleAmount(
  label: string,
  flag: string,
  setFlag: (v: string) => void,
  value: string,
  setValue: (v: string) => void
) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 12,
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <select value={flag} onChange={(e) => setFlag(e.target.value)} style={{ padding: 6, borderRadius: 8 }}>
          <option>NO</option>
          <option>SI</option>
        </select>
      </div>
      {isSi(flag) && (
        <input
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxSizing: "border-box",
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          step="0.000001"
          placeholder="Importo"
        />
      )}
    </div>
  );
}

function row(label: string, value: string, bold = false, fontSize?: number) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid #e2e8f0",
        gap: 12,
        fontWeight: bold ? 700 : 400,
        fontSize: fontSize || 14,
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function previewBox(children: React.ReactNode, accent = "#e2e8f0") {
  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        borderRadius: 10,
        padding: 12,
        background: "#ffffff",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function sLikeBimestrale(fatturazione: string) {
  return fatturazione === "BIMESTRALE" || fatturazione === "MULTI POD BIMESTRALE";
}

function calcEnergia(
  d: any,
  punPsvRows: PunPsvRow[],
  energyOffers: EnergyOffer[],
  dispCpRows: DispCpRow[]
) {
  const off = energyOffers.find((x) => x.nome === d.offerta) || energyOffers[0];

  const row1 = punPsvRows.find((x) => x.mese === d.mese1) || punPsvRows[0];
  const row2 = punPsvRows.find((x) => x.mese === d.mese2) || punPsvRows[0];

  const fissoDomesticoRow =
    punPsvRows.find((x) => x.mese === "FISSO DOMESTICO") || punPsvRows[0];

  const fissoBusinessRow =
    punPsvRows.find((x) => x.mese === "FISSO BUSINESS") || punPsvRows[0];

  const mese1IsFisso = d.mese1 === "FISSO DOMESTICO" || d.mese1 === "FISSO BUSINESS";
  const mese2IsFisso = d.mese2 === "FISSO DOMESTICO" || d.mese2 === "FISSO BUSINESS";

  const meseTabella1 = mese1IsFisso ? d.meseRifTabella1 : String(d.mese1 || "").split(" ")[0];
  const meseTabella2 = mese2IsFisso ? d.meseRifTabella2 : String(d.mese2 || "").split(" ")[0];

  const dispRow1 = dispCpRows.find((x) => x.mese === meseTabella1);
  const dispRow2 = dispCpRows.find((x) => x.mese === meseTabella2);

  const isDomestico = ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(d.tipo);
  const fissoRow = isDomestico ? fissoDomesticoRow : fissoBusinessRow;

  const mesi = energyMonths(d.fatturazione);

  const spreadEff = d.offerta === "DEDICATA" ? n(d.dedicataSpread) : n(off.spread);
  const cmEff =
    d.offerta === "DEDICATA"
      ? n(d.dedicataCapacityMarket)
      : n(off.maggiorazioneCapacityMarket);
  const quotaFissaEff =
    d.offerta === "DEDICATA" ? n(d.dedicataQuotaFissa) : n(off.canone);

  const prezzoMono1 = mese1IsFisso ? n(fissoRow.mono) : n(row1.mono);
  const prezzoMono2 = mese2IsFisso ? n(fissoRow.mono) : n(row2.mono);

  const prezzoF11 = mese1IsFisso ? n(fissoRow.f1) : n(row1.f1);
  const prezzoF12 = mese2IsFisso ? n(fissoRow.f1) : n(row2.f1);

  const prezzoF21 = mese1IsFisso ? n(fissoRow.f2) : n(row1.f2);
  const prezzoF22 = mese2IsFisso ? n(fissoRow.f2) : n(row2.f2);

  const prezzoF31 = mese1IsFisso ? n(fissoRow.f3) : n(row1.f3);
  const prezzoF32 = mese2IsFisso ? n(fissoRow.f3) : n(row2.f3);

  const consumiMese1 =
    n(d.f1Mese1) + n(d.f2Mese1) + n(d.f3Mese1) + n(d.monoMese1);
  const consumiMese2 =
    n(d.f1Mese2) + n(d.f2Mese2) + n(d.f3Mese2) + n(d.monoMese2);
  const consumiTot = consumiMese1 + consumiMese2;

  const perditaPercentuale =
    ["MTA1", "MTA2", "MTA3"].includes(d.tipo) ? 0.038 : 0.1;

  const H22_base =
    n(d.f1Mese1) * (prezzoF11 + spreadEff) +
    n(d.f1Mese2) * (prezzoF12 + spreadEff) +
    n(d.f2Mese1) * (prezzoF21 + spreadEff) +
    n(d.f2Mese2) * (prezzoF22 + spreadEff) +
    n(d.f3Mese1) * (prezzoF31 + spreadEff) +
    n(d.f3Mese2) * (prezzoF32 + spreadEff) +
    n(d.monoMese1) * (prezzoMono1 + spreadEff) +
    n(d.monoMese2) * (prezzoMono2 + spreadEff);

  const perditeEnergia =
    n(d.f1Mese1) * perditaPercentuale * (prezzoF11 + spreadEff) +
    n(d.f1Mese2) * perditaPercentuale * (prezzoF12 + spreadEff) +
    n(d.f2Mese1) * perditaPercentuale * (prezzoF21 + spreadEff) +
    n(d.f2Mese2) * perditaPercentuale * (prezzoF22 + spreadEff) +
    n(d.f3Mese1) * perditaPercentuale * (prezzoF31 + spreadEff) +
    n(d.f3Mese2) * perditaPercentuale * (prezzoF32 + spreadEff) +
    n(d.monoMese1) * perditaPercentuale * (prezzoMono1 + spreadEff) +
    n(d.monoMese2) * perditaPercentuale * (prezzoMono2 + spreadEff);

  const totDispCp1 = n(dispRow1?.dispacciamento) + n(dispRow1?.cpMarket);
  const totDispCp2 = n(dispRow2?.dispacciamento) + n(dispRow2?.cpMarket);

  let dispCpBase = 0;
  if (sLikeBimestrale(d.fatturazione) && d.mese2) {
    if (consumiMese1 > 0 || consumiMese2 > 0) {
      const denom = consumiMese1 + consumiMese2;
      dispCpBase =
        denom > 0
          ? (consumiMese1 * totDispCp1 + consumiMese2 * totDispCp2) / denom
          : 0;
    } else {
      dispCpBase = (totDispCp1 + totDispCp2) / 2;
    }
  } else {
    dispCpBase = totDispCp1;
  }

  const consumiTotConPerdite = consumiTot * (1 + perditaPercentuale);
  const dispCpTotale =
    consumiTotConPerdite * (n(d.dispacciamentoCapacityMarket) + cmEff);

  const H22 = H22_base + perditeEnergia + dispCpTotale;
  const H24 = n(d.reattivaImmessa) + n(d.reattivaPrelevata);
  const H25 = n(d.quotaConsumiRete);
  const H28 = n(d.numeroPod) * quotaFissaEff * mesi;
  const H29 = n(d.quotaFissaRete);
  const H30 = n(d.quotaPotenzaRete);

  const H35 = isSi(d.acciseManualiFlag) ? n(d.acciseManualiValore) : consumiTot * 0.0125;
  const H38 = isSi(d.ricalcoloFlag) ? n(d.ricalcoloValore) : 0;
  const H39 = isSi(d.bonusFlag) ? n(d.bonusValore) : 0;
  const H40 = d.tipo === "RESIDENTE" ? 9 * mesi - n(d.canoneRaiGiaPagato) : 0;

  const imponibileIva = H22 + H25 + H24 + H28 + H29 + H30 + H35 + H38;
  const H36 = (imponibileIva * energyVatRate(d.tipo, d.iva)) / 100;
  const H37 = H35 + H36;
  const H41 = H22 + H25 + H24 + H28 + H29 + H30 + H37 + H38 - H39 + H40;

  const risparmioFattura = isSi(d.confrontoFlag) ? H41 - n(d.confrontoValore) : 0;
  const risparmioAnnuo = isSi(d.confrontoFlag) ? (risparmioFattura * 12) / mesi : 0;

  return {
    H22_base,
    H22,
    H24,
    H25,
    H28,
    H29,
    H30,
    H35,
    H36,
    H37,
    H38,
    H39,
    H40,
    H41,
    risparmioFattura,
    risparmioAnnuo,
    consumiTot,
    consumiMese1,
    consumiMese2,
    spreadEff,
    cmEff,
    quotaFissaEff,
    dispCpTotale,
    dispCpBase,
    perditaPercentuale,
    perditeEnergia,
  };
}

function calcGas(d: any, punPsvRows: PunPsvRow[], gasOffers: GasOffer[]) {
  const off = gasOffers.find((x) => x.nome === d.offerta) || gasOffers[0];
  const mesi = gasMonths(d.fatturazione);

  const spreadEff =
    d.offerta === "DEDICATA" ? n(d.dedicataSpread) : n(off.spread);

  const quotaVarEff =
    d.offerta === "DEDICATA"
      ? n(d.dedicataQuotaVariabile)
      : n(off.quotaVariabile);

  const quotaFissaEff =
    d.offerta === "DEDICATA" ? n(d.dedicataQuotaFissa) : n(off.canone);

  const p1 = n((punPsvRows.find((x) => x.mese === d.periodo1) || { psv: 0 }).psv);
  const p2 = n((punPsvRows.find((x) => x.mese === d.periodo2) || { psv: 0 }).psv);
  const p3 = n((punPsvRows.find((x) => x.mese === d.periodo3) || { psv: 0 }).psv);
  const p4 = n((punPsvRows.find((x) => x.mese === d.periodo4) || { psv: 0 }).psv);

  const consumoTotale =
    n(d.consumo1) +
    n(d.consumo2) +
    n(d.consumo3) +
    n(d.consumo4);

  const X55 =
    p1 * n(d.consumo1) +
    p2 * n(d.consumo2) +
    p3 * n(d.consumo3) +
    p4 * n(d.consumo4) +
    consumoTotale * spreadEff;

  const X56 = consumoTotale * quotaVarEff;
  const X57 = consumoTotale * n(d.adeguamentoParametro);
  const H22 = X55 + X56 + X57;
  const H23 = n(d.quotaVariabileAggiuntiva);
  const H24 = H22 + H23;
  const H27 = quotaFissaEff * mesi;
  const H28 = n(d.quotaFissaAggiuntiva);
  const H29 = H27 + H28;
  const accisaCoeff = n(d.accisaValore);
  const H32 = isSi(d.overrideAcciseFlag)
    ? n(d.overrideAcciseValore)
    : consumoTotale * accisaCoeff;
  const H35 = isSi(d.ricalcoloFlag) ? n(d.ricalcoloValore) : 0;
  const H33 = ((H24 + H29 + H32 + H35) / 100) * n(d.iva);
  const H34 = H32 + H33;
  const H36 = isSi(d.bonusFlag) ? n(d.bonusValore) : 0;
  const H37 = H24 + H29 + H34 + H35 - H36;
  const risparmioFattura = isSi(d.confrontoFlag) ? H37 - n(d.confrontoValore) : 0;
  const risparmioAnnuo = isSi(d.confrontoFlag) ? (risparmioFattura / mesi) * 12 : 0;

  return {
    X55,
    X56,
    X57,
    H22,
    H23,
    H24,
    H27,
    H28,
    H29,
    H32,
    H33,
    H34,
    H35,
    H36,
    H37,
    risparmioFattura,
    risparmioAnnuo,
    spreadEff,
    quotaVarEff,
    quotaFissaEff,
    consumoTotale,
    accisaCoeff,
    p1,
    p2,
    p3,
    p4,
  };
}

function Energia({
  punPsvRows,
  energyOffers,
  dispCpRows,
}: {
  punPsvRows: PunPsvRow[];
  energyOffers: EnergyOffer[];
  dispCpRows: DispCpRow[];
}) {
  const [s, setS] = useState({
    iva: "22",
    nome: "",
    pod: "",
    fatturazione: "MENSILE",
    numeroPod: "1",
    tipo: "BTA2",
    offerta: energyOffers[0]?.nome || "",
    mese1: "",
    mese2: "",
    meseRifTabella1: "GENNAIO",
    meseRifTabella2: "GENNAIO",
    f1Mese1: "",
    f2Mese1: "",
    f3Mese1: "",
    monoMese1: "",
    f1Mese2: "",
    f2Mese2: "",
    f3Mese2: "",
    monoMese2: "",
    dispacciamentoCapacityMarket: "",
    dedicataSpread: "",
    dedicataCapacityMarket: "",
    dedicataQuotaFissa: "",
    quotaConsumiRete: "",
    quotaFissaRete: "",
    quotaPotenzaRete: "",
    reattivaImmessa: "",
    reattivaPrelevata: "",
    confrontoFlag: "NO",
    confrontoValore: "",
    ricalcoloFlag: "NO",
    ricalcoloValore: "",
    bonusFlag: "NO",
    bonusValore: "",
    acciseManualiFlag: "NO",
    acciseManualiValore: "",
    canoneRaiGiaPagato: "0",
  });
  useEffect(() => {
    const validMonthOptions = [...punPsvRows]
      .filter((row) => {
        if (
          row.mese === "FISSO DOMESTICO" ||
          row.mese === "FISSO BUSINESS"
        ) {
          return false;
        }
  
        return (
          Number(row.mono || 0) !== 0 ||
          Number(row.f1 || 0) !== 0 ||
          Number(row.f2 || 0) !== 0 ||
          Number(row.f3 || 0) !== 0 ||
          Number(row.psv || 0) !== 0
        );
      })
      .sort((a, b) => {
        const mesi = [
          "GENNAIO",
          "FEBBRAIO",
          "MARZO",
          "APRILE",
          "MAGGIO",
          "GIUGNO",
          "LUGLIO",
          "AGOSTO",
          "SETTEMBRE",
          "OTTOBRE",
          "NOVEMBRE",
          "DICEMBRE",
        ];
  
        const score = (label: string) => {
          const parts = String(label).trim().split(" ");
          const mese = parts[0]?.toUpperCase() || "";
          const anno = parseInt(parts[1] || "0", 10);
          const meseIndex = mesi.indexOf(mese);
          return anno * 100 + meseIndex;
        };
  
        return score(b.mese) - score(a.mese);
      });
  
    if (validMonthOptions.length > 0 && !s.mese1) {
      setS((prev) => ({
        ...prev,
        mese1: validMonthOptions[0].mese,
      }));
    }
  }, [punPsvRows, s.mese1]);
  
  
  const mesiOrdinati = [...punPsvRows]
  .filter((m) => {
    if (m.mese === "FISSO DOMESTICO" || m.mese === "FISSO BUSINESS") return true;
    return (
      n(m.mono) !== 0 ||
      n(m.f1) !== 0 ||
      n(m.f2) !== 0 ||
      n(m.f3) !== 0
    );
  })
  .sort((a, b) => {
    if (a.mese === "FISSO DOMESTICO") return -1;
    if (b.mese === "FISSO DOMESTICO") return 1;
    if (a.mese === "FISSO BUSINESS") return -1;
    if (b.mese === "FISSO BUSINESS") return 1;

    const getAnno = (m: string) => Number(m.split(" ")[1] || 0);

    const getMeseNumero = (m: string) => {
      const mesi = [
        "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
        "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
      ];
      return mesi.findIndex(x => m.startsWith(x));
    };

    const annoA = getAnno(a.mese);
    const annoB = getAnno(b.mese);

    if (annoA !== annoB) return annoB - annoA;

    return getMeseNumero(b.mese) - getMeseNumero(a.mese);
  });

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [openSections, setOpenSections] = useState({
    dati: true,
    mesi: true,
    rete: !window.innerWidth || window.innerWidth >= 768,
    anteprima: true,
  });

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile) {
        setOpenSections({
          dati: true,
          mesi: true,
          rete: true,
          anteprima: true,
        });
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSection = (key: "dati" | "mesi" | "rete" | "anteprima") => {
    if (!isMobile) return;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sectionCard = (
    key: "dati" | "mesi" | "rete" | "anteprima",
    title: string,
    children: React.ReactNode
  ) => (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: isMobile ? 14 : 16,
      }}
    >
      <button
        type="button"
        onClick={() => toggleSection(key)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: !isMobile || openSections[key] ? 12 : 0,
          cursor: isMobile ? "pointer" : "default",
        }}
      >
        <h3 style={{ margin: 0, fontSize: isMobile ? 18 : 20 }}>{title}</h3>
        {isMobile && (
          <span style={{ fontSize: 18, color: "#475569", fontWeight: 700 }}>
            {openSections[key] ? "−" : "+"}
          </span>
        )}
      </button>

      {(!isMobile || openSections[key]) && children}
    </div>
  );

  const r = useMemo(
    () => calcEnergia(s, punPsvRows, energyOffers, dispCpRows),
    [s, punPsvRows, energyOffers, dispCpRows]
  );

  useEffect(() => {
    if (!s.dispacciamentoCapacityMarket || s.dispacciamentoCapacityMarket === "0") {
      setS((prev) => ({
        ...prev,
        dispacciamentoCapacityMarket: String(r.dispCpBase),
      }));
    }
  }, [r.dispCpBase]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: string) =>
    setS((prev) => {
      const newState = { ...prev, [k]: v };

      if (k === "tipo") {
        if (["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(v)) {
          newState.iva = "10";
        } else if (
          ["BTA1", "BTA2", "BTA3", "BTA4", "BTA5", "BTA6", "MTA1", "MTA2", "MTA3"].includes(v)
        ) {
          newState.iva = "22";
        }
      }

      return newState;
    });

  const consumoAnnuoEnergia =
    r.consumiTot *
    (s.fatturazione === "MENSILE" || s.fatturazione === "MULTI POD MENSILE" ? 12 : 6);
    const getPunByMonth = (mese: string, anno: number) => {
      const key = `${mese} ${anno}`;
      const row = punPsvRows.find((r) => r.mese === key);
      return row?.pun || 0;
    };
  const prezzoMedioEnergiaScheda =
    r.consumiTot > 0
      ? `${((r.H22 + r.H25 + r.H24) / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh`
      : "-";

  const boxStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#f8fafc",
    minWidth: isMobile ? 0 : 170,
    textAlign: "right",
  };

  const printEnergyPdf = () => {
    const periodo = [s.mese1, s.mese2].filter(Boolean).join(" / ") || "-";
    const orange = "#f97316";
    const green = "#16a34a";

    const quotaConsumiTot = r.H22 + r.H25 + r.H24;
    const quotaFissaPotenzaTot = r.H28 + r.H29 + r.H30;

    const quantitaConsumi = `${r.consumiTot.toLocaleString("it-IT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} kWh`;

    const mesiTxt = `${energyMonths(s.fatturazione)} Mesi`;
    const quantitaPotenza = `${s.numeroPod || "1"} POD`;

    const prezzoMedioVendita =
      r.consumiTot > 0 ? `${(r.H22 / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh` : "-";
    const prezzoMedioRete =
      r.consumiTot > 0 ? `${(r.H25 / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh` : "-";
    const prezzoMedioTotale =
      r.consumiTot > 0 ? `${(quotaConsumiTot / r.consumiTot).toFixed(6).replace(".", ",")} €/kWh` : "-";

    const altrePartiteRows = [
      r.H38 !== 0 ? `<tr><td>Ricalcoli/Sconti</td><td style="text-align:right">${money(r.H38)}</td></tr>` : "",
      r.H39 !== 0 ? `<tr><td>Bonus sociale</td><td style="text-align:right">- ${money(r.H39)}</td></tr>` : "",
      r.H40 !== 0 ? `<tr><td>Canone RAI</td><td style="text-align:right">${money(r.H40)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const altrePartiteTot = [r.H38, -r.H39, r.H40].reduce((a, b) => a + b, 0);

    const acciseIvaRows = [
      r.H35 !== 0 ? `<tr><td>Accise</td><td style="text-align:right">${money(r.H35)}</td></tr>` : "",
      r.H36 !== 0 ? `<tr><td>IVA</td><td style="text-align:right">${money(r.H36)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const acciseIvaTot = [r.H35, r.H36].reduce((a, b) => a + b, 0);

    const html = `
      <div class="page">
        <div class="topbar topbar-energy">
          <div>
            <div class="title">Preventivo Fornitura Energia</div>
          </div>
        </div>

        <div class="box box-energy">
          <div class="section-title">Dati cliente</div>
          <div class="grid">
            <div><div class="label">Cliente</div><div class="value">${s.nome || "-"}</div></div>
            <div><div class="label">POD</div><div class="value">${s.pod || "-"}</div></div>
            <div><div class="label">Offerta</div><div class="value">${s.offerta || "-"}</div></div>
            <div><div class="label">Tipologia</div><div class="value">${energyPdfTipologia(s.tipo)}</div></div>
            <div><div class="label">Fatturazione</div><div class="value">${s.fatturazione || "-"}</div></div>
            <div><div class="label">Periodo</div><div class="value">${periodo}</div></div>
          </div>
        </div>

        <div class="box box-energy">
          <div class="section-title">
            <span>QUOTA CONSUMI</span>
            <span>${money(quotaConsumiTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>QUANTITÀ</th>
                <th>PREZZO MEDIO</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="strong-row">
                <td>Quota consumi</td>
                <td>${quantitaConsumi}</td>
                <td>${prezzoMedioTotale}</td>
                <td>${money(quotaConsumiTot)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per vendita energia elettrica</td>
                <td></td>
                <td>${prezzoMedioVendita}</td>
                <td>${money(r.H22)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td>${prezzoMedioRete}</td>
                <td>${money(r.H25)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui reattiva</td>
                <td></td>
                <td>-</td>
                <td>${money(r.H24)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="box box-energy">
          <div class="section-title">
            <span>QUOTA FISSA E QUOTA POTENZA</span>
            <span>${money(quotaFissaPotenzaTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>QUANTITÀ</th>
                <th>PREZZO MEDIO</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="strong-row">
                <td>Quota fissa</td>
                <td>${mesiTxt}</td>
                <td>-</td>
                <td>${money(r.H28 + r.H29)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per vendita energia elettrica</td>
                <td></td>
                <td></td>
                <td>${money(r.H28)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td></td>
                <td>${money(r.H29)}</td>
              </tr>
              <tr class="strong-row">
                <td>Quota potenza</td>
                <td>${quantitaPotenza}</td>
                <td>-</td>
                <td>${money(r.H30)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td></td>
                <td>${money(r.H30)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${
          altrePartiteRows
            ? `
        <div class="box box-energy">
          <div class="section-title">
            <span>ALTRE PARTITE</span>
            <span>${money(altrePartiteTot)}</span>
          </div>
          <div class="bar" style="background:${green}"></div>
          <table>
            <tbody>
              ${altrePartiteRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        ${
          acciseIvaTot !== 0
            ? `
        <div class="box box-energy">
          <div class="section-title">
            <span>ACCISE E IVA</span>
            <span>${money(acciseIvaTot)}</span>
          </div>
          <div class="bar" style="background:${orange}"></div>
          <table>
            <tbody>
              ${acciseIvaRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        <div class="total" style="background:${orange}">
          <span>TOTALE PREVENTIVO</span>
          <span>${money(r.H41)}</span>
        </div>

        ${
          isSi(s.confrontoFlag)
            ? `
        <div class="savings">
          <div class="savings-row">
            <span>Risparmio mensile</span>
            <strong>${money(r.risparmioFattura / energyMonths(s.fatturazione))}</strong>
          </div>
          <div class="savings-row">
            <span>Risparmio annuale</span>
            <strong>${money(r.risparmioAnnuo)}</strong>
          </div>
        </div>`
            : ""
        }
      </div>
    `;

    const cleanName = sanitizeFileName(s.nome || "Cliente");
printHtmlDocument("Preventivo Energia", html, `${cleanName} - Energia`);
};

return (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
      gap: 16,
      alignItems: "start",
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sectionCard(
        "dati",
        "Energia",
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {field("Nome", s.nome, (v) => set("nome", v))}
            {field("POD", s.pod, (v) => set("pod", v))}
            {field("IVA %", s.iva, (v) => set("iva", v), "number")}
            {field("Numero POD", s.numeroPod, (v) => set("numeroPod", v), "number")}
            {selectField("Fatturazione", s.fatturazione, (v) => set("fatturazione", v), energyBilling)}
            {selectField("Tipo", s.tipo, (v) => set("tipo", v), energyTypes)}
            {selectField("Offerta", s.offerta, (v) => set("offerta", v), energyOffers.map((x) => x.nome))}
            {field("Canone RAI già pagato", s.canoneRaiGiaPagato, (v) => set("canoneRaiGiaPagato", v), "number")}
          </div>

          {s.offerta === "DEDICATA" && (
            <>
              <div style={{ height: 12 }} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                {field("Spread", s.dedicataSpread, (v) => set("dedicataSpread", v), "number")}
                {field(
                  "Maggiorazione Capacity Market",
                  s.dedicataCapacityMarket,
                  (v) => set("dedicataCapacityMarket", v),
                  "number"
                )}
                {field("Quota Fissa", s.dedicataQuotaFissa, (v) => set("dedicataQuotaFissa", v), "number")}
              </div>
            </>
          )}
        </>
      )}

      {sectionCard(
        "mesi",
        "Mesi e consumi",
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto auto",
              alignItems: "stretch",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ minWidth: 0 }} />

            <div style={boxStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Prezzo medio</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{prezzoMedioEnergiaScheda}</div>
            </div>

            <div style={boxStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo annuo</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {r.consumiTot > 0
                  ? `${consumoAnnuoEnergia.toLocaleString("it-IT", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })} kWh`
                  : "-"}
              </div>
            </div>

            <div style={boxStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo totale fattura</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {r.consumiTot > 0
                  ? `${r.consumiTot.toLocaleString("it-IT", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })} kWh`
                  : "-"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 24,
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 12 }}>
                {selectField("Mese 1", s.mese1, (v) => set("mese1", v), [...mesiOrdinati.map((m) => m.mese)])}

                {field("F1 mese 1", s.f1Mese1, (v) => set("f1Mese1", v), "number")}
                {field("F2 mese 1", s.f2Mese1, (v) => set("f2Mese1", v), "number")}
                {field("F3 mese 1", s.f3Mese1, (v) => set("f3Mese1", v), "number")}
                {field("Mono mese 1", s.monoMese1, (v) => set("monoMese1", v), "number")}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {selectField("Mese 2", s.mese2, (v) => set("mese2", v), ["", ...mesiOrdinati.map((m) => m.mese)])}

                {field("F1 mese 2", s.f1Mese2, (v) => set("f1Mese2", v), "number")}
                {field("F2 mese 2", s.f2Mese2, (v) => set("f2Mese2", v), "number")}
                {field("F3 mese 2", s.f3Mese2, (v) => set("f3Mese2", v), "number")}
                {field("Mono mese 2", s.monoMese2, (v) => set("monoMese2", v), "number")}
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 12,
                alignItems: isMobile ? "stretch" : "center",
                flexWrap: "wrap",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <div style={{ minWidth: isMobile ? 0 : 220, width: isMobile ? "100%" : undefined }}>
                {field(
                  "DISP+CP.Mrk",
                  s.dispacciamentoCapacityMarket,
                  (v) => set("dispacciamentoCapacityMarket", v),
                  "number"
                )}
              </div>

              <div style={{ minWidth: isMobile ? 0 : 220, width: isMobile ? "100%" : undefined }}>
                {readonlyField("DISP+CP.Mrk Base", numFormat(r.dispCpBase, 6))}
              </div>

              <button
                type="button"
                onClick={() => set("dispacciamentoCapacityMarket", String(r.dispCpBase))}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 700,
                  width: isMobile ? "100%" : "auto",
                }}
              >
                Usa valore base
              </button>
            </div>
          </div>
        </>
      )}

      {sectionCard(
        "rete",
        "Rete, oneri, rettifiche",
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {field("Quota consumi rete", s.quotaConsumiRete, (v) => set("quotaConsumiRete", v), "number")}
            {field("Quota fissa rete", s.quotaFissaRete, (v) => set("quotaFissaRete", v), "number")}
            {field("Quota potenza rete", s.quotaPotenzaRete, (v) => set("quotaPotenzaRete", v), "number")}
          </div>

          <div style={{ height: 12 }} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {field("Reattiva immessa", s.reattivaImmessa, (v) => set("reattivaImmessa", v), "number")}
            {field("Reattiva prelevata", s.reattivaPrelevata, (v) => set("reattivaPrelevata", v), "number")}
          </div>

          <div style={{ height: 12 }} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(4,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {toggleAmount(
              "Confronto Fornitore Precedente",
              s.confrontoFlag,
              (v) => set("confrontoFlag", v),
              s.confrontoValore,
              (v) => set("confrontoValore", v)
            )}
            {toggleAmount(
              "Ricalcoli/Sconti",
              s.ricalcoloFlag,
              (v) => set("ricalcoloFlag", v),
              s.ricalcoloValore,
              (v) => set("ricalcoloValore", v)
            )}
            {toggleAmount(
              "Bonus sociale",
              s.bonusFlag,
              (v) => set("bonusFlag", v),
              s.bonusValore,
              (v) => set("bonusValore", v)
            )}
            {toggleAmount(
              "Accise manuali",
              s.acciseManualiFlag,
              (v) => set("acciseManualiFlag", v),
              s.acciseManualiValore,
              (v) => set("acciseManualiValore", v)
            )}
          </div>
        </>
      )}
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sectionCard(
        "anteprima",
        "Anteprima Energia",
        <>
          {previewBox(
            <>
              {row("Spread usato", numFormat(r.spreadEff, 3))}
              {row("Maggiorazione CP.Mrk", numFormat(r.cmEff, 3))}
              {row("Quota fissa usata", money(r.quotaFissaEff))}
            </>
          )}

          {previewBox(
            <>
              {row("Pun+Spread", money(r.H22_base))}
              {row("Perdite di rete", money(r.perditeEnergia))}
              {row("DISP+CP.Mrk totale", money(r.dispCpTotale))}
              {row("Reattiva", money(r.H24))}
            </>
          )}

          {previewBox(
            <>
              {row("Vendita energia", money(r.H22), true, 16)}
              {row("Quota consumi rete", money(r.H25))}
              {row("Reattiva", money(r.H24))}
              {row("Quota consumi totale", money(r.H22 + r.H25 + r.H24))}
            </>,
            "#fed7aa"
          )}

          {previewBox(
            <>
              {row("Quota fissa offerta/dedicata", money(r.H28))}
              {row("Quota fissa rete", money(r.H29))}
            </>
          )}

          {previewBox(<>{row("Quota potenza rete", money(r.H30))}</>)}

          {previewBox(
            <>
              {row("Accise", money(r.H35))}
              {row("IVA", money(r.H36))}
              {row("Totale Imposte", money(r.H37))}
            </>
          )}

          {(r.H39 !== 0 || r.H38 !== 0 || r.H40 !== 0) &&
            previewBox(
              <>
                {r.H39 !== 0 && row("Bonus sociale", `- ${money(r.H39)}`)}
                {r.H38 !== 0 && row("Ricalcoli/Sconti", money(r.H38))}
                {r.H40 !== 0 && row("Canone RAI", money(r.H40))}
              </>
            )}

          {previewBox(<>{row("Totale preventivo", money(r.H41), true, 16)}</>, "#fdba74")}

          {isSi(s.confrontoFlag) &&
            previewBox(
              <>
                {row("Risparmio in fattura", money(r.risparmioFattura))}
                {row("Risparmio annuo", money(r.risparmioAnnuo))}
              </>
            )}

          <button
            onClick={printEnergyPdf}
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 8,
              background: "#0f172a",
              color: "white",
              border: "none",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Crea PDF Energia
          </button>
        </>
      )}
    </div>
  </div>
);
}

function Gas({
  punPsvRows,
  gasOffers,
  gasAcciseSettings,
}: {
  punPsvRows: PunPsvRow[];
  gasOffers: GasOffer[];
  gasAcciseSettings: GasAcciseSettings;
}) {
  const [s, setS] = useState({
    iva: "10",
    nome: "",
    pdr: "",
    uso: "DOMESTICO",
    fatturazione: "MENSILE",
    offerta: gasOffers[0]?.nome || "",
    periodo1: "",
    periodo2: "",
    periodo3: "",
    periodo4: "",
    consumo1: "",
    consumo2: "",
    consumo3: "",
    consumo4: "",
    adeguamentoParametro: "",
    dedicataSpread: "",
    dedicataQuotaVariabile: "",
    dedicataQuotaFissa: "",
    quotaVariabileAggiuntiva: "",
    quotaFissaAggiuntiva: "",
    accisaAgevolata: "NO",
    accisaValore: String(gasAcciseSettings.nonAgevolata),
    overrideAcciseFlag: "NO",
    overrideAcciseValore: "",
    confrontoFlag: "NO",
    confrontoValore: "",
    bonusFlag: "NO",
    bonusValore: "",
    ricalcoloFlag: "NO",
    ricalcoloValore: "",
  });
  useEffect(() => {
    const validMonthOptions = [...punPsvRows]
      .filter((row) => {
        if (
          row.mese === "FISSO DOMESTICO" ||
          row.mese === "FISSO BUSINESS"
        ) {
          return false;
        }
  
        return (
          Number(row.mono || 0) !== 0 ||
          Number(row.f1 || 0) !== 0 ||
          Number(row.f2 || 0) !== 0 ||
          Number(row.f3 || 0) !== 0 ||
          Number(row.psv || 0) !== 0
        );
      })
      .sort((a, b) => {
        const mesi = [
          "GENNAIO",
          "FEBBRAIO",
          "MARZO",
          "APRILE",
          "MAGGIO",
          "GIUGNO",
          "LUGLIO",
          "AGOSTO",
          "SETTEMBRE",
          "OTTOBRE",
          "NOVEMBRE",
          "DICEMBRE",
        ];
  
        const score = (label: string) => {
          const parts = String(label).trim().split(" ");
          const mese = parts[0]?.toUpperCase() || "";
          const anno = parseInt(parts[1] || "0", 10);
          const meseIndex = mesi.indexOf(mese);
          return anno * 100 + meseIndex;
        };
  
        return score(b.mese) - score(a.mese);
      });
  
    if (validMonthOptions.length > 0 && !s.periodo1) {
      setS((prev) => ({
        ...prev,
        periodo1: validMonthOptions[0].mese,
      }));
    }
  }, [punPsvRows, s.periodo1]);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [openSections, setOpenSections] = useState({
    dati: true,
    mesi: true,
    rete: !window.innerWidth || window.innerWidth >= 768,
    anteprima: true,
  });

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (!mobile) {
        setOpenSections({
          dati: true,
          mesi: true,
          rete: true,
          anteprima: true,
        });
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSection = (key: "dati" | "mesi" | "rete" | "anteprima") => {
    if (!isMobile) return;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const mesiOrdinati = [...punPsvRows]
  .filter((m) => {
    if (m.mese === "FISSO DOMESTICO" || m.mese === "FISSO BUSINESS") return true;
    return n(m.psv) !== 0;
  })
  .sort((a, b) => {
    if (a.mese === "FISSO DOMESTICO") return -1;
    if (b.mese === "FISSO DOMESTICO") return 1;
    if (a.mese === "FISSO BUSINESS") return -1;
    if (b.mese === "FISSO BUSINESS") return 1;

    const getAnno = (m: string) => Number(m.split(" ")[1] || 0);

    const getMeseNumero = (m: string) => {
      const mesi = [
        "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
        "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
      ];
      return mesi.findIndex(x => m.startsWith(x));
    };

    const annoA = getAnno(a.mese);
    const annoB = getAnno(b.mese);

    if (annoA !== annoB) return annoB - annoA;

    return getMeseNumero(b.mese) - getMeseNumero(a.mese);
  });

  const sectionCard = (
    key: "dati" | "mesi" | "rete" | "anteprima",
    title: string,
    children: React.ReactNode
  ) => (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: isMobile ? 14 : 16,
      }}
    >
      <button
        type="button"
        onClick={() => toggleSection(key)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: !isMobile || openSections[key] ? 12 : 0,
          cursor: isMobile ? "pointer" : "default",
        }}
      >
        <h3 style={{ margin: 0, fontSize: isMobile ? 18 : 20 }}>{title}</h3>
        {isMobile && (
          <span style={{ fontSize: 18, color: "#475569", fontWeight: 700 }}>
            {openSections[key] ? "−" : "+"}
          </span>
        )}
      </button>

      {(!isMobile || openSections[key]) && children}
    </div>
  );

  const r = useMemo(() => calcGas(s, punPsvRows, gasOffers), [s, punPsvRows, gasOffers]);

  const gasMonthOptions = mesiOrdinati
  .filter((m) => {
    if (m.mese === "FISSO DOMESTICO" || m.mese === "FISSO BUSINESS") return true;
    return m.psv && m.psv !== 0;
  })
  .map((m) => m.mese);

  const set = (k: string, v: string) =>
    setS((prev) => {
      const newState = { ...prev, [k]: v };

      if (k === "uso") {
        newState.iva = v === "DOMESTICO" ? "10" : "22";
      }

      if (k === "accisaAgevolata") {
        newState.accisaValore =
          v === "SI"
            ? String(gasAcciseSettings.agevolata)
            : String(gasAcciseSettings.nonAgevolata);
      }

      return newState;
    });

  const consumoAnnuoGas =
    r.consumoTotale *
    (s.fatturazione === "MENSILE"
      ? 12
      : s.fatturazione === "BIMESTRALE"
      ? 6
      : s.fatturazione === "TRIMESTRALE"
      ? 4
      : 3);

  const prezzoMedioGasScheda =
    r.consumoTotale > 0
      ? `${(r.H24 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc`
      : "-";

  const boxStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#f8fafc",
    minWidth: isMobile ? 0 : 170,
    textAlign: "right",
  };

  const printGasPdf = () => {
    const periodo = [s.periodo1, s.periodo2, s.periodo3, s.periodo4].filter(Boolean).join(" / ") || "-";
    const blue = "#2563eb";
    const green = "#16a34a";

    const prezzoMedioVenditaGasNaturale =
      r.consumoTotale > 0 ? `${(r.H22 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc` : "-";
    const prezzoMedioRete =
      r.consumoTotale > 0 ? `${(r.H23 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc` : "-";
    const prezzoMedioTotale =
      r.consumoTotale > 0 ? `${(r.H24 / r.consumoTotale).toFixed(6).replace(".", ",")} €/Smc` : "-";

    const altrePartiteRows = [
      r.H35 !== 0 ? `<tr><td>Ricalcoli/Sconti</td><td style="text-align:right">${money(r.H35)}</td></tr>` : "",
      r.H36 !== 0 ? `<tr><td>Bonus sociale</td><td style="text-align:right">- ${money(r.H36)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const altrePartiteTot = [r.H35, -r.H36].reduce((a, b) => a + b, 0);

    const acciseIvaRows = [
      r.H32 !== 0 ? `<tr><td>Accise</td><td style="text-align:right">${money(r.H32)}</td></tr>` : "",
      r.H33 !== 0 ? `<tr><td>IVA</td><td style="text-align:right">${money(r.H33)}</td></tr>` : "",
    ]
      .filter(Boolean)
      .join("");

    const acciseIvaTot = [r.H32, r.H33].reduce((a, b) => a + b, 0);

    const html = `
      <div class="page">
        <div class="topbar topbar-gas">
          <div>
            <div class="title">Preventivo Fornitura Gas</div>
          </div>
        </div>

        <div class="box box-gas">
          <div class="section-title">Dati cliente</div>
          <div class="grid">
            <div><div class="label">Cliente</div><div class="value">${s.nome || "-"}</div></div>
            <div><div class="label">PDR</div><div class="value">${s.pdr || "-"}</div></div>
            <div><div class="label">Offerta</div><div class="value">${s.offerta || "-"}</div></div>
            <div><div class="label">Uso</div><div class="value">${s.uso || "-"}</div></div>
            <div><div class="label">Fatturazione</div><div class="value">${s.fatturazione || "-"}</div></div>
            <div><div class="label">Periodo</div><div class="value">${periodo}</div></div>
          </div>
        </div>

        <div class="box box-gas">
          <div class="section-title">
            <span>QUOTA CONSUMI</span>
            <span>${money(r.H24)}</span>
          </div>
          <div class="bar" style="background:${blue}"></div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>QUANTITÀ</th>
                <th>PREZZO MEDIO</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="strong-row">
                <td>Quota consumi</td>
                <td>${r.consumoTotale.toLocaleString("it-IT", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })} Smc</td>
                <td>${prezzoMedioTotale}</td>
                <td>${money(r.H24)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per vendita gas naturale</td>
                <td></td>
                <td>${prezzoMedioVenditaGasNaturale}</td>
                <td>${money(r.H22)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td></td>
                <td>${prezzoMedioRete}</td>
                <td>${money(r.H23)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="box box-gas">
          <div class="section-title">
            <span>QUOTA FISSA</span>
            <span>${money(r.H29)}</span>
          </div>
          <div class="bar" style="background:${blue}"></div>
          <table>
            <tbody>
              <tr class="sub-row">
                <td>di cui spesa per vendita gas naturale</td>
                <td style="text-align:right">${money(r.H27)}</td>
              </tr>
              <tr class="sub-row">
                <td>di cui spesa per la rete e gli oneri generali di sistema</td>
                <td style="text-align:right">${money(r.H28)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${
          altrePartiteRows
            ? `
        <div class="box box-gas">
          <div class="section-title">
            <span>ALTRE PARTITE</span>
            <span>${money(altrePartiteTot)}</span>
          </div>
          <div class="bar" style="background:${green}"></div>
          <table>
            <tbody>
              ${altrePartiteRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        ${
          acciseIvaTot !== 0
            ? `
        <div class="box box-gas">
          <div class="section-title">
            <span>ACCISE E IVA</span>
            <span>${money(acciseIvaTot)}</span>
          </div>
          <div class="bar" style="background:${blue}"></div>
          <table>
            <tbody>
              ${acciseIvaRows}
            </tbody>
          </table>
        </div>`
            : ""
        }

        <div class="total" style="background:${blue}">
          <span>TOTALE PREVENTIVO</span>
          <span>${money(r.H37)}</span>
        </div>

        ${
          isSi(s.confrontoFlag)
            ? `
        <div class="savings">
          <div class="savings-row">
            <span>Risparmio fattura</span>
            <strong>${money(r.risparmioFattura)}</strong>
          </div>
          <div class="savings-row">
            <span>Risparmio annuale</span>
            <strong>${money(r.risparmioAnnuo)}</strong>
          </div>
        </div>`
            : ""
        }
      </div>
    `;

    const cleanName = sanitizeFileName(s.nome || "Cliente");
    printHtmlDocument("Preventivo Gas", html, `${cleanName} - Gas`);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sectionCard(
          "dati",
          "Gas",
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {field("Nome", s.nome, (v) => set("nome", v))}
              {field("PDR", s.pdr, (v) => set("pdr", v))}
              {selectField("Uso", s.uso, (v) => set("uso", v), ["DOMESTICO", "BUSINESS"])}
              {field("IVA %", s.iva, (v) => set("iva", v), "number")}
              {selectField("Fatturazione", s.fatturazione, (v) => set("fatturazione", v), gasBilling)}
              {selectField("Offerta", s.offerta, (v) => set("offerta", v), gasOffers.map((x) => x.nome))}
              {selectField("Accisa agevolata", s.accisaAgevolata, (v) => set("accisaAgevolata", v), ["NO", "SI"])}
              {field("Valore accisa", s.accisaValore, (v) => set("accisaValore", v), "number")}
              {field("Adeguamento parametro", s.adeguamentoParametro, (v) => set("adeguamentoParametro", v), "number")}
            </div>

            {s.offerta === "DEDICATA" && (
              <>
                <div style={{ height: 12 }} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
                    gap: 12,
                  }}
                >
                  {field("Spread", s.dedicataSpread, (v) => set("dedicataSpread", v), "number")}
                  {field("Quota variabile", s.dedicataQuotaVariabile, (v) => set("dedicataQuotaVariabile", v), "number")}
                  {field("Quota fissa", s.dedicataQuotaFissa, (v) => set("dedicataQuotaFissa", v), "number")}
                </div>
              </>
            )}
          </>
        )}

        {sectionCard(
          "mesi",
          "Mesi e consumi",
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto auto",
                alignItems: "stretch",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ minWidth: 0 }} />

              <div style={boxStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Prezzo medio</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{prezzoMedioGasScheda}</div>
              </div>

              <div style={boxStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo annuo</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {r.consumoTotale > 0
                    ? `${consumoAnnuoGas.toLocaleString("it-IT", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })} Smc`
                    : "-"}
                </div>
              </div>

              <div style={boxStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Consumo totale fattura</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {r.consumoTotale > 0
                    ? `${r.consumoTotale.toLocaleString("it-IT", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })} Smc`
                    : "-"}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {selectField("Mese 1", s.periodo1, (v) => set("periodo1", v), gasMonthOptions)}
              {selectField("Mese 2", s.periodo2, (v) => set("periodo2", v), ["", ...gasMonthOptions])}
              {selectField("Mese 3", s.periodo3, (v) => set("periodo3", v), ["", ...gasMonthOptions])}
              {selectField("Mese 4", s.periodo4, (v) => set("periodo4", v), ["", ...gasMonthOptions])}
              {field("Consumo 1", s.consumo1, (v) => set("consumo1", v), "number")}
              {field("Consumo 2", s.consumo2, (v) => set("consumo2", v), "number")}
              {field("Consumo 3", s.consumo3, (v) => set("consumo3", v), "number")}
              {field("Consumo 4", s.consumo4, (v) => set("consumo4", v), "number")}
            </div>
          </>
        )}

        {sectionCard(
          "rete",
          "Rete e corrispettivi",
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {field("Quota consumi rete", s.quotaVariabileAggiuntiva, (v) => set("quotaVariabileAggiuntiva", v), "number")}
              {field("Quota fissa rete", s.quotaFissaAggiuntiva, (v) => set("quotaFissaAggiuntiva", v), "number")}
            </div>

            <div style={{ height: 12 }} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {toggleAmount(
                "Accise manuali",
                s.overrideAcciseFlag,
                (v) => set("overrideAcciseFlag", v),
                s.overrideAcciseValore,
                (v) => set("overrideAcciseValore", v)
              )}
              {toggleAmount(
                "Confronto fornitore precedente",
                s.confrontoFlag,
                (v) => set("confrontoFlag", v),
                s.confrontoValore,
                (v) => set("confrontoValore", v)
              )}
              {toggleAmount(
                "Bonus sociale",
                s.bonusFlag,
                (v) => set("bonusFlag", v),
                s.bonusValore,
                (v) => set("bonusValore", v)
              )}
              {toggleAmount(
                "Ricalcoli/Sconti",
                s.ricalcoloFlag,
                (v) => set("ricalcoloFlag", v),
                s.ricalcoloValore,
                (v) => set("ricalcoloValore", v)
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sectionCard(
          "anteprima",
          "Anteprima Gas",
          <>
            {previewBox(
              <>
                {row("Spread usato", numFormat(r.spreadEff, 2))}
                {row("Quota variabile usata", numFormat(r.quotaVarEff, 2))}
                {row("Quota fissa usata", money(r.quotaFissaEff))}
              </>
            )}

            {previewBox(
              <>
                {row("PSV+Spread", money(r.X55))}
                {row("Quota variabile offerta", money(r.X56))}
              </>
            )}

            {previewBox(
              <>
                {row("Vendita materia + Adeguamento Parametro", money(r.H22), true, 16)}
                {row("Quota consumi rete", money(r.H23))}
                {row("Quota consumi totale", money(r.H24))}
              </>,
              "#bfdbfe"
            )}

            {previewBox(
              <>
                {row("Quota fissa vendita", money(r.H27))}
                {row("Quota fissa rete", money(r.H28))}
                {row("Quota fissa totale", money(r.H29))}
              </>
            )}

            {previewBox(
              <>
                {row("Accise", money(r.H32))}
                {row("IVA", money(r.H33))}
                {row("Totale Imposte", money(r.H34))}
              </>
            )}

            {(r.H35 !== 0 || r.H36 !== 0) &&
              previewBox(
                <>
                  {r.H35 !== 0 && row("Ricalcoli/Sconti", money(r.H35))}
                  {r.H36 !== 0 && row("Bonus sociale", `- ${money(r.H36)}`)}
                </>
              )}

            {previewBox(<>{row("Totale preventivo", money(r.H37), true, 16)}</>, "#93c5fd")}

            {isSi(s.confrontoFlag) &&
              previewBox(
                <>
                  {row("Risparmio fattura", money(r.risparmioFattura))}
                  {row("Risparmio annuo", money(r.risparmioAnnuo))}
                </>
              )}

            <button
              onClick={printGasPdf}
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 8,
                background: "#0f172a",
                color: "white",
                border: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Crea PDF Gas
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Listini({
  dispCpRows,
  setDispCpRows,
  energyOffers,
  setEnergyOffers,
  gasOffers,
  setGasOffers,
  gasAcciseSettings,
  setGasAcciseSettings,
}: {
  dispCpRows: DispCpRow[];
  setDispCpRows: React.Dispatch<React.SetStateAction<DispCpRow[]>>;
  energyOffers: EnergyOffer[];
  setEnergyOffers: React.Dispatch<React.SetStateAction<EnergyOffer[]>>;
  gasOffers: GasOffer[];
  setGasOffers: React.Dispatch<React.SetStateAction<GasOffer[]>>;
  gasAcciseSettings: GasAcciseSettings;
  setGasAcciseSettings: React.Dispatch<React.SetStateAction<GasAcciseSettings>>;
}) {
  const updateDispCp = (index: number, key: keyof DispCpRow, value: string) => {
    setDispCpRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "mese" ? value : n(value) } : row
      )
    );
  };

  const updateEnergyOffer = (index: number, key: keyof EnergyOffer, value: string) => {
    setEnergyOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
  };

  const updateGasOffer = (index: number, key: keyof GasOffer, value: string) => {
    setGasOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #e2e8f0",
  };

  const tdStyle: React.CSSProperties = {
    padding: 10,
    borderBottom: "1px solid #f1f5f9",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 6,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Dispacciamento + CP Market Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Mese", "Dispacciam", "CP Market", "Tot"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dispCpRows.map((row, i) => {
                const tot = n(row.dispacciamento) + n(row.cpMarket);
                return (
                  <tr key={row.mese}>
                    <td style={tdStyle}>{row.mese}</td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={inputStyle}
                        value={row.dispacciamento}
                        onChange={(e) => updateDispCp(i, "dispacciamento", e.target.value)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={inputStyle}
                        value={row.cpMarket}
                        onChange={(e) => updateDispCp(i, "cpMarket", e.target.value)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={{ ...inputStyle, background: "#f8fafc" }}
                        value={tot}
                        readOnly
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ marginTop: 0 }}>Accise gas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Accisa agevolata</div>
              <input
                type="number"
                step="0.000001"
                style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
                value={gasAcciseSettings.agevolata}
                onChange={(e) =>
                  setGasAcciseSettings((prev) => ({ ...prev, agevolata: n(e.target.value) }))
                }
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Accisa non agevolata</div>
              <input
                type="number"
                step="0.000001"
                style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
                value={gasAcciseSettings.nonAgevolata}
                onChange={(e) =>
                  setGasAcciseSettings((prev) => ({ ...prev, nonAgevolata: n(e.target.value) }))
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Offerte Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nome offerta", "Spread", "Maggiorazione Capacity Market", "Quota fissa"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {energyOffers.map((row, i) => (
                <tr key={row.nome + i}>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: 180 }}
                      value={row.nome}
                      onChange={(e) => updateEnergyOffer(i, "nome", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.spread}
                      onChange={(e) => updateEnergyOffer(i, "spread", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 120 }}
                      value={row.maggiorazioneCapacityMarket}
                      onChange={(e) => updateEnergyOffer(i, "maggiorazioneCapacityMarket", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.canone}
                      onChange={(e) => updateEnergyOffer(i, "canone", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Offerte Gas</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nome offerta", "Spread", "Quota variabile", "Quota fissa"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gasOffers.map((row, i) => (
                <tr key={row.nome + i}>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: 180 }}
                      value={row.nome}
                      onChange={(e) => updateGasOffer(i, "nome", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.spread}
                      onChange={(e) => updateGasOffer(i, "spread", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 120 }}
                      value={row.quotaVariabile}
                      onChange={(e) => updateGasOffer(i, "quotaVariabile", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.canone}
                      onChange={(e) => updateGasOffer(i, "canone", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AgentsAdmin({
  adminProfile,
}: {
  adminProfile: AdminProfile | null;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");

  const loadAgents = async () => {
    setLoading(true);

    let query = supabase
      .from("agents")
      .select("*")
      .order("nome", { ascending: true });

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("LOAD AGENTS ERROR:", error);
      setAgents([]);
    } else {
      setAgents((data as Agent[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const saveAgent = async () => {
    if (!nome || !cognome) {
      alert("Inserisci nome e cognome");
      return;
    }

    if (!adminProfile?.id) {
      alert("Sessione admin non valida");
      return;
    }

    const username = nome.toLowerCase().trim();
    const password = cognome.toLowerCase().trim();

    setSaving(true);

    const { error } = await supabase.from("agents").insert([
      {
        nome,
        cognome,
        username,
        password,
        owner_admin_id: adminProfile.id,
      },
    ]);

    setSaving(false);

    if (error) {
      console.error("SAVE AGENT ERROR:", error);
      alert("Errore salvataggio agente: " + (error.message || JSON.stringify(error)));
      return;
    }

    alert("Agente salvato");
    setNome("");
    setCognome("");
    await loadAgents();
  };

  const deleteAgent = async (agentId?: number) => {
    if (!agentId) return;

    const ok = window.confirm("Vuoi eliminare questo agente?");
    if (!ok) return;

    let query = supabase.from("agents").delete().eq("id", agentId);

    if (adminProfile?.role !== "super_admin") {
      query = query.eq("owner_admin_id", adminProfile?.id);
    }

    const { error } = await query;

    if (error) {
      alert("Errore eliminazione agente: " + error.message);
      return;
    }

    await loadAgents();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Agent Admin</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2,minmax(0,1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Nome
            </div>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Cognome
            </div>
            <input
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <button
          type="button"
          onClick={saveAgent}
          disabled={saving}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#0f172a",
            color: "white",
            cursor: "pointer",
          }}
        >
          {saving ? "Salvataggio..." : "Salva agente"}
        </button>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Elenco agenti</h2>

        {loading ? (
          <div>Caricamento...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Nome", "Cognome", "Username", "Password", "Azioni"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((a, i) => (
                  <tr key={a.id || i}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.nome?.toUpperCase()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.cognome?.toUpperCase()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.username}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {a.password}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      <button
                        type="button"
                        onClick={() => deleteAgent(a.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #dc2626",
                          background: "white",
                          color: "#dc2626",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                        title="Elimina agente"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginView({
  setSession,
  setAdminProfile,
}: {
  setSession: React.Dispatch<React.SetStateAction<any>>;
  setAdminProfile: React.Dispatch<React.SetStateAction<AdminProfile | null>>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const user = username.trim().toLowerCase();
      const pass = password.trim();

      if (!user || !pass) {
        setErrorMsg("Inserisci username e password");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
  .from("admin_users")
  .select("id, nome, username, password, role")
  .ilike("username", user)
  .eq("password", pass)
  .maybeSingle();

if (error || !data) {
  setErrorMsg("Credenziali non valide");
  setLoading(false);
  return;
}

            localStorage.setItem("admin_session", JSON.stringify(data));

      setSession(data);
      setAdminProfile(data);
    } catch (err) {
      setErrorMsg("Errore durante il login");
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginTop: 40,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0 }}>Accesso Admin</h2>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
          }}
        />

        {errorMsg && (
          <div style={{ color: "red", fontSize: 13 }}>{errorMsg}</div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            marginTop: 6,
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: "#0f172a",
            color: "white",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {loading ? "Accesso..." : "Entra"}
        </button>
      </div>
    </div>
  );
}

function ReportAgent() {
  const [agentSession, setAgentSession] = useState<any>(null);
  const [agentUsername, setAgentUsername] = useState("");
  const [agentPassword, setAgentPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    report_date: "",
    agent_id: 0,
    contracts_energia: "",
    consumi_energia: "",
    contracts_gas: "",
    consumi_gas: "",
    notes: "",
  });

  const loadReportsByAgent = async (agentId: number) => {
    setLoading(true);
  
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("agent_id", agentId)
      .order("report_date", { ascending: false });
  
    if (error) {
      console.error("LOAD REPORTS BY AGENT ERROR:", error);
      setReports([]);
    } else {
      setReports(data || []);
    }
  
    setLoading(false);
  };
  
  const loginAgent = async () => {
    const username = agentUsername.trim().toLowerCase();
    const password = agentPassword.trim().toLowerCase();

    if (!username || !password) {
      setLoginError("Inserisci username e password");
      return;
    }

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .maybeSingle();

    if (error || !data) {
      setLoginError("Credenziali non valide");
      return;
    }

    if (data.username === "admin") {
      setLoginError("Usa Report Admin per questo accesso");
      return;
    }

    console.log("LOGIN AGENTE DATA:", data);
    setAgentSession({
      ...data,
      owner_admin_id: data.owner_admin_id,
    });
    setLoginError("");
    setForm((prev: any) => ({ ...prev, agent_id: data.id || 0 }));
    await loadReportsByAgent(data.id || 0);
    
  };

  const saveReport = async () => {
    if (!agentSession) {
      alert("Non autenticato");
      return;
    }
  
    if (!form.report_date) {
      alert("Seleziona la data report");
      return;
    }
  
    setSaving(true);
  
    const payload = {
      report_date: form.report_date,
      agent_id: agentSession.id,
      owner_admin_id: agentSession.owner_admin_id,
      contracts_energia: Number(form.contracts_energia || 0),
      consumi_energia: Number(form.consumi_energia || 0),
      contracts_gas: Number(form.contracts_gas || 0),
      consumi_gas: Number(form.consumi_gas || 0),
      notes: form.notes || "",
    };

    console.log("REPORT PAYLOAD:", payload);
  
    const { error } = await supabase
      .from("reports")
      .upsert(payload, { onConflict: "agent_id,report_date" });
  
    setSaving(false);
  
    if (error) {
      alert("Errore salvataggio report: " + error.message);
      return;
    }
  
    alert("Report salvato");
    await loadReportsByAgent(agentSession.id || 0);
  };
  
  const deleteReport = async (reportId: number) => {
    if (!agentSession) return;
  
    const ok = window.confirm("Vuoi davvero cancellare questo report?");
    if (!ok) return;
  
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", reportId)
      .eq("agent_id", agentSession.id);
  
    if (error) {
      alert("Errore cancellazione report: " + error.message);
      return;
    }
  
    alert("Report cancellato");
    await loadReportsByAgent(agentSession.id || 0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Report</h2>

        {!agentSession ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 12,
                maxWidth: 500,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Username
                </div>
                <input
                  value={agentUsername}
                  onChange={(e) => setAgentUsername(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Password
                </div>
                <input
                  type="password"
                  value={agentPassword}
                  onChange={(e) => setAgentPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ height: 12 }} />

            {loginError && (
              <div style={{ color: "#dc2626", marginBottom: 12 }}>
                {loginError}
              </div>
            )}

            <button
              type="button"
              onClick={loginAgent}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "#0f172a",
                color: "white",
                cursor: "pointer",
              }}
            >
              Entra
            </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <strong>Agente:</strong> {agentSession.nome} {agentSession.cognome}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Data report
                </div>
                <input
                  type="date"
                  value={form.report_date}
                  onChange={(e) =>
                    setForm((prev: any) => ({ ...prev, report_date: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Contratti energia
                </div>
                <input
                  type="number"
                  value={form.contracts_energia}
                  onChange={(e) =>
                    setForm((prev: any) => ({
                      ...prev,
                      contracts_energia: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Consumi energia
                </div>
                <input
                  type="number"
                  value={form.consumi_energia}
                  onChange={(e) =>
                    setForm((prev: any) => ({
                      ...prev,
                      consumi_energia: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Contratti gas
                </div>
                <input
                  type="number"
                  value={form.contracts_gas}
                  onChange={(e) =>
                    setForm((prev: any) => ({
                      ...prev,
                      contracts_gas: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Consumi gas
                </div>
                <input
                  type="number"
                  value={form.consumi_gas}
                  onChange={(e) =>
                    setForm((prev: any) => ({
                      ...prev,
                      consumi_gas: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Note
                </div>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev: any) => ({ ...prev, notes: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveReport}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0f172a",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                {saving ? "Salvataggio..." : "Salva report"}
              </button>

              <button
                onClick={() => {
                  setAgentSession(null);
                  setAgentUsername("");
                  setAgentPassword("");
                  setLoginError("");
                  setReports([]);
                  setForm({
                    report_date: "",
                    agent_id: 0,
                    contracts_energia: "",
                    consumi_energia: "",
                    contracts_gas: "",
                    consumi_gas: "",
                    notes: "",
                  });
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Esci
              </button>
            </div>
          </div>
        )}
      </div>

      {agentSession && (
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>I miei report</h2>

          {loading ? (
  <div>Caricamento...</div>
) : reports.length === 0 ? (
  <div>Nessun report</div>
) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                  {[
  "Data",
  "Contratti energia",
  "Consumi energia",
  "Contratti gas",
  "Consumi gas",
  "Note",
  "Azioni",
].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 8,
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
  {reports.map((r, i) => (
    <tr key={r.id || i}>
      <td style={{ padding: 8 }}>{r.report_date}</td>
      <td style={{ padding: 8 }}>{r.contracts_energia}</td>
      <td style={{ padding: 8 }}>{r.consumi_energia}</td>
      <td style={{ padding: 8 }}>{r.contracts_gas}</td>
      <td style={{ padding: 8 }}>{r.consumi_gas}</td>
      <td style={{ padding: 8 }}>{r.notes}</td>

{/* 👇 QUESTO È IL CESTINO */}
<td style={{ padding: 8 }}>
  <button
    onClick={() => deleteReport(r.id)}
    style={{
      padding: "6px 10px",
      borderRadius: 8,
      border: "1px solid #dc2626",
      background: "white",
      color: "#dc2626",
      cursor: "pointer",
      fontWeight: 700,
    }}
  >
    🗑
  </button>
</td>
    </tr>
  ))}
</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportAdmin({
  adminProfile,
}: {
  adminProfile: AdminProfile | null;
}) {
  const [agents, setAgents] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"ALL" | "PERIODO">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const loadAgents = async () => {
    let query = supabase
  .from("agents")
  .select("*")
  .neq("username", "admin")
  .order("nome", { ascending: true });

  if (adminProfile?.role !== "super_admin") {
    query = query.eq("owner_admin_id", adminProfile?.id);
  }

const { data } = await query;
setAgents(data || []);
  };

  const loadReports = async (agentId?: number | null) => {
    setLoading(true);
  
    let query = supabase
      .from("reports")
      .select("*")
      .order("report_date", { ascending: false });
  
      if (adminProfile?.role !== "super_admin") {
        query = query.eq("owner_admin_id", adminProfile?.id);
      }
  
    if (agentId) {
      query = query.eq("agent_id", agentId);
    }
  
    const { data, error } = await query;

if (error) {
  console.error("LOAD REPORTS ERROR:", error);
  setReports([]);
} else {
  setReports(data || []);
}

setLoading(false);
  };
  
    

  useEffect(() => {
    loadAgents();
    loadReports(null);
  }, []);
  const deleteReportAdmin = async (reportId: number) => {
    const ok = window.confirm("Vuoi davvero cancellare questo report?");
    if (!ok) return;
  
    let query = supabase.from("reports").delete().eq("id", reportId);

if (adminProfile?.role !== "super_admin") {
  query = query.eq("owner_admin_id", adminProfile?.id);
}
  
    const { error } = await query;
  
    if (error) {
      alert("Errore cancellazione report: " + error.message);
      return;
    }
  
    alert("Report cancellato");
    await loadReports(selectedAgentId);
  };
  const filteredReports =
  mode === "ALL"
    ? reports
    : reports.filter((r) => {
        if (!r.report_date) return false;

        const d = r.report_date;

        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;

        return true;
      });
      const totals = filteredReports.reduce(
    (acc, r) => {
      acc.contracts_energia += Number(r.contracts_energia || 0);
      acc.consumi_energia += Number(r.consumi_energia || 0);
      acc.contracts_gas += Number(r.contracts_gas || 0);
      acc.consumi_gas += Number(r.consumi_gas || 0);
      return acc;
    },
    {
      contracts_energia: 0,
      consumi_energia: 0,
      contracts_gas: 0,
      consumi_gas: 0,
    }
  );

  const getAgentName = (agentId: number) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent
      ? `${agent.nome} ${agent.cognome}`.toUpperCase()
      : `ID ${agentId}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Report Admin</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={async () => {
              setSelectedAgentId(null);
              await loadReports(null);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: selectedAgentId === null ? "#0f172a" : "white",
              color: selectedAgentId === null ? "white" : "#0f172a",
              cursor: "pointer",
            }}
          >
            Tutti
          </button>

          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={async () => {
                setSelectedAgentId(a.id);
                await loadReports(a.id);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: selectedAgentId === a.id ? "#0f172a" : "white",
                color: selectedAgentId === a.id ? "white" : "#0f172a",
                cursor: "pointer",
              }}
            >
              {(a.nome + " " + a.cognome).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 12,
  }}
>
  {/* SINISTRA */}
  <div>
    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
      Modalità
    </div>
    <select
      value={mode}
      onChange={(e) => setMode(e.target.value as any)}
      style={{
        padding: 8,
        borderRadius: 8,
        border: "1px solid #cbd5e1",
      }}
    >
      <option value="ALL">TOTALE</option>
      <option value="PERIODO">PERIODO SCELTO</option>
    </select>
  </div>

  {/* DESTRA */}
  {mode === "PERIODO" && (
    <div style={{ display: "flex", gap: 8 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          Da
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
          }}
        />
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          A
        </div>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
          }}
        />
      </div>
    </div>
  )}
</div>
        <h3 style={{ marginTop: 0 }}>Riepilogo totali</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
          {previewBox(<>{row("Contratti energia", String(totals.contracts_energia), true)}</>)}
          {previewBox(<>{row("Consumi energia", numFormat(totals.consumi_energia, 2), true)}</>)}
          {previewBox(<>{row("Contratti gas", String(totals.contracts_gas), true)}</>)}
          {previewBox(<>{row("Consumi gas", numFormat(totals.consumi_gas, 2), true)}</>)}
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Storico report</h3>

        {loading ? (
          <div>Caricamento...</div>
        ) : reports.length === 0 ? (
          <div>Nessun report</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Agente",
                    "Data",
                    "Contratti energia",
                    "Consumi energia",
                    "Contratti gas",
                    "Consumi gas",
                    "Note",
                    "Azioni",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
              {filteredReports.map((r, i) => (
                  <tr key={r.id || i}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                    {getAgentName(r.agent_id)?.toUpperCase()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {r.report_date}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {r.contracts_energia}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {numFormat(r.consumi_energia, 2)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {r.contracts_gas}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {numFormat(r.consumi_gas, 2)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                      {r.notes}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
  <button
    type="button"
    onClick={() => deleteReportAdmin(r.id)}
    style={{
      padding: "6px 10px",
      borderRadius: 8,
      border: "1px solid #dc2626",
      background: "white",
      color: "#dc2626",
      cursor: "pointer",
      fontWeight: 700,
    }}
    title="Cancella report"
  >
    🗑
  </button>
</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminUsersManager({
  adminProfile,
}: {
  adminProfile: any;
}) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [newNome, setNewNome] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const loadAdmins = async () => {
    if (adminProfile?.role !== "super_admin") return;

    const { data, error } = await supabase
      .from("admin_users")
      .select("id, nome, username, password, role")
      .order("username", { ascending: true });

    if (!error && data) {
      setAdmins(data);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const createAdmin = async () => {
    const nome = newNome.trim();
    const username = newUsername.trim().toLowerCase();
    const password = newPassword.trim();

    if (!nome || !username || !password) {
      alert("Compila tutti i campi");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("admin_users").insert([
      {
        nome,
        username,
        password,
        auth_id: crypto.randomUUID(),
        role: "admin",
      },
    ]);

    setLoading(false);

    if (error) {
      alert("Errore creazione admin: " + error.message);
      return;
    }

    setNewNome("");
    setNewUsername("");
    setNewPassword("");

    loadAdmins();
  };

  const deleteAdmin = async (id: number) => {
    if (!confirm("Eliminare admin?")) return;

    await supabase.from("admin_users").delete().eq("id", id);
    loadAdmins();
  };

  if (adminProfile?.role !== "super_admin") return null;

  return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h2 style={{ margin: 0 }}>Admin web app</h2>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Crea nuovi admin con accesso diretto via username e password
          </div>
        </div>
  
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 12,
          }}
        >
          <input
            placeholder="Nome"
            value={newNome}
            onChange={(e) => setNewNome(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              boxSizing: "border-box",
              fontSize: 14,
            }}
          />
          <input
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              boxSizing: "border-box",
              fontSize: 14,
            }}
          />
          <input
            placeholder="Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              boxSizing: "border-box",
              fontSize: 14,
            }}
          />
          <button
            onClick={createAdmin}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#0f172a",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {loading ? "Creazione..." : "Crea admin"}
          </button>
        </div>
      </div>
  
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h2 style={{ margin: 0 }}>Elenco admin</h2>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Gestione amministratori della web app
          </div>
        </div>
  
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nome", "Username", "Password", "Ruolo", "Azioni"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 8px",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: 13,
                      color: "#475569",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f5f9" }}>
                    {a.nome || "-"}
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f5f9" }}>
                    {a.username}
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f5f9" }}>
                    {a.password}
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f5f9" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: a.role === "super_admin" ? "#dbeafe" : "#f1f5f9",
                        color: a.role === "super_admin" ? "#1d4ed8" : "#334155",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {a.role}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid #f1f5f9" }}>
                    <button
                      onClick={() => deleteAdmin(a.id)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #dc2626",
                        background: "white",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


export default function App() {
  const baseBtn = {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.2s ease",
  };
  
  const activeBtn = {
    background: "#0f172a",
    color: "white",
    border: "1px solid #0f172a",
  };
  const [adminSession, setAdminSession] = useState<AdminProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);

  const [punPsvRows, setPunPsvRows] = useState<PunPsvRow[]>(INITIAL_PUN_PSV_ROWS);
  const [selectedPunPsvMonth, setSelectedPunPsvMonth] = useState<string>("DICEMBRE 2026");

  const updatePunPsvValue = (
    mese: string,
    field: "mono" | "f1" | "f2" | "f3" | "psv",
    value: string
  ) => {
    const parsed = Number(String(value).replace(",", "."));
  
    setPunPsvRows((prev) =>
      prev.map((row) =>
        row.mese === mese
          ? {
              ...row,
              [field]: Number.isFinite(parsed) ? parsed : 0,
            }
          : row
      )
    );
  };
  
  const [tab, setTab] = useState(() => {
    return localStorage.getItem("app_tab") || "energia";
  });
  
  const [selectedMonthPUN, setSelectedMonthPUN] =
useState("");
  const [punPsvView, setPunPsvView] = useState<"both" | "pun" | "psv">("both");
  
  function getLast12PunPsvRows(rows: any[], selectedMonth: string) {
    const index = rows.findIndex(r => r.mese === selectedMonth);
    if (index === -1) return [];
  
    return rows.slice(Math.max(0, index - 11), index + 1);
  }
  
  const visiblePunPsvRows = getLast12PunPsvRows(punPsvRows, selectedMonthPUN);
  const tablePunPsvRows = [...visiblePunPsvRows].sort(
    (a, b) => getMonthYearSortValue(b.mese) - getMonthYearSortValue(a.mese)
  );
  const validMonthOptions = [...punPsvRows]
  .filter((row) => {
    if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS") {
      return false;
    }

    return (
      Number(row.mono || 0) !== 0 ||
      Number(row.f1 || 0) !== 0 ||
      Number(row.f2 || 0) !== 0 ||
      Number(row.f3 || 0) !== 0 ||
      Number(row.psv || 0) !== 0
    );
  })
  .sort((a, b) => {
    const mesi = [
      "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
      "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
    ];

    const score = (label: string) => {
      const parts = String(label).trim().split(" ");
      const mese = parts[0]?.toUpperCase() || "";
      const anno = parseInt(parts[1] || "0", 10);
      const meseIndex = mesi.indexOf(mese);
      return anno * 100 + meseIndex;
    };

    return score(b.mese) - score(a.mese);
  });
  const punValues = visiblePunPsvRows.map(r => Number(r.mono || 0));
const psvValues = visiblePunPsvRows.map(r => r.psv);
const punPolyline = getSvgPoints(punValues, 760, 220);
const psvPolyline = getSvgPoints(psvValues, 760, 220);
const punCoords = getChartCoords(punValues, 760, 220);
const psvCoords = getChartCoords(psvValues, 760, 220);

const latestPun =
  visiblePunPsvRows.length > 0
    ? Number(
        visiblePunPsvRows[visiblePunPsvRows.length - 1].mono || 0
      ).toFixed(6)
    : "-";

const latestPsv =
  visiblePunPsvRows.length > 0
    ? Number(
        visiblePunPsvRows[visiblePunPsvRows.length - 1].psv || 0
      ).toFixed(6)
    : "-";
       
    function getRowMonthScore(row: any) {
      const mesi = [
        "GENNAIO",
        "FEBBRAIO",
        "MARZO",
        "APRILE",
        "MAGGIO",
        "GIUGNO",
        "LUGLIO",
        "AGOSTO",
        "SETTEMBRE",
        "OTTOBRE",
        "NOVEMBRE",
        "DICEMBRE",
      ];
    
      const anno = Number(row.anno || 0);
      const meseIndex = mesi.indexOf(String(row.mese).toUpperCase());
    
      if (!anno || meseIndex === -1) return -1;
    
      return anno * 100 + meseIndex;
    }
    
    const publicPunPsvOptions = [...punPsvRows]
  .filter((row) => {
    if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS") {
      return false;
    }

    return (
      Number(row.mono || 0) !== 0 ||
      Number(row.f1 || 0) !== 0 ||
      Number(row.f2 || 0) !== 0 ||
      Number(row.f3 || 0) !== 0 ||
      Number(row.psv || 0) !== 0
    );
  })
  .sort((a, b) => {
    const mesi = [
      "GENNAIO",
      "FEBBRAIO",
      "MARZO",
      "APRILE",
      "MAGGIO",
      "GIUGNO",
      "LUGLIO",
      "AGOSTO",
      "SETTEMBRE",
      "OTTOBRE",
      "NOVEMBRE",
      "DICEMBRE",
    ];

    const score = (label: string) => {
      const parts = String(label).trim().split(" ");
      const mese = parts[0]?.toUpperCase() || "";
      const anno = parseInt(parts[1] || "0", 10);
      const meseIndex = mesi.indexOf(mese);
      return anno * 100 + meseIndex;
    };

    return score(b.mese) - score(a.mese);
  });

useEffect(() => {
  if (tab === "punpsv" && publicPunPsvOptions.length > 0) {
    const ultimo = publicPunPsvOptions[0].mese;

    if (selectedMonthPUN !== ultimo) {
      setSelectedMonthPUN(ultimo);
    }
  }
}, [tab, publicPunPsvOptions[0]?.mese]);


useEffect(() => {
}, [tab, validMonthOptions[0]?.mese]);


useEffect(() => {
  const savedAdmin = localStorage.getItem("admin_session");

  if (savedAdmin) {
    try {
      const parsed = JSON.parse(savedAdmin) as AdminProfile;
      setAdminSession(parsed);
      setAdminProfile(parsed);
    } catch {
      localStorage.removeItem("admin_session");
    }
  }
}, []);

const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>(INITIAL_MONTHLY);
const [dispCpRows, setDispCpRows] = useState<DispCpRow[]>(INITIAL_DISP_CP_ROWS);
const [energyOffers, setEnergyOffers] = useState<EnergyOffer[]>(INITIAL_ENERGY_OFFERS);

const updateMonthlyRow = (
  index: number,
  field: keyof MonthlyRow,
  value: string
) => {
  setMonthlyRows((prev) =>
    prev.map((row, i) =>
      i === index
        ? {
            ...row,
            [field]:
              field === "mese"
                ? value.toUpperCase()
                : Number(String(value).replace(",", ".")) || 0,
          }
        : row
    )
  );
};
  
  const [gasOffers, setGasOffers] = useState<GasOffer[]>(INITIAL_GAS_OFFERS);
  const [gasAcciseSettings, setGasAcciseSettings] = useState<GasAcciseSettings>({
    agevolata: 0.012498,
    nonAgevolata: 0.18,
  });

  const [session, setSession] = useState<any>(null);
const [loadingSettings, setLoadingSettings] = useState(true);
const [savingSettings, setSavingSettings] = useState(false);

// ✅ STEP 3 QUI
const [selectedYear, setSelectedYear] = useState(2025);

// STEP 4
const fixedRows = monthlyRows.filter(r => r.anno === 0);
const yearRows = monthlyRows.filter(r => r.anno === selectedYear);

useEffect(() => {
  localStorage.setItem("app_tab", tab);
}, [tab]);

  const adminTabs = ["reportAdmin", "listini", "agents", "adminUsers"];
  const isAdminTab = adminTabs.includes(tab);
  const isSuperAdmin = true;

  const thStyle = {
    padding: "10px",
    borderBottom: "1px solid #ddd",
    textAlign: "left" as const,
  };
  
  const tdStyle = {
    padding: "10px",
    borderBottom: "1px solid #eee",
  };
  
  
  const inputStyle = {
    width: "100%",
    padding: "6px",
    borderRadius: 6,
    border: "1px solid #ccc",
  };
  
  const punPolylinePoints = getSvgPoints(punValues, 760, 220);
const psvPolylinePoints = getSvgPoints(psvValues, 760, 220);

useEffect(() => {
  const loadSettings = async () => {
    setLoadingSettings(true);

    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value_json");

    if (!error && data) {
      const map = Object.fromEntries(
        data.map((row: any) => [row.key, row.value_json])
      );

      if (Array.isArray(map.monthlyRows)) {
        const normalizedSavedRows: MonthlyRow[] = map.monthlyRows.map((row: any) => {
          if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS") {
            return {
              mese: row.mese,
              anno: 0,
              mono: Number(row.mono || 0),
              f1: Number(row.f1 || 0),
              f2: Number(row.f2 || 0),
              f3: Number(row.f3 || 0),
              psv: Number(row.psv || 0),
            };
          }
      
          return {
            mese: row.mese,
            anno: Number(row.anno || 2025),
            mono: Number(row.mono || 0),
            f1: Number(row.f1 || 0),
            f2: Number(row.f2 || 0),
            f3: Number(row.f3 || 0),
            psv: Number(row.psv || 0),
          };
        });
      
        const mergedMonthlyRows: MonthlyRow[] = INITIAL_MONTHLY.map((baseRow) => {
          const savedRow = normalizedSavedRows.find(
            (r) => r.mese === baseRow.mese && r.anno === baseRow.anno
          );
      
          return savedRow ? savedRow : baseRow;
        });
      
        setMonthlyRows(mergedMonthlyRows);
      }

      if (Array.isArray(map.dispCpRows)) {
        setDispCpRows(map.dispCpRows);
      }

      if (Array.isArray(map.energyOffers)) {
        setEnergyOffers(map.energyOffers);
      }

      if (Array.isArray(map.gasOffers)) {
        setGasOffers(map.gasOffers);
      }

      if (map.gasAcciseSettings) {
        setGasAcciseSettings(map.gasAcciseSettings);
      }

      if (Array.isArray(map.punPsvRows)) {
        setPunPsvRows(map.punPsvRows);
      }
    }

    setLoadingSettings(false);
  };

  loadSettings();
}, []);

const saveSettings = async () => {
  setSavingSettings(true);

  const payload = [
    { key: "monthlyRows", value_json: monthlyRows },
    { key: "dispCpRows", value_json: dispCpRows },
    { key: "energyOffers", value_json: energyOffers },
    { key: "gasOffers", value_json: gasOffers },
    { key: "gasAcciseSettings", value_json: gasAcciseSettings },
    { key: "punPsvRows", value_json: punPsvRows },
    
  ];

  const { error } = await supabase.from("app_settings").upsert(payload);

  setSavingSettings(false);

  if (error) {
    alert("Errore nel salvataggio online");
    return;
  }

  alert("Listini salvati online");
};

const renderAdminContent = () => {
  if (!adminSession || !adminProfile) {
    return (
      <LoginView
        setSession={setAdminSession}
        setAdminProfile={setAdminProfile}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
          flexWrap: "wrap",
        }}
      >
        <strong>Area Admin</strong>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setTab("reportAdmin")}
            style={{
              ...baseBtn,
              ...(tab === "reportAdmin" ? activeBtn : {}),
            }}
          >
            Report Admin
          </button>

          <button
            onClick={() => setTab("agents")}
            style={{
              ...baseBtn,
              ...(tab === "agents" ? activeBtn : {}),
            }}
          >
            Agent Admin
          </button>

          {adminProfile?.role === "super_admin" && (
            <button
              onClick={() => setTab("listini")}
              style={{
                ...baseBtn,
                ...(tab === "listini" ? activeBtn : {}),
              }}
            >
              Listini
            </button>
          )}

          {adminProfile?.role === "super_admin" && (
            <button
              onClick={() => setTab("punpsvAdmin")}
              style={{
                ...baseBtn,
                ...(tab === "punpsvAdmin" ? activeBtn : {}),
              }}
            >
              PUN / PSV Admin
            </button>
          )}

          <button
            onClick={() => {
              localStorage.removeItem("admin_session");
              setAdminSession(null);
              setAdminProfile(null);
              setSession(null);
              setTab("energia");
              localStorage.removeItem("app_tab");
            }}
            style={{
              ...baseBtn,
              background: "#ef4444",
              color: "white",
              border: "1px solid #ef4444",
            }}
          >
            Esci
          </button>
        </div>
      </div>

      {tab === "reportAdmin" && <ReportAdmin adminProfile={adminProfile} />}

      {tab === "agents" && (
        <>
          <AgentsAdmin adminProfile={adminProfile} />
          {adminProfile?.role === "super_admin" && (
            <AdminUsersManager adminProfile={adminProfile} />
          )}
        </>
      )}

      {tab === "listini" && (
        <Listini
          dispCpRows={dispCpRows}
          setDispCpRows={setDispCpRows}
          energyOffers={energyOffers}
          setEnergyOffers={setEnergyOffers}
          gasOffers={gasOffers}
          setGasOffers={setGasOffers}
          gasAcciseSettings={gasAcciseSettings}
          setGasAcciseSettings={setGasAcciseSettings}
        />
      )}

      {tab === "punpsvAdmin" && (
        
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>PUN / PSV Admin</h2>

          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "white",
              }}
            >
              {ANNI.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
  <button
    type="button"
    onClick={saveSettings}
    disabled={savingSettings}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "none",
      background: "#0f172a",
      color: "white",
      cursor: "pointer",
      fontWeight: 700,
    }}
  >
    {savingSettings ? "Salvataggio..." : "Salva PUN / PSV"}
  </button>
</div>

          <div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={thStyle}>Mese</th>
        <th style={thStyle}>Mono</th>
        <th style={thStyle}>F1</th>
        <th style={thStyle}>F2</th>
        <th style={thStyle}>F3</th>
        <th style={thStyle}>PSV</th>
      </tr>
    </thead>
    <tbody>
      {punPsvRows
        .filter((row) => {
          if (row.mese === "FISSO DOMESTICO" || row.mese === "FISSO BUSINESS") return true;
          return row.mese.endsWith(String(selectedYear));
        })
        .map((row) => (
          <tr key={row.mese}>
            <td style={tdStyle}>{row.mese}</td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.mono}
                onChange={(e) => updatePunPsvValue(row.mese, "mono", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.f1}
                onChange={(e) => updatePunPsvValue(row.mese, "f1", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.f2}
                onChange={(e) => updatePunPsvValue(row.mese, "f2", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.f3}
                onChange={(e) => updatePunPsvValue(row.mese, "f3", e.target.value)}
                style={inputStyle}
              />
            </td>
            <td style={tdStyle}>
              <input
                type="number"
                step="0.000001"
                value={row.psv}
                onChange={(e) => updatePunPsvValue(row.mese, "psv", e.target.value)}
                style={inputStyle}
              />
            </td>
          </tr>
        ))}
    </tbody>
  </table>
</div>
        </div>
      )}
    </div>
  );
};
  
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 20 }}>
      <h1>Simulatore Bollette</h1>
  
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
  <button
    onClick={() => setTab("energia")}
    style={{
      ...baseBtn,
      ...(tab === "energia" ? activeBtn : {}),
    }}
  >
    Energia
  </button>

  <button
    onClick={() => setTab("gas")}
    style={{
      ...baseBtn,
      ...(tab === "gas" ? activeBtn : {}),
    }}
  >
    Gas
  </button>

  <button
    onClick={() => setTab("report")}
    style={{
      ...baseBtn,
      ...(tab === "report" ? activeBtn : {}),
    }}
  >
    Report
  </button>

  <button
    onClick={() => setTab("punpsvPublic")}
    style={{
      ...baseBtn,
      ...(tab === "punpsvPublic" ? activeBtn : {}),
    }}
  >
    PUN / PSV
  </button>

  <button
    onClick={() => setTab("reportAdmin")}
    style={{
      ...baseBtn,
      ...(tab === "reportAdmin" ? activeBtn : {}),
    }}
  >
    Area Admin
  </button>
</div>
  
{tab === "energia" ? (
  <Energia
    punPsvRows={punPsvRows}
    energyOffers={energyOffers}
    dispCpRows={dispCpRows}
  />
) : tab === "gas" ? (
  <Gas
  punPsvRows={punPsvRows}
  gasOffers={gasOffers}
  gasAcciseSettings={gasAcciseSettings}
/>
) : tab === "report" ? (
        <ReportAgent />
        ) : tab === "punpsvPublic" ? (
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 20 }}>Andamento PUN / PSV</h2>
        
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 24,
                maxWidth: 280,
              }}
            >
              <label style={{ fontWeight: 600, color: "#0f172a" }}>
                Mese selezionato
              </label>
        
              <select
                value={selectedMonthPUN}
                onChange={(e) => setSelectedMonthPUN(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  color: "#0f172a",
                  fontSize: 16,
                }}
              >
                {publicPunPsvOptions.map((row) => (
  <option key={row.mese} value={row.mese}>
    {row.mese}
  </option>
))}
              </select>
            </div>

            <div
 style={{
   display:"flex",
   gap:10,
   flexWrap:"wrap",
   marginBottom:20
 }}
>
<button
onClick={()=>setPunPsvView("both")}
style={{
padding:"10px 14px",
borderRadius:10,
background: punPsvView==="both" ? "#0f172a":"white",
color: punPsvView==="both" ? "white":"#0f172a",
fontWeight:700
}}
>
PUN-PSV
</button>

<button
onClick={()=>setPunPsvView("pun")}
style={{
padding:"10px 14px",
borderRadius:10,
background: punPsvView==="pun" ? "#2563eb":"white",
color: punPsvView==="pun" ? "white":"#0f172a",
fontWeight:700
}}
>
PUN
</button>

<button
onClick={()=>setPunPsvView("psv")}
style={{
padding:"10px 14px",
borderRadius:10,
background: punPsvView==="psv" ? "#16a34a":"white",
color: punPsvView==="psv" ? "white":"#0f172a",
fontWeight:700
}}
>
PSV
</button>
</div>

            <div
  style={{
    display: "grid",
    gridTemplateColumns: punPsvView === "both" ? "1fr 1fr" : "1fr",
    gap: 20,
    marginBottom: 24
  }}
>

{/* PUN */}
{(punPsvView === "both" || punPsvView === "pun") && (
  <div
    style={{
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: 16,
      padding: 20,
    }}
  >
    <h3 style={{ marginTop: 0 }}>Andamento PUN</h3>

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 12,
        fontWeight: 700,
      }}
    >
      <span>Ultimo:</span>
      <span>{latestPun}</span>
    </div>

    <svg viewBox="0 0 760 220" style={{ width: "100%", height: 240 }}>
      {[40, 80, 120, 160].map((y) => (
        <line
          key={y}
          x1="0"
          x2="760"
          y1={y}
          y2={y}
          stroke="#dbe3ea"
        />
      ))}

      <polyline
        fill="none"
        stroke="#f59e0b"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={punPolyline}
      />

      {punCoords.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="6"
          fill="#f59e0b"
        />
      ))}

      {punCoords.map((p, i) => (
        <text
          key={"m" + i}
          x={p.x}
          y="205"
          textAnchor="middle"
          fontSize="14"
          fill="#64748b"
        >
          {["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"][i % 12]}
        </text>
      ))}

      {punCoords.map((p, i) => (
        <text
          key={"v" + i}
          x={p.x}
          y={p.y - 12}
          textAnchor="middle"
          fontSize="11"
          fill="#2563eb"
          fontWeight="700"
        >
          {punValues[i].toFixed(3)}
        </text>
      ))}
    </svg>
  </div>
)}

{/* PSV */}
{(punPsvView === "both" || punPsvView === "psv") && (
  <div
    style={{
      background:"#f8fafc",
      border:"1px solid #e2e8f0",
      borderRadius:16,
      padding:20
    }}
  >
    <h3 style={{marginTop:0}}>Andamento PSV</h3>

    <div style={{
      display:"flex",
      justifyContent:"space-between",
      marginBottom:12,
      fontWeight:700
    }}>
      <span>Ultimo:</span>
      <span>{latestPsv}</span>
    </div>

    <svg viewBox="0 0 760 220" style={{width:"100%",height:240}}>
      {[40,80,120,160].map(y=>(
        <line
          key={y}
          x1="0"
          x2="760"
          y1={y}
          y2={y}
          stroke="#dbe3ea"
        />
      ))}

      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={psvPolyline}
      />

      {psvCoords.map((p,i)=>(
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="6"
          fill="#2563eb"
        />
      ))}

      {psvCoords.map((p,i)=>(
        <text
          key={"psv"+i}
          x={p.x}
          y="205"
          textAnchor="middle"
          fontSize="14"
          fill="#64748b"
        >
          {["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][i % 12]}
        </text>
      ))}

      {psvCoords.map((p,i)=>(
        <text
          key={"psv-v"+i}
          x={p.x}
          y={p.y-12}
          textAnchor="middle"
          fontSize="11"
          fill="#2563eb"
          fontWeight="700"
        >
          {psvValues[i].toFixed(3)}
        </text>
      ))}
    </svg>
  </div>
)}

</div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  background: "white",
                }}
              >
                <thead>

{punPsvView==="both" && (
<tr style={{background:"#fff7ed"}}>
<th style={{textAlign:"left",padding:"14px 16px"}}>Mese</th>
<th style={{textAlign:"right",padding:"14px 16px",color:"#f59e0b"}}>
PUN
</th>
<th style={{textAlign:"right",padding:"14px 16px",color:"#2563eb"}}>
PSV
</th>
</tr>
)}

{punPsvView==="pun" && (
<tr style={{background:"#f8fafc"}}>
<th style={{textAlign:"left",padding:"14px 16px"}}>Mese</th>
<th style={{
textAlign:"right",
padding:"14px 16px",
background:"#ffedd5",
color:"#c2410c",
fontWeight:800,

}}>
Mono
</th>
<th style={{
textAlign:"right",
padding:"14px 16px",
background:"#fff7ed",
color:"#d97706",
fontWeight:700
}}>
F1
</th>
<th style={{
textAlign:"right",
padding:"14px 16px",
background:"#fffbeb",
color:"#ea580c",
fontWeight:700
}}>
F2
</th>
<th style={{
textAlign:"right",
padding:"14px 16px",
background:"#fef9c3",
color:"#ca8a04",
fontWeight:700
}}>
F3
</th>
</tr>
)}

{punPsvView==="psv" && (
<tr style={{background:"#eff6ff"}}>
<th style={{textAlign:"left",padding:"14px 16px"}}>Mese</th>
<th style={{textAlign:"right",padding:"14px 16px"}}>PSV</th>
</tr>
)}

</thead>

<tbody>
{tablePunPsvRows.map((row,index)=>(
<tr
 key={row.mese}
 style={{
  background:
    punPsvView==="pun"
      ? (index%2===0 ? "#fffaf0" : "#fff7ed")
      : punPsvView==="psv"
      ? (index%2===0 ? "#f8fbff" : "#eff6ff")
      : (index%2===0 ? "white" : "#fcfdff")
 }}
>

<td style={{
 padding:"14px 16px",
 borderBottom:"1px solid #e2e8f0"
}}>
{row.mese}
</td>

{punPsvView==="both" && (
<>
<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#d97706",
  fontWeight:600
}}>
{Number(row.mono).toFixed(6)}
</td>

<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#2563eb",
  fontWeight:600
}}>
{Number(row.psv).toFixed(6)}
</td>
</>
)}

{punPsvView==="pun" && (
<>
<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#c2410c",
  fontWeight:700,
  background:"#ffedd5"
}}>
{Number(row.mono).toFixed(6)}
</td>

<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#d97706",
  fontWeight:600
}}>
{Number(row.f1).toFixed(6)}
</td>

<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#ea580c",
  fontWeight:600
}}>
{Number(row.f2).toFixed(6)}
</td>

<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#ca8a04",
  fontWeight:600
}}>
{Number(row.f3).toFixed(6)}
</td>
</>
)}

{punPsvView==="psv" && (
<td style={{
  textAlign:"right",
  padding:"14px 16px",
  borderBottom:"1px solid #e2e8f0",
  color:"#2563eb",
  fontWeight:600
}}>
{Number(row.psv).toFixed(6)}
</td>
)}

</tr>
))}
</tbody>
              </table>
            </div>
          </div>
        ) : (
          renderAdminContent()
        )}
    </div>
  );
}
