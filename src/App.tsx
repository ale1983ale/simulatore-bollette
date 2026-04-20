import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "./supabase";

type MonthlyRow = {
  mese: string;
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

const INITIAL_MONTHLY: MonthlyRow[] = [
  { mese: "GENNAIO", mono: 0.132665, f1: 0.15126, f2: 0.1374, f3: 0.11829, psv: 0.55769 },
  { mese: "FEBBRAIO", mono: 0.114405, f1: 0.12228, f2: 0.11984, f3: 0.1053, psv: 0.376788 },
  { mese: "MARZO", mono: 0.1434, f1: 0.14302, f2: 0.15391, f3: 0.13809, psv: 0.45542 },
  { mese: "APRILE", mono: 0.099853, f1: 0.09584, f2: 0.115078, f3: 0.09505, psv: 0.402741 },
  { mese: "MAGGIO", mono: 0.093575, f1: 0.089087, f2: 0.110635, f3: 0.087114, psv: 0.403277 },
  { mese: "GIUGNO", mono: 0.11178, f1: 0.11306, f2: 0.12676, f3: 0.10363, psv: 0.419181 },
  { mese: "LUGLIO", mono: 0.112, f1: 0.108, f2: 0.13, f3: 0.104, psv: 0.392803 },
  { mese: "AGOSTO", mono: 0.10879, f1: 0.10558, f2: 0.11797, f3: 0.10604, psv: 0.38133 },
  { mese: "SETTEMBRE", mono: 0.10907, f1: 0.10959, f2: 0.120931, f3: 0.10187, psv: 0.373593 },
  { mese: "OTTOBRE", mono: 0.11104, f1: 0.11783, f2: 0.12166, f3: 0.09948, psv: 0.35395 },
  { mese: "NOVEMBRE", mono: 0.11709, f1: 0.12959, f2: 0.12402, f3: 0.10551, psv: 0.3453 },
  { mese: "DICEMBRE", mono: 0.11549, f1: 0.12959, f2: 0.12402, f3: 0.10551, psv: 0.37798 },
  { mese: "FISSO DOMESTICO", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
{ mese: "FISSO BUSINESS", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
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
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <select
        style={{
          width: "100%",
          padding: 8,
          border: "1px solid #cbd5e1",
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
  monthlyRows: MonthlyRow[],
  energyOffers: EnergyOffer[],
  dispCpRows: DispCpRow[]
) {
  const off = energyOffers.find((x) => x.nome === d.offerta) || energyOffers[0];
  const m1 = monthlyRows.find((x) => x.mese === d.mese1) || monthlyRows[0];
  const m2 = monthlyRows.find((x) => x.mese === d.mese2) || monthlyRows[0];
  const fissoDomesticoRow =
  monthlyRows.find((x) => x.mese === "FISSO DOMESTICO") || monthlyRows[0];

const fissoBusinessRow =
  monthlyRows.find((x) => x.mese === "FISSO BUSINESS") || monthlyRows[0];

  const mese1IsFisso = d.mese1 === "FISSO DOMESTICO" || d.mese1 === "FISSO BUSINESS";
const mese2IsFisso = d.mese2 === "FISSO DOMESTICO" || d.mese2 === "FISSO BUSINESS";

const meseTabella1 = mese1IsFisso ? d.meseRifTabella1 : d.mese1;
const meseTabella2 = mese2IsFisso ? d.meseRifTabella2 : d.mese2;

  const dispRow1 = dispCpRows.find((x) => x.mese === meseTabella1);
  const dispRow2 = dispCpRows.find((x) => x.mese === meseTabella2);

  const isDomestico = ["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(d.tipo);
const prezzoFisso = n(isDomestico ? fissoDomesticoRow.mono : fissoBusinessRow.mono);
  const mesi = energyMonths(d.fatturazione);

  const spreadEff = d.offerta === "DEDICATA" ? n(d.dedicataSpread) : n(off.spread);
  const cmEff =
    d.offerta === "DEDICATA"
      ? n(d.dedicataCapacityMarket)
      : n(off.maggiorazioneCapacityMarket);
  const quotaFissaEff =
    d.offerta === "DEDICATA" ? n(d.dedicataQuotaFissa) : n(off.canone);

    const prezzoMono1 = mese1IsFisso ? prezzoFisso : n(m1.mono);
    const prezzoMono2 = mese2IsFisso ? prezzoFisso : n(m2.mono);
    const prezzoF11 = mese1IsFisso ? prezzoFisso : n(m1.f1);
    const prezzoF12 = mese2IsFisso ? prezzoFisso : n(m2.f1);
    const prezzoF21 = mese1IsFisso ? prezzoFisso : n(m1.f2);
    const prezzoF22 = mese2IsFisso ? prezzoFisso : n(m2.f2);
    const prezzoF31 = mese1IsFisso ? prezzoFisso : n(m1.f3);
    const prezzoF32 = mese2IsFisso ? prezzoFisso : n(m2.f3);

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
  const H25 = n(d.quotaConsumiRete);
  const H24 = n(d.reattivaImmessa) + n(d.reattivaPrelevata);
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

function calcGas(d: any, monthlyRows: MonthlyRow[], gasOffers: GasOffer[]) {
  const off = gasOffers.find((x) => x.nome === d.offerta) || gasOffers[0];
  const mesi = gasMonths(d.fatturazione);

  const spreadEff = d.offerta === "DEDICATA" ? n(d.dedicataSpread) : n(off.spread);
  const quotaVarEff = d.offerta === "DEDICATA" ? n(d.dedicataQuotaVariabile) : n(off.quotaVariabile);
  const quotaFissaEff = d.offerta === "DEDICATA" ? n(d.dedicataQuotaFissa) : n(off.canone);

  const p1 = n((monthlyRows.find((x) => x.mese === d.periodo1) || monthlyRows[0]).psv);
  const p2 = n((monthlyRows.find((x) => x.mese === d.periodo2) || { psv: 0 }).psv);
  const p3 = n((monthlyRows.find((x) => x.mese === d.periodo3) || { psv: 0 }).psv);
  const p4 = n((monthlyRows.find((x) => x.mese === d.periodo4) || { psv: 0 }).psv);

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
  const H32 = isSi(d.overrideAcciseFlag) ? n(d.overrideAcciseValore) : consumoTotale * accisaCoeff;
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
  };
}

function Energia({
  monthlyRows,
  energyOffers,
  dispCpRows,
}: {
  monthlyRows: MonthlyRow[];
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
    mese1: "GENNAIO",
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
    () => calcEnergia(s, monthlyRows, energyOffers, dispCpRows),
    [s, monthlyRows, energyOffers, dispCpRows]
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
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {selectField("Mese 1", s.mese1, (v) => set("mese1", v), monthlyRows.map((m) => m.mese))}
              {s.mese1 === "FISSO DOMESTICO" || s.mese1 === "FISSO BUSINESS"
                ? selectField(
                    "Mese rif. tabella 1",
                    s.meseRifTabella1,
                    (v) => set("meseRifTabella1", v),
                    dispCpRows.map((m) => m.mese)
                  )
                : <div />}

              {field("F1 mese 1", s.f1Mese1, (v) => set("f1Mese1", v), "number")}
              {field("F2 mese 1", s.f2Mese1, (v) => set("f2Mese1", v), "number")}
              {field("F3 mese 1", s.f3Mese1, (v) => set("f3Mese1", v), "number")}
              {field("Mono mese 1", s.monoMese1, (v) => set("monoMese1", v), "number")}

              {selectField("Mese 2", s.mese2, (v) => set("mese2", v), ["", ...monthlyRows.map((m) => m.mese)])}
              {s.mese2 === "FISSO DOMESTICO" || s.mese2 === "FISSO BUSINESS"
                ? selectField(
                    "Mese rif. tabella 2",
                    s.meseRifTabella2,
                    (v) => set("meseRifTabella2", v),
                    dispCpRows.map((m) => m.mese)
                  )
                : <div />}

              {field("F1 mese 2", s.f1Mese2, (v) => set("f1Mese2", v), "number")}
              {field("F2 mese 2", s.f2Mese2, (v) => set("f2Mese2", v), "number")}
              {field("F3 mese 2", s.f3Mese2, (v) => set("f3Mese2", v), "number")}
              {field("Mono mese 2", s.monoMese2, (v) => set("monoMese2", v), "number")}

              {field(
                "DISP+CP.Mrk",
                s.dispacciamentoCapacityMarket,
                (v) => set("dispacciamentoCapacityMarket", v),
                "number"
              )}
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
  monthlyRows,
  gasOffers,
  gasAcciseSettings,
}: {
  monthlyRows: MonthlyRow[];
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
    periodo1: "GENNAIO",
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

  const r = useMemo(() => calcGas(s, monthlyRows, gasOffers), [s, monthlyRows, gasOffers]);

  const gasMonthOptions = monthlyRows
    .filter((m) => m.mese !== "FISSO DOMESTICO" && m.mese !== "FISSO BUSINESS")
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
  monthlyRows,
  setMonthlyRows,
  dispCpRows,
  setDispCpRows,
  energyOffers,
  setEnergyOffers,
  gasOffers,
  setGasOffers,
  gasAcciseSettings,
  setGasAcciseSettings,
}: {
  monthlyRows: MonthlyRow[];
  setMonthlyRows: React.Dispatch<React.SetStateAction<MonthlyRow[]>>;
  dispCpRows: DispCpRow[];
  setDispCpRows: React.Dispatch<React.SetStateAction<DispCpRow[]>>;
  energyOffers: EnergyOffer[];
  setEnergyOffers: React.Dispatch<React.SetStateAction<EnergyOffer[]>>;
  gasOffers: GasOffer[];
  setGasOffers: React.Dispatch<React.SetStateAction<GasOffer[]>>;
  gasAcciseSettings: GasAcciseSettings;
  setGasAcciseSettings: React.Dispatch<React.SetStateAction<GasAcciseSettings>>;
}) {
  const updateMonthly = (index: number, key: keyof MonthlyRow, value: string) => {
    setMonthlyRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: key === "mese" ? value : n(value) } : row))
    );
  };

  const updateDispCp = (index: number, key: keyof DispCpRow, value: string) => {
    setDispCpRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "mese" ? value : n(value) } : row
      )
    );
  };

  const updateEnergyOffer = (index: number, key: keyof EnergyOffer, value: string) => {
    setEnergyOffers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row))
    );
  };

  const updateGasOffer = (index: number, key: keyof GasOffer, value: string) => {
    setGasOffers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row))
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Listini mensili</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Mese", "PUN Mono", "PUN F1", "PUN F2", "PUN F3", "PSV"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row, i) => (
                <tr key={row.mese}>
                  <td style={{ padding: 8 }}>{row.mese}</td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.mono} onChange={(e) => updateMonthly(i, "mono", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.f1} onChange={(e) => updateMonthly(i, "f1", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.f2} onChange={(e) => updateMonthly(i, "f2", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.f3} onChange={(e) => updateMonthly(i, "f3", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.psv} onChange={(e) => updateMonthly(i, "psv", e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Dispacciamento + CP Market Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Mese", "Dispacciam", "CP Market", "Tot"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>
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
                    <td style={{ padding: 8 }}>{row.mese}</td>
                    <td style={{ padding: 8 }}>
                      <input
                        type="number"
                        step="0.000001"
                        style={{ width: 110, padding: 6 }}
                        value={row.dispacciamento}
                        onChange={(e) => updateDispCp(i, "dispacciamento", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: 8 }}>
                      <input
                        type="number"
                        step="0.000001"
                        style={{ width: 110, padding: 6 }}
                        value={row.cpMarket}
                        onChange={(e) => updateDispCp(i, "cpMarket", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: 8 }}>
                      <input
                        type="number"
                        step="0.000001"
                        style={{ width: 110, padding: 6, background: "#f8fafc" }}
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
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {energyOffers.map((row, i) => (
                <tr key={row.nome + i}>
                  <td style={{ padding: 8 }}>
                    <input style={{ width: 180, padding: 6 }} value={row.nome} onChange={(e) => updateEnergyOffer(i, "nome", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.spread} onChange={(e) => updateEnergyOffer(i, "spread", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 120, padding: 6 }} value={row.maggiorazioneCapacityMarket} onChange={(e) => updateEnergyOffer(i, "maggiorazioneCapacityMarket", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.01" style={{ width: 100, padding: 6 }} value={row.canone} onChange={(e) => updateEnergyOffer(i, "canone", e.target.value)} />
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
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gasOffers.map((row, i) => (
                <tr key={row.nome + i}>
                  <td style={{ padding: 8 }}>
                    <input style={{ width: 180, padding: 6 }} value={row.nome} onChange={(e) => updateGasOffer(i, "nome", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 100, padding: 6 }} value={row.spread} onChange={(e) => updateGasOffer(i, "spread", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.000001" style={{ width: 120, padding: 6 }} value={row.quotaVariabile} onChange={(e) => updateGasOffer(i, "quotaVariabile", e.target.value)} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input type="number" step="0.01" style={{ width: 100, padding: 6 }} value={row.canone} onChange={(e) => updateGasOffer(i, "canone", e.target.value)} />
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
  const [adminSession, setAdminSession] = useState<AdminProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);

  const [tab, setTab] = useState(() => {
    return localStorage.getItem("app_tab") || "energia";
  });

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
  const [gasOffers, setGasOffers] = useState<GasOffer[]>(INITIAL_GAS_OFFERS);
  const [gasAcciseSettings, setGasAcciseSettings] = useState<GasAcciseSettings>({
    agevolata: 0.012498,
    nonAgevolata: 0.18,
  });

  const [session, setSession] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

useEffect(() => {
  localStorage.setItem("app_tab", tab);
}, [tab]);

  const adminTabs = ["reportAdmin", "listini", "agents", "adminUsers"];
  const isAdminTab = adminTabs.includes(tab);

  

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

        if (Array.isArray(map.monthlyRows) && map.monthlyRows.length > 0) {
          const loadedMonthlyRows = [...map.monthlyRows];

          const oldFisso = loadedMonthlyRows.find((r: any) => r.mese === "FISSO");

          const withoutOldFisso = loadedMonthlyRows.filter((r: any) => r.mese !== "FISSO");

          const baseRows = withoutOldFisso.filter(
            (r: any) => r.mese !== "FISSO DOMESTICO" && r.mese !== "FISSO BUSINESS"
          );

          const fissoDomestico =
            withoutOldFisso.find((r: any) => r.mese === "FISSO DOMESTICO") || {
              mese: "FISSO DOMESTICO",
              mono: oldFisso?.mono ?? 0,
              f1: oldFisso?.f1 ?? 0,
              f2: oldFisso?.f2 ?? 0,
              f3: oldFisso?.f3 ?? 0,
              psv: oldFisso?.psv ?? 0,
            };

          const fissoBusiness =
            withoutOldFisso.find((r: any) => r.mese === "FISSO BUSINESS") || {
              mese: "FISSO BUSINESS",
              mono: oldFisso?.mono ?? 0,
              f1: oldFisso?.f1 ?? 0,
              f2: oldFisso?.f2 ?? 0,
              f3: oldFisso?.f3 ?? 0,
              psv: oldFisso?.psv ?? 0,
            };

          setMonthlyRows([...baseRows, fissoDomestico, fissoBusiness]);
        }

        if (Array.isArray(map.dispCpRows) && map.dispCpRows.length > 0) {
          setDispCpRows(map.dispCpRows);
        }

        if (Array.isArray(map.energyOffers) && map.energyOffers.length > 0) {
          setEnergyOffers(map.energyOffers);
        }

        if (Array.isArray(map.gasOffers) && map.gasOffers.length > 0) {
          setGasOffers(map.gasOffers);
        }

        if (
          map.gasAcciseSettings &&
          typeof map.gasAcciseSettings === "object" &&
          Object.keys(map.gasAcciseSettings).length > 0
        ) {
          setGasAcciseSettings(map.gasAcciseSettings);
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

  
  
    
  
    if (!adminProfile) {
      return (
        <div style={{ padding: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          Questo utente non è abilitato come admin.
        </div>
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
    type="button"
    onClick={() => setTab("reportAdmin")}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: tab === "reportAdmin" ? "#0f172a" : "white",
      color: tab === "reportAdmin" ? "white" : "#0f172a",
      cursor: "pointer",
    }}
  >
    Report Admin
  </button>

  <button
    type="button"
    onClick={() => setTab("agents")}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: tab === "agents" ? "#0f172a" : "white",
      color: tab === "agents" ? "white" : "#0f172a",
      cursor: "pointer",
    }}
  >
    Agent Admin
  </button>

  {adminProfile?.role === "super_admin" && (
    <button
      type="button"
      onClick={() => setTab("listini")}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #cbd5e1",
        background: tab === "listini" ? "#0f172a" : "white",
        color: tab === "listini" ? "white" : "#0f172a",
        cursor: "pointer",
      }}
    >
      Listini
    </button>
  )}

  <button
    type="button"
    onClick={() => {
      localStorage.removeItem("admin_session");
      setAdminSession(null);
      setAdminProfile(null);
      setSession(null);
      setTab("energia");
      localStorage.removeItem("app_tab");
    }}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: "white",
      color: "#0f172a",
      cursor: "pointer",
    }}
  >
    Esci
  </button>
</div>
        </div>
  
        {tab === "reportAdmin" && (
  <ReportAdmin adminProfile={adminProfile} />
)}
  
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
            monthlyRows={monthlyRows}
            setMonthlyRows={setMonthlyRows}
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
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: tab === "energia" ? "#0f172a" : "white",
      color: tab === "energia" ? "white" : "#0f172a",
      cursor: "pointer",
    }}
  >
    Energia
  </button>

  <button
    onClick={() => setTab("gas")}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: tab === "gas" ? "#0f172a" : "white",
      color: tab === "gas" ? "white" : "#0f172a",
      cursor: "pointer",
    }}
  >
    Gas
  </button>

  <button
    onClick={() => setTab("report")}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: tab === "report" ? "#0f172a" : "white",
      color: tab === "report" ? "white" : "#0f172a",
      cursor: "pointer",
    }}
  >
    Report
  </button>

  <button
    onClick={() => setTab("reportAdmin")}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: isAdminTab ? "#0f172a" : "white",
      color: isAdminTab ? "white" : "#0f172a",
      cursor: "pointer",
    }}
  >
    Area Admin
  </button>
</div>
  
{tab === "energia" ? (
  <Energia
    monthlyRows={monthlyRows}
    energyOffers={energyOffers}
    dispCpRows={dispCpRows}
  />
) : tab === "gas" ? (
  <Gas
    monthlyRows={monthlyRows}
    gasOffers={gasOffers}
    gasAcciseSettings={gasAcciseSettings}
  />
) : tab === "report" ? (
  <ReportAgent />
  ) : (
    renderAdminContent()
  )}
    </div>
);
}
