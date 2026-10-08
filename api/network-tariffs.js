import * as XLSX from "xlsx";

const MONTHS = [
  "GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO",
  "LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"
];

const TYPES = [
  "RESIDENTE","NON RESIDENTE","RESIDENTE CANONE ESENTE",
  "BTA1","BTA2","BTA3","BTA4","BTA5","BTA6",
  "MTA1","MTA2","MTA3"
];

const BASE = {
  2025: {
    "RESIDENTE":[22.80,25.08,0.01189],
    "NON RESIDENTE":[22.80,25.08,0.01189],
    "RESIDENTE CANONE ESENTE":[22.80,25.08,0.01189],
    "BTA1":[27.4729,35.2511,0.01262],
    "BTA2":[27.4729,33.3860,0.01262],
    "BTA3":[27.4729,37.1162,0.01262],
    "BTA4":[28.0420,37.1162,0.01262],
    "BTA5":[28.0420,37.1162,0.01262],
    "BTA6":[27.4729,35.2511,0.01260],
    "MTA1":[804.2278,38.6738,0.01180],
    "MTA2":[750.2413,34.7273,0.01172],
    "MTA3":[733.8108,30.4655,0.01167],
  },
  2026: {
    "RESIDENTE":[23.04,23.52,0.01190],
    "NON RESIDENTE":[23.04,23.52,0.01190],
    "RESIDENTE CANONE ESENTE":[23.04,23.52,0.01190],
    "BTA1":[27.1940,32.9297,0.01258],
    "BTA2":[27.1940,31.1874,0.01258],
    "BTA3":[27.1940,34.6720,0.01258],
    "BTA4":[27.7287,34.6720,0.01258],
    "BTA5":[27.7287,34.6720,0.01258],
    "BTA6":[27.1940,32.9297,0.01256],
    "MTA1":[768.9318,35.9875,0.01176],
    "MTA2":[718.2113,32.3151,0.01169],
    "MTA3":[702.7748,28.3493,0.01164],
  },
};

const Q1_2025 = {
  "RESIDENTE":[0,0.1988,0.033818],
  "NON RESIDENTE":[90.642,0.1988,0.033818],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.033818],
  "BTA1":[17.4864,19.1064,0.045808],
  "BTA2":[17.4864,18.0972,0.045808],
  "BTA3":[17.4864,20.1168,0.045808],
  "BTA4":[17.7924,20.1168,0.045808],
  "BTA5":[17.7924,20.1168,0.045808],
  "BTA6":[17.4864,19.1064,0.045797],
  "MTA1":[586.6863,20.9616,0.043822],
  "MTA2":[557.4231,18.8232,0.043779],
  "MTA3":[548.5179,16.5132,0.043751],
};

const Q2_2025 = {
  "RESIDENTE":[0,0.1988,0.032952],
  "NON RESIDENTE":[90.642,0.1988,0.032952],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.032952],
  "BTA1":[16.6632,18.1116,0.045406],
  "BTA2":[16.6632,17.1552,0.045406],
  "BTA3":[16.6632,19.0692,0.045406],
  "BTA4":[16.9536,19.0692,0.045406],
  "BTA5":[16.9536,19.0692,0.045406],
  "BTA6":[16.6632,18.1116,0.045395],
  "MTA1":[561.2283,19.8696,0.043471],
  "MTA2":[533.4891,17.8428,0.043430],
  "MTA3":[525.0471,15.6528,0.043404],
};

const Q1_2026 = {
  "RESIDENTE":[0,0.1988,0.033125],
  "NON RESIDENTE":[88.752,0.1988,0.033125],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.033125],
  "BTA1":[16.6464,17.0640,0.046212],
  "BTA2":[16.6464,16.1616,0.046212],
  "BTA3":[16.6464,17.9676,0.046212],
  "BTA4":[16.9224,17.9676,0.046212],
  "BTA5":[16.9224,17.9676,0.046212],
  "BTA6":[16.6464,17.0640,0.046202],
  "MTA1":[546.9327,18.6492,0.044176],
  "MTA2":[520.6467,16.7472,0.044142],
  "MTA3":[512.6463,14.6916,0.044115],
};

const Q2_2026 = {
  "RESIDENTE":[0,0.1988,0.033125],
  "NON RESIDENTE":[88.752,0.1988,0.033125],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.033125],
  "BTA1":[16.6464,17.0640,0.032419],
  "BTA2":[16.6464,16.1616,0.032419],
  "BTA3":[16.6464,17.9676,0.032419],
  "BTA4":[16.9224,17.9676,0.032419],
  "BTA5":[16.9224,17.9676,0.032419],
  "BTA6":[16.6464,17.0640,0.032412],
  "MTA1":[546.9327,18.6492,0.030733],
  "MTA2":[520.6467,16.7472,0.030708],
  "MTA3":[512.6463,14.6916,0.030688],
};

const Q3_2026 = {
  "RESIDENTE":[0,0.1988,0.035983],
  "NON RESIDENTE":[95.0916,0.1988,0.035983],
  "RESIDENTE CANONE ESENTE":[0,0.1988,0.035983],
  "BTA1":[17.7024,18.2688,0.036327],
  "BTA2":[17.7024,17.3028,0.036327],
  "BTA3":[17.7024,19.2372,0.036327],
  "BTA4":[17.9988,19.2372,0.036327],
  "BTA5":[17.9988,19.2372,0.036327],
  "BTA6":[17.7024,18.2688,0.036327],
  "MTA1":[578.6331,19.9656,0.034547],
  "MTA2":[550.4943,17.9280,0.034519],
  "MTA3":[541.9287,15.7284,0.034498],
};

function qFor(year, month) {
  if (year === 2025) return month <= 3 ? Q1_2025 : Q2_2025;
  if (year === 2026) {
    if (month <= 3) return Q1_2026;
    if (month <= 6) return Q2_2026;
    if (month <= 9) return Q3_2026;
  }
  return null;
}

function round6(v) {
  return Number(Number(v).toFixed(6));
}

function buildRows() {
  const rows = [];
  for (const year of [2025, 2026]) {
    const lastMonth = year === 2026 ? 9 : 12;
    for (let month = 1; month <= lastMonth; month += 1) {
      const q = qFor(year, month);
      if (!q) continue;
      for (const tipo of TYPES) {
        const base = BASE[year]?.[tipo];
        const system = q[tipo];
        if (!base || !system) continue;
        rows.push({
          mese: `${MONTHS[month - 1]} ${year}`,
          anno: year,
          meseNumero: month,
          tipo,
          quotaFissaAnnua: round6(base[0] + system[0]),
          quotaPotenzaAnnua: round6(base[1] + system[1]),
          quotaEnergia: round6(base[2] + system[2]),
          status: "STORICO UFFICIALE",
          source: "ARERA / tariffa rete e oneri",
        });
      }
    }
  }
  return rows;
}

const DOMESTIC_SOURCE = "https://www.arera.it/fileadmin/area_operatori/prezzi_e_tariffe/Corrispettivi_libero_elettrico_domestico_2026.xlsx";
const DOMESTIC_TYPES = ["RESIDENTE","NON RESIDENTE","RESIDENTE CANONE ESENTE"];

function officialNumber(value, optional=false) {
  if (value === null || value === undefined || String(value).trim() === "") return optional ? 0 : null;
  const v=String(value).trim();
  if (/^-+$/.test(v)) return optional ? 0 : null;
  const result=Number(v.replace(/\s/g,"").replace(",","."));
  return Number.isFinite(result) && result>=0 ? result : null;
}

function parseDomesticNetworkSection(rows, headerAt) {
  const header=(rows[headerAt] || []).map((v)=>String(v).trim().toLowerCase());
  if (header[1] !== "dispacciamento" || !String(header[2]).includes("σ1") ||
    !String(header[3]).includes("σ2") || !String(header[4]).includes("σ3") ||
    !String(header[8]).includes("asos") || !String(header[9]).includes("arim")) return null;
  const energy=rows[headerAt+2] || [], fixed=rows[headerAt+3] || [],power=rows[headerAt+4] || [];
  if (!String(energy[0]).toLowerCase().includes("quota energia") ||
    !String(fixed[0]).toLowerCase().includes("quota fissa") ||
    !String(power[0]).toLowerCase().includes("quota potenza")) return null;

  const required=[
    officialNumber(energy[4]),officialNumber(energy[5]),officialNumber(energy[6]),
    officialNumber(energy[8]),officialNumber(energy[9]),
    officialNumber(fixed[2]),officialNumber(power[3]),officialNumber(power[6]),
  ];
  if(required.some((n)=>n===null))return null;
  const reteEnergia=required[0]+required[1]+required[2];
  const oneriEnergia=required[3]+required[4];
  const quotaEnergia=reteEnergia+oneriEnergia;
  const quotaFissaAnnua=required[5]+officialNumber(fixed[8],true)+officialNumber(fixed[9],true);
  const quotaPotenzaAnnua=required[6]+required[7]+officialNumber(power[8],true)+officialNumber(power[9],true);
  const matches=(sum,expected,tolerance=0.000002)=>{
    const n=officialNumber(expected);
    return n!==null && Math.abs(sum-n)<=tolerance;
  };
  if (!matches(reteEnergia,energy[7]) ||
    !matches(oneriEnergia,energy[10]) ||
    !matches(quotaFissaAnnua,Number(fixed[7] || 0)+Number(fixed[10]||0),0.02) ||
    !matches(quotaPotenzaAnnua,Number(power[7]||0)+Number(power[10]||0),0.02) ||
    quotaEnergia<0.005 || quotaEnergia>0.2 ||
    quotaFissaAnnua>500 || quotaPotenzaAnnua>200) return null;
  return {
    quotaFissaAnnua:round6(quotaFissaAnnua),
    quotaPotenzaAnnua:round6(quotaPotenzaAnnua),
    quotaEnergia:round6(quotaEnergia),
  };
}

async function fetchDomesticOfficialNetwork() {
  const response=await fetch(DOMESTIC_SOURCE,{
    headers:{"User-Agent":"simulatore-bollette/1.0"},
    signal:AbortSignal.timeout(22000),
  });
  if(!response.ok)throw Error("ARERA domestici 2026 HTTP "+response.status);
  const workbook=XLSX.read(new Uint8Array(await response.arrayBuffer()),{type:"array"});
  const result=[];
  for(const sheetName of workbook.SheetNames){
    const parts=sheetName.trim().toLowerCase().split(/\s+/);
    const year=Number(parts[parts.length-1]);
    const month=MONTHS.findIndex((label)=>label.toLowerCase()===parts[0])+1;
    if(year!==2026||month<1)continue;
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{
      header:1,defval:"",raw:false,
    });
    const residential=parseDomesticNetworkSection(rows,10);
    const nonresidential=parseDomesticNetworkSection(rows,20);
    if(!residential||!nonresidential)continue;
    for(const tipo of DOMESTIC_TYPES){
      const data=tipo==="NON RESIDENTE"?nonresidential:residential;
      result.push({
        mese:MONTHS[month-1]+" "+year,
        anno:year,meseNumero:month,tipo,...data,
        status:"AGGIORNATO DA PROSPETTO ARERA",
        source:DOMESTIC_SOURCE,
      });
    }
  }
  if(result.length<9)throw Error("Prospetto ARERA privo dei dati domestici completi");
  return result;
}

const SOURCE_URLS = [
  "https://www.arera.it/area-operatori/prezzi-e-tariffe/distr",
  "https://www.arera.it/consumatori/valori-trasporto-oneri-generali-nondomestici-ee",
  "https://www.arera.it/area-operatori/prezzi-e-tariffe/tariffe-trasmissione-distribuzione-e-misura-clienti-domestici",
];

export default async function handler(req, res) {
  const force = String(req.query?.force || "") === "1";
  const checkedAt = new Date().toISOString();
  const warnings = [];

  const checks = await Promise.allSettled(
    SOURCE_URLS.map((url) =>
      fetch(url, {
        headers: { "User-Agent": "simulatore-bollette/1.0" },
        redirect: "follow",
      })
    )
  );

  checks.forEach((result, index) => {
    if (
      result.status === "rejected" ||
      !result.value?.ok
    ) {
      warnings.push(
        `Fonte ARERA non raggiungibile: ${SOURCE_URLS[index]}`
      );
    }
  });

  if (force) {
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=21600, stale-while-revalidate=86400"
    );
  }

  const baseRows=buildRows();
  let domesticRows=[];
  try {
    domesticRows=await fetchDomesticOfficialNetwork();
  } catch (error) {
    warnings.push("Rete domestica ARERA 2026: " + (error?.message||error));
  }
  const domesticMap=new Map(domesticRows.map((row)=>[row.mese+"|"+row.tipo,row]));
  const merged=baseRows.map((row)=>domesticMap.get(row.mese+"|"+row.tipo)||row);
  for(const item of domesticRows){
    if(!baseRows.some((row)=>row.mese===item.mese&&row.tipo===item.tipo))merged.push(item);
  }
  if(!domesticRows.length){
    warnings.push("Rete domestici: impossibile estrarre nuovi importi, conservati i valori storici.");
  }

  return res.status(200).json({
    checkedAt,
    rows: merged,
    sourceStatus: domesticRows.length
      ? "DOMESTICO_AGGIORNATO_AUTOMATICAMENTE_ALTRI_STORICI"
      : "RETE_DOMESTICI_NON_ESTRATTA",
    warnings: [...warnings, "Per BTA e MTA il prospetto numerico completo non viene ancora estratto automaticamente: conservate le tariffe di riferimento."],
    assumptions: {
      business: "ASOS classe 0 / non energivoro",
      years: "2025-2026",
    },
  });
}
