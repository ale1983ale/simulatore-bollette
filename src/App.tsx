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
  { mese: "FISSO", mono: 0, f1: 0, f2: 0, f3: 0, psv: 0 },
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
  const fissoRow = monthlyRows.find((x) => x.mese === "FISSO") || monthlyRows[0];

  const prezzoFisso = n(fissoRow.mono);
  const mesi = energyMonths(d.fatturazione);

  const spreadEff = d.offerta === "DEDICATA" ? n(d.dedicataSpread) : n(off.spread);
  const cmEff = d.offerta === "DEDICATA" ? n(d.dedicataCapacityMarket) : n(off.maggiorazioneCapacityMarket);
  const quotaFissaEff = d.offerta === "DEDICATA" ? n(d.dedicataQuotaFissa) : n(off.canone);

  const prezzoMono1 = d.mese1 === "FISSO" ? prezzoFisso : n(m1.mono);
  const prezzoMono2 = d.mese2 === "FISSO" ? prezzoFisso : n(m2.mono);
  const prezzoF11 = d.mese1 === "FISSO" ? prezzoFisso : n(m1.f1);
  const prezzoF12 = d.mese2 === "FISSO" ? prezzoFisso : n(m2.f1);
  const prezzoF21 = d.mese1 === "FISSO" ? prezzoFisso : n(m1.f2);
  const prezzoF22 = d.mese2 === "FISSO" ? prezzoFisso : n(m2.f2);
  const prezzoF31 = d.mese1 === "FISSO" ? prezzoFisso : n(m1.f3);
  const prezzoF32 = d.mese2 === "FISSO" ? prezzoFisso : n(m2.f3);

  const consumiMese1 =
    n(d.f1Mese1) + n(d.f2Mese1) + n(d.f3Mese1) + n(d.monoMese1);
  const consumiMese2 =
    n(d.f1Mese2) + n(d.f2Mese2) + n(d.f3Mese2) + n(d.monoMese2);

  const consumiTot = consumiMese1 + consumiMese2;

  // 🔥 PERCENTUALE PERDITE
  const perditaPercentuale =
    ["MTA1", "MTA2", "MTA3"].includes(d.tipo) ? 0.038 : 0.1;

  // 🔥 PERDITE CALCOLATE PER FASCIA
  const perditeEnergia =
    n(d.f1Mese1) * perditaPercentuale * (prezzoF11 + spreadEff) +
    n(d.f1Mese2) * perditaPercentuale * (prezzoF12 + spreadEff) +
    n(d.f2Mese1) * perditaPercentuale * (prezzoF21 + spreadEff) +
    n(d.f2Mese2) * perditaPercentuale * (prezzoF22 + spreadEff) +
    n(d.f3Mese1) * perditaPercentuale * (prezzoF31 + spreadEff) +
    n(d.f3Mese2) * perditaPercentuale * (prezzoF32 + spreadEff) +
    n(d.monoMese1) * perditaPercentuale * (prezzoMono1 + spreadEff) +
    n(d.monoMese2) * perditaPercentuale * (prezzoMono2 + spreadEff);

  const consumiTotConPerdite = consumiTot * (1 + perditaPercentuale);

  const H22_base =
    n(d.f1Mese1) * (prezzoF11 + spreadEff) +
    n(d.f1Mese2) * (prezzoF12 + spreadEff) +
    n(d.f2Mese1) * (prezzoF21 + spreadEff) +
    n(d.f2Mese2) * (prezzoF22 + spreadEff) +
    n(d.f3Mese1) * (prezzoF31 + spreadEff) +
    n(d.f3Mese2) * (prezzoF32 + spreadEff) +
    n(d.monoMese1) * (prezzoMono1 + spreadEff) +
    n(d.monoMese2) * (prezzoMono2 + spreadEff);

  // 🔥 DISP+CP aumentato
  const dispCpTotale = consumiTotConPerdite * (n(d.dispacciamentoCapacityMarket) + cmEff);

  // 🔥 NUOVA VENDITA ENERGIA
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
    consumiTot,
    dispCpTotale,
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

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      onLogin();
    } catch (err: any) {
      setErrorMsg(err?.message || "Errore login");
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "40px auto",
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Accesso Listini</h2>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              boxSizing: "border-box",
            }}
          />
        </div>

        {errorMsg && <div style={{ color: "#dc2626", fontSize: 13 }}>{errorMsg}</div>}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#0f172a",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {loading ? "Accesso..." : "Entra"}
        </button>
      </div>
    </div>
  );
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

  const r = useMemo(
    () => calcEnergia(s, monthlyRows, energyOffers, dispCpRows),
    [s, monthlyRows, energyOffers, dispCpRows]
  );

  const set = (k: string, v: string) =>
    setS((prev) => {
      const newState = { ...prev, [k]: v };

      if (k === "tipo") {
        if (["RESIDENTE", "NON RESIDENTE", "RESIDENTE CANONE ESENTE"].includes(v)) {
          newState.iva = "10";
        } else if (["BTA1", "BTA2", "BTA3", "BTA4", "BTA5", "BTA6", "MTA1", "MTA2", "MTA3"].includes(v)) {
          newState.iva = "22";
        }
      }

      return newState;
    });

  const consumoAnnuoEnergia =
    r.consumiTot *
    (s.fatturazione === "MENSILE" || s.fatturazione === "MULTI POD MENSILE" ? 12 : 6);

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
    ].filter(Boolean).join("");

    const altrePartiteTot = [r.H38, -r.H39, r.H40].reduce((a, b) => a + b, 0);

    const acciseIvaRows = [
      r.H35 !== 0 ? `<tr><td>Accise</td><td style="text-align:right">${money(r.H35)}</td></tr>` : "",
      r.H36 !== 0 ? `<tr><td>IVA</td><td style="text-align:right">${money(r.H36)}</td></tr>` : "",
    ].filter(Boolean).join("");

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
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Energia</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                {field("Spread", s.dedicataSpread, (v) => set("dedicataSpread", v), "number")}
                {field("Maggiorazione Capacity Market", s.dedicataCapacityMarket, (v) => set("dedicataCapacityMarket", v), "number")}
                {field("Quota Fissa", s.dedicataQuotaFissa, (v) => set("dedicataQuotaFissa", v), "number")}
              </div>
            </>
          )}
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr auto auto auto auto",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  }}
>
            <h3 style={{ margin: 0 }}>Mesi e consumi</h3>

            <div
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                padding: "8px 12px",
                background: "#f8fafc",
                minWidth: 170,
                textAlign: "right",
              }}
            >
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
            <div
  style={{
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#f8fafc",
    minWidth: 170,
    textAlign: "right",
  }}
>
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
            <div style={{ minWidth: 190 }}>
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
                whiteSpace: "nowrap",
              }}
            >
              Usa valore base
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 12 }}>
            {selectField("Mese 1", s.mese1, (v) => set("mese1", v), monthlyRows.map((m) => m.mese))}
            {s.mese1 === "FISSO"
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
            {s.mese2 === "FISSO"
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

            {field("DISP+CP.Mrk", s.dispacciamentoCapacityMarket, (v) => set("dispacciamentoCapacityMarket", v), "number")}
          </div>
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Rete, oneri, rettifiche</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            {field("Quota consumi rete", s.quotaConsumiRete, (v) => set("quotaConsumiRete", v), "number")}
            {field("Quota fissa rete", s.quotaFissaRete, (v) => set("quotaFissaRete", v), "number")}
            {field("Quota potenza rete", s.quotaPotenzaRete, (v) => set("quotaPotenzaRete", v), "number")}
          </div>
          <div style={{ height: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
  {field("Reattiva immessa", s.reattivaImmessa, (v) => set("reattivaImmessa", v), "number")}
  {field("Reattiva prelevata", s.reattivaPrelevata, (v) => set("reattivaPrelevata", v), "number")}
</div>
          </div>
          <div style={{ height: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
            {toggleAmount("Confronto Fornitore Precedente", s.confrontoFlag, (v) => set("confrontoFlag", v), s.confrontoValore, (v) => set("confrontoValore", v))}
            {toggleAmount("Ricalcoli/Sconti", s.ricalcoloFlag, (v) => set("ricalcoloFlag", v), s.ricalcoloValore, (v) => set("ricalcoloValore", v))}
            {toggleAmount("Bonus sociale", s.bonusFlag, (v) => set("bonusFlag", v), s.bonusValore, (v) => set("bonusValore", v))}
            {toggleAmount("Accise manuali", s.acciseManualiFlag, (v) => set("acciseManualiFlag", v), s.acciseManualiValore, (v) => set("acciseManualiValore", v))}
          </div>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Anteprima Energia</h3>

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
            {row("Quota consumi totale", money(r.H22 + r.H25))}
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

  const r = useMemo(() => calcGas(s, monthlyRows, gasOffers), [s, monthlyRows, gasOffers]);

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
    ].filter(Boolean).join("");

    const altrePartiteTot = [r.H35, -r.H36].reduce((a, b) => a + b, 0);

    const acciseIvaRows = [
      r.H32 !== 0 ? `<tr><td>Accise</td><td style="text-align:right">${money(r.H32)}</td></tr>` : "",
      r.H33 !== 0 ? `<tr><td>IVA</td><td style="text-align:right">${money(r.H33)}</td></tr>` : "",
    ].filter(Boolean).join("");

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
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Gas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                {field("Spread", s.dedicataSpread, (v) => set("dedicataSpread", v), "number")}
                {field("Quota variabile", s.dedicataQuotaVariabile, (v) => set("dedicataQuotaVariabile", v), "number")}
                {field("Quota fissa", s.dedicataQuotaFissa, (v) => set("dedicataQuotaFissa", v), "number")}
              </div>
            </>
          )}
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Mesi e consumi</h3>
            <div
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                padding: "8px 12px",
                background: "#f8fafc",
                minWidth: 170,
                textAlign: "right",
              }}
            >
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
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
            {selectField("Mese 1", s.periodo1, (v) => set("periodo1", v), monthlyRows.map((m) => m.mese))}
            {selectField("Mese 2", s.periodo2, (v) => set("periodo2", v), ["", ...monthlyRows.map((m) => m.mese)])}
            {selectField("Mese 3", s.periodo3, (v) => set("periodo3", v), ["", ...monthlyRows.map((m) => m.mese)])}
            {selectField("Mese 4", s.periodo4, (v) => set("periodo4", v), ["", ...monthlyRows.map((m) => m.mese)])}
            {field("Consumo 1", s.consumo1, (v) => set("consumo1", v), "number")}
            {field("Consumo 2", s.consumo2, (v) => set("consumo2", v), "number")}
            {field("Consumo 3", s.consumo3, (v) => set("consumo3", v), "number")}
            {field("Consumo 4", s.consumo4, (v) => set("consumo4", v), "number")}
          </div>
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Rete e corrispettivi</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
            {field("Quota variabile rete", s.quotaVariabileAggiuntiva, (v) => set("quotaVariabileAggiuntiva", v), "number")}
            {field("Quota fissa rete", s.quotaFissaAggiuntiva, (v) => set("quotaFissaAggiuntiva", v), "number")}
          </div>
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Rettifiche e imposte</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
            {toggleAmount("Accise manuali", s.overrideAcciseFlag, (v) => set("overrideAcciseFlag", v), s.overrideAcciseValore, (v) => set("overrideAcciseValore", v))}
            {toggleAmount("Confronto fornitore precedente", s.confrontoFlag, (v) => set("confrontoFlag", v), s.confrontoValore, (v) => set("confrontoValore", v))}
            {toggleAmount("Bonus sociale", s.bonusFlag, (v) => set("bonusFlag", v), s.bonusValore, (v) => set("bonusValore", v))}
            {toggleAmount("Ricalcoli/Sconti", s.ricalcoloFlag, (v) => set("ricalcoloFlag", v), s.ricalcoloValore, (v) => set("ricalcoloValore", v))}
          </div>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Anteprima Gas</h3>

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

export default function App() {
  const [tab, setTab] = useState("energia");
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
    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setSession(null);
          return;
        }

        setSession(data?.session ?? null);
      } catch {
        setSession(null);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          setMonthlyRows(map.monthlyRows);
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

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Simulatore Bollette</h1>
        <p style={{ color: "#475569" }}>Versione con Energia, Gas e Listini modificabili.</p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setTab("energia")}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: tab === "energia" ? "#0f172a" : "white",
              color: tab === "energia" ? "white" : "#0f172a",
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
            }}
          >
            Gas
          </button>
          <button
            onClick={() => setTab("listini")}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: tab === "listini" ? "#0f172a" : "white",
              color: tab === "listini" ? "white" : "#0f172a",
            }}
          >
            Listini
          </button>
        </div>

        {tab === "energia" ? (
          <Energia monthlyRows={monthlyRows} energyOffers={energyOffers} dispCpRows={dispCpRows} />
        ) : tab === "gas" ? (
          <Gas monthlyRows={monthlyRows} gasOffers={gasOffers} gasAcciseSettings={gasAcciseSettings} />
        ) : !session ? (
          <LoginView onLogin={() => setTab("listini")} />
        ) : loadingSettings ? (
          <div style={{ padding: 20 }}>Caricamento listini...</div>
        ) : (
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
              }}
            >
              <div>
                <strong>Area Listini protetta</strong>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  Le modifiche vengono salvate online e restano disponibili su tutti i dispositivi.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
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
                  }}
                >
                  {savingSettings ? "Salvataggio..." : "Salva listini online"}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setTab("energia");
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
          </div>
        )}
      </div>
    </div>
  );
}
