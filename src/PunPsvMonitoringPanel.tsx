import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";

type MarketRow = { mese?: string; mono?: number | string; psv?: number | string };

const MONTHS = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const SOURCES = {
  pun: "https://gme.mercatoelettrico.org/it-it/Home/Pubblicazioni/Indici-GME/PUNIndexGme",
  gas: "https://gme.mercatoelettrico.org/it-it/Home/Pubblicazioni/Indici-GME/IGIndexGmeStatistiche",
  psvMonthly: "https://www.abbassalebollette.it/glossario/psv/",
  powerForward: "https://www.eex.com/en/markets/power/power-futures",
  gasForward: "https://www.ice.com/products/49321531/Italian-PSV-Natural-Gas-Futures/expiry"
};
const linkStyle: React.CSSProperties = {color:"#2563eb",fontWeight:700,textDecoration:"underline"};
type ForecastEntry = {pun?:string;psv?:string;source?:string;date?:string};
const modelForecast=(rows:MarketRow[],today=new Date()):Record<string,ForecastEntry>=>{
  const monthly=rows.map(r=>{
    const parts=String(r.mese||"").trim().toUpperCase().split(/\s+/);
    const index=MONTHS.indexOf(parts[0]);const year=Number(parts[1]);
    const numeric=(value:unknown)=>{const n=Number(String(value??"").replace(",","."));return Number.isFinite(n)&&n>0?n:null;};
    return {index,year,pun:numeric(r.mono),psv:numeric(r.psv)};
  }).filter(r=>r.index>=0&&r.year>=2020&&r.year<=today.getFullYear()&&
    (r.year<today.getFullYear()||(r.year===today.getFullYear()&&r.index<today.getMonth())))
    .sort((a,b)=>(b.year*12+b.index)-(a.year*12+a.index));
  const average=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const basePun=average(monthly.filter(r=>r.pun!==null).slice(0,6).map(r=>r.pun!));
  const basePsv=average(monthly.filter(r=>r.psv!==null).slice(0,6).map(r=>r.psv!));
  // Coefficienti stagionali indicativi e prudenziali: non sono curve futures.
  const punSeason=[1.11,1.06,1.01,.96,.94,.97,1.05,1.08,1.02,.98,1.03,1.10];
  const psvSeason=[1.13,1.11,1.05,.98,.94,.92,.94,.96,1.00,1.05,1.10,1.14];
  const result:Record<string,ForecastEntry>={};
  for(let i=1;i<=12;i++){
    const d=new Date(today.getFullYear(),today.getMonth()+i,1);
    const month=d.getMonth(),label=MONTHS[month]+" "+d.getFullYear();
    const estimate=(base:number|null,season:number[],precision:number)=>{
      if(base===null)return "";
      const mean=season.reduce((a,b)=>a+b,0)/season.length;
      return (base*season[month]/mean).toFixed(precision).replace(".",",");
    };
    result[label]={pun:estimate(basePun,punSeason,3),psv:estimate(basePsv,psvSeason,3),
      source:"Stima indicativa - modello stagionale",date:""};
  }
  return result;
};
const cellStyle: React.CSSProperties = {border:"1px solid #e2e8f0",borderRadius:12,padding:14,background:"#f8fafc",minWidth:0};
export default function PunPsvMonitoringPanel({rows}: {rows: MarketRow[]}) {
  const [live, setLive] = useState<{PUN?: {date?: string;value?:number;value_native?:number;unit?:string;unit_native?:string}; PSV?: {date?:string;value?:number;value_native?:number;unit?:string;unit_native?:string}}>({});
  const [status, setStatus] = useState("Caricamento dati...");
  const [updated, setUpdated] = useState("");
  const [lastCheck,setLastCheck]=useState("");
  const [forwardRows, setForwardRows] = useState<Record<string,{pun?:string;psv?:string;source?:string;date?:string}>>({});
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [horizon,setHorizon]=useState<12|24>(12);
  const [pcs,setPcs]=useState("10,7");
  const regenerateEstimates=()=>{const estimates=modelForecast(rows);setForwardRows(previous=>{const next={...previous,...estimates};try{window.localStorage.setItem("pun-psv-forward-manual-v1",JSON.stringify(next));}catch{}return next;});setImportMessage("Stime indicative rigenerate per i prossimi 12 mesi.");};
  useEffect(() => {
    const estimates=modelForecast(rows);
    try {
      const stored=window.localStorage.getItem("pun-psv-forward-manual-v1");
      const saved:Record<string,ForecastEntry>=stored?JSON.parse(stored):{};
      const merged={...estimates,...saved};
      // Riempi soltanto celle vuote; non sovrascrivere valori già inseriti.
      for(const [month,estimate] of Object.entries(estimates)){
        const existing=saved[month];
        if(existing) merged[month]={
          ...estimate,...existing,
          pun:existing.pun?.trim()?existing.pun:estimate.pun,
          psv:existing.psv?.trim()?existing.psv:estimate.psv,
          source:existing.source?.trim()?existing.source:estimate.source
        };
      }
      setForwardRows(merged);
      window.localStorage.setItem("pun-psv-forward-manual-v1",JSON.stringify(merged));
    } catch {setForwardRows(estimates);}
  }, [rows]);
  const updateForward=(month:string, field:"pun"|"psv"|"source"|"date", value:string) => {
    setForwardRows(previous => {
      const next={...previous,[month]:{...previous[month],[field]:value}};
      try {window.localStorage.setItem("pun-psv-forward-manual-v1",JSON.stringify(next));} catch { /* storage unavailable */ }
      return next;
    });
  };
  const importCsv=()=>{
    const parsed:Record<string,{pun?:string;psv?:string;source?:string;date?:string}>={};
    const lines=importText.trim().split(/\r?\n/);
    for (const line of lines) {
      const columns=line.split(";").map(x=>x.trim());
      if (columns.length<3 || !/^\d{4}-\d{2}$/.test(columns[0])) continue;
      const [year,month]=columns[0].split("-").map(Number);
      if (month<1||month>12) continue;
      const key=MONTHS[month-1]+" "+year;
      const valid=(v:string)=>!v || (/^\d+(?:[.,]\d+)?$/.test(v)&&Number(v.replace(",","."))>0);
      if (!valid(columns[1])||!valid(columns[2])) continue;
      parsed[key]={pun:columns[1],psv:columns[2],source:columns[3]||"Importazione manuale",date:columns[4]||""};
    }
    if (!Object.keys(parsed).length) {setImportMessage("Nessuna riga valida. Formato: AAAA-MM;PUN €/kWh;PSV €/Smc;fonte;data");return;}
    setForwardRows(previous=>{
      const next={...previous,...parsed};
      try {window.localStorage.setItem("pun-psv-forward-manual-v1",JSON.stringify(next));} catch { /* storage unavailable */ }
      return next;
    });
    setImportMessage(Object.keys(parsed).length+" mesi importati su questo dispositivo.");
  };
  const [monthly, setMonthly] = useState<{pun?:number;psv?:number;punDays?:number;psvDays?:number}>({});
  const [monthlyStatus, setMonthlyStatus] = useState("Verifica disponibilità serie giornaliere...");
  const [punProvisional, setPunProvisional] = useState<{value:number;date:string}|null>(null);
  const [psvPublished,setPsvPublished]=useState<{value:number;asOf:string|null;status:string}|null>(null);
  const [psvPublishedError,setPsvPublishedError]=useState("");
  const getMonthAverage = async (asset:"pun"|"psv") => {
    const date = new Date();
    const from = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-01";
    const to = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    const url = "https://energyindex.it/api/v1/prices/"+asset+"/series?from="+from+"&to="+to+"&unit=mwh";
    const response = await fetch(url, {cache:"no-store"});
    if (!response.ok) throw new Error("Serie "+asset.toUpperCase()+" non attiva (HTTP "+response.status+")");
    const data = await response.json();
    if (!Array.isArray(data.points)) throw new Error("Serie "+asset.toUpperCase()+" non disponibile");
    const points = data.points.filter((p:{date?:string;value?:number}) => typeof p.date==="string" && p.date>=from && p.date<=to && typeof p.value==="number" && Number.isFinite(p.value));
    if (!points.length) throw new Error("Nessun giorno valido per "+asset.toUpperCase());
    return {average:points.reduce((sum:number,p:{value:number})=>sum+p.value,0)/points.length,days:points.length};
  };
  const refreshPunProvisional = async () => {
    try {
      const response = await fetch("/api/pun-month-current", {cache:"no-store"});
      if (!response.ok) throw new Error("HTTP "+response.status);
      const data = await response.json();
      if (typeof data.value !== "number" || !Number.isFinite(data.value)) throw new Error("Valore non valido");
      setPunProvisional({value:data.value,date:data.asOf || ""});
    } catch { setPunProvisional(null); }
  };
  const refreshPsvPublished=async()=>{
    try{
      const response=await fetch("/api/psv-month-current",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok||typeof data.value!=="number"||!Number.isFinite(data.value))throw new Error(data.error||"Dato non disponibile");
      setPsvPublished({value:data.value,asOf:data.asOf||null,status:data.status||"provvisorio"});
      setPsvPublishedError("");
    }catch(error){
      setPsvPublished(null);
      setPsvPublishedError(error instanceof Error?error.message:"Fonte non disponibile");
    }
  };
  const refreshMonthly = async () => {
    const results = await Promise.allSettled([getMonthAverage("pun"),getMonthAverage("psv")]);
    const next: {pun?:number;psv?:number;punDays?:number;psvDays?:number} = {};
    if (results[0].status==="fulfilled") {next.pun=results[0].value.average/1000;next.punDays=results[0].value.days;}
    if (results[1].status==="fulfilled") {next.psv=results[1].value.average*10.7/1000;next.psvDays=results[1].value.days;}
    setMonthly(next);
    setMonthlyStatus(results.every(x=>x.status==="fulfilled") ? "Medie calcolate sui giorni pubblicati" : "Serie giornaliere non ancora disponibili dal fornitore: medie non calcolabili");
  };
  const refresh = async () => {
    try {
      setStatus("Aggiornamento...");
      const response = await fetch("https://energyindex.it/api/v1/today", {cache:"no-store"});
      if (!response.ok) throw new Error("HTTP " + response.status);
      const json = await response.json();
      const values = json?.values || {};
      if (!values.PUN && !values.PSV) throw new Error("Nessun dato disponibile");
      setLive(values);
      setUpdated(new Date().toLocaleString("it-IT"));
      setStatus("Controllo completato. Le date dei prezzi sono quelle effettivamente pubblicate dal fornitore.");
    } catch (error) {
      setStatus("Dati non raggiungibili: " + (error instanceof Error ? error.message : "errore di rete"));
    }
  };
  useEffect(() => {
    let lastHour="";
    const check=()=>{
      const now=new Date();
      const rome=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",year:"numeric",month:"2-digit",day:"2-digit",hourCycle:"h23"}).formatToParts(now);
      const field=(type:string)=>rome.find(p=>p.type===type)?.value||"";
      const hour=Number(field("hour"));
      const key=field("year")+"-"+field("month")+"-"+field("day")+"-"+field("hour");
      if(hour<8||hour>20||lastHour===key)return;
      lastHour=key;
      setLastCheck(now.toLocaleString("it-IT"));
      void refresh();void refreshMonthly();void refreshPunProvisional();void refreshPsvPublished();
    };
    check();
    const interval=window.setInterval(check,60*1000);
    const onFocus=()=>check();
    window.addEventListener("focus",onFocus);
    return ()=>{window.clearInterval(interval);window.removeEventListener("focus",onFocus);};
  }, []);
  const now = new Date();
  const currentLabel = MONTHS[now.getMonth()] + " " + now.getFullYear();
  const current = rows.find(r => String(r.mese || "").toUpperCase().trim() === currentLabel);
  const months = useMemo(() => Array.from({length:24},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()+i+1,1);
    return MONTHS[d.getMonth()]+" "+d.getFullYear();
  }),[now.getFullYear(),now.getMonth()]);
  const parsePositive=(raw?:string)=>{const n=Number(String(raw||"").trim().replace(",","."));return Number.isFinite(n)&&n>0?n:null;};
  const pcsValue=parsePositive(pcs)||10.7;
  const visibleMonths=months.slice(0,horizon);
  const csvMonth=(label:string)=>{const [month,year]=label.split(" ");return `${year}-${String(MONTHS.indexOf(month)+1).padStart(2,"0")}`;};
  const formatMonthDate=(value?:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value||"")?`${value!.slice(8,10)}/${value!.slice(5,7)}/${value!.slice(0,4)}`:"—";
  const exportCsv=()=>{const lines=["Mese;PUN EUR/kWh;PSV EUR/Smc;Fonte/metodo;Data quotazione",...visibleMonths.map(m=>{const row=forwardRows[m]||{};return [csvMonth(m),row.pun||"",row.psv||"",(row.source||"").replace(/[;\r\n]/g," "),row.date||""].join(";")})];const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Previsionale-PUN-PSV-"+horizon+"-mesi.csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
  const exportPdf=()=>{const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});const orange="#e97717",blue="#0284c7";pdf.setFont("helvetica","bold");pdf.setFontSize(17);pdf.setTextColor("#10234b");pdf.text("PREVISIONALE PUN - PSV | "+horizon+" MESI",13,16);pdf.setFontSize(9);pdf.setFont("helvetica","normal");pdf.text("Valori indicativi da modello stagionale o inseriti manualmente - NON quotazioni futures",13,23);pdf.text("Generato: "+new Date().toLocaleDateString("it-IT")+" | PCS gas: "+pcsValue+" kWh/Smc",13,29);const render=(start:number,subset:string[])=>{pdf.setFillColor(235,241,249);pdf.rect(12,start-5,273,8,"F");pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.setTextColor("#10234b");pdf.text("MESE",15,start);pdf.text("PUN EUR/kWh",63,start);pdf.text("PSV EUR/Smc",108,start);pdf.text("FONTE / METODO",151,start);pdf.text("DATA",255,start);pdf.setFont("helvetica","normal");subset.forEach((m,i)=>{const y=start+8+i*9;const row=forwardRows[m]||{};if(i%2===0){pdf.setFillColor(249,251,253);pdf.rect(12,y-5,273,9,"F");}pdf.setTextColor("#10234b");pdf.text(m,15,y);pdf.setTextColor(orange);pdf.text(parsePositive(row.pun)?.toFixed(5)||"—",63,y);pdf.setTextColor(blue);pdf.text(parsePositive(row.psv)?.toFixed(6)||"—",108,y);pdf.setTextColor("#334155");pdf.text((row.source||"Non disponibile").slice(0,55),151,y);pdf.text(formatMonthDate(row.date),255,y);});};render(39,visibleMonths.slice(0,16));if(visibleMonths.length>16){pdf.addPage();render(18,visibleMonths.slice(16));}const name="Previsionale-PUN-PSV-"+horizon+"-mesi.pdf";const native=(window as any).AndroidFiles;try{if(native&&typeof native.savePdf==="function"){const data=pdf.output("datauristring");native.savePdf(data.slice(data.indexOf(",")+1),name);return;}const file=new File([pdf.output("blob")],name,{type:"application/pdf"});if(/Android/i.test(navigator.userAgent)&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){void navigator.share({files:[file],title:name}).catch(()=>pdf.save(name));return;}pdf.save(name);}catch(error){console.error("Esportazione PDF",error);pdf.save(name);}};
  // Indicative conversion using a declared reference PCS of 10.7 kWh/Smc.
  // Do not treat the converted value as an officially published PSV in EUR/Smc.
  const psvDailySmc = live.PSV && Number.isFinite(live.PSV.value_native) && live.PSV.value_native! > 0
    ? live.PSV.value_native! * pcsValue / 1000
    : undefined;
  const num=(v: unknown,digits:number) => {
    const n=typeof v==="number"?v:Number(String(v??"").replace(",","."));
    return Number.isFinite(n)&&n!==0?n.toLocaleString("it-IT",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—";
  };
  return <section aria-label="Monitoraggio e previsionale PUN-PSV" style={{border:"1px solid #dbeafe",borderRadius:16,padding:18,margin:"16px 0 24px",background:"#fff"}}>
    <h3 style={{margin:"0 0 8px",color:"#0f172a"}}>MONITORAGGIO E PREVISIONALE PUN-PSV</h3>
    <p style={{fontSize:13,color:"#475569",margin:"0 0 14px"}}>Ultimi dati giornalieri tramite API pubblica Energy Index (fonte dichiarata GME). Controllo automatico ogni ora dalle 08:00 alle 20:00 (ora italiana), mentre la pagina è aperta. Le medie mensili vengono calcolate solo se il fornitore rende disponibile la serie giornaliera; le stime a 12 mesi sono elaborate da uno scenario stagionale indicativo sui dati storici disponibili, non da quotazioni futures.</p>
    <p style={{fontSize:12,color:"#475569"}}>{status} {lastCheck && "· Ultimo controllo: "+lastCheck} {updated && "· Risposta ricevuta: "+updated} · <button type="button" onClick={() => { void refresh(); void refreshMonthly(); void refreshPunProvisional(); }} style={{cursor:"pointer",color:"#2563eb",border:"none",background:"transparent",fontWeight:700}}>Aggiorna ora</button> · <a href="https://energyindex.it/it/api" target="_blank" rel="noopener noreferrer" style={linkStyle}>Energy Index</a></p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
      <div style={cellStyle}><strong>PUN giornaliero</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>{live.PUN && Number.isFinite(live.PUN.value) ? num(live.PUN.value,5)+" €/kWh" : "—"}</div><small>{live.PUN?.date ? "Data "+live.PUN.date+" · " : "Non disponibile · "}<a style={linkStyle} href={SOURCES.pun} target="_blank" rel="noopener noreferrer">GME</a></small></div>
      <div style={cellStyle}><strong>PSV giornaliero</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>{psvDailySmc !== undefined ? num(psvDailySmc,6)+" €/Smc" : "—"}</div><small>{live.PSV?.date ? "Data "+live.PSV.date+" · " : "Non disponibile · "}<a style={linkStyle} href={SOURCES.gas} target="_blank" rel="noopener noreferrer">GME IG Index</a> · {psvDailySmc === undefined ? "Prezzo non disponibile" : "Convertito da €/MWh con PCS indicativo "+pcsValue+" kWh/Smc"}</small></div>
      <div style={cellStyle}><strong>PUN medio {currentLabel.toLowerCase()}</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>{punProvisional ? num(punProvisional.value,5)+" €/kWh" : monthly.pun !== undefined ? num(monthly.pun,5)+" €/kWh" : "—"}</div><small>{punProvisional ? "Provvisorio "+punProvisional.date+" · AbbassaLeBollette.it" : monthly.punDays ? monthly.punDays+" giorni pubblicati" : monthlyStatus}</small></div>
      <div style={cellStyle}><strong>PSV medio {currentLabel.toLowerCase()}</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>{psvPublished ? num(psvPublished.value,6)+" €/Smc" : monthly.psv !== undefined ? num(monthly.psv*pcsValue/10.7,6)+" €/Smc" : "—"}</div><small>{psvPublished ? "Fonte Abbassalebollette · "+psvPublished.status+" · Aggiornato al "+(psvPublished.asOf||"data non dichiarata")+" · " : monthly.psvDays ? "Media indicativa di "+monthly.psvDays+" giorni disponibili, PCS "+pcsValue+" kWh/Smc · " : (psvPublishedError||monthlyStatus)+" · "}<a href={SOURCES.psvMonthly} style={linkStyle} target="_blank" rel="noopener noreferrer">Fonte PSV</a></small></div>
    </div>
    {current && <p style={{fontSize:12,color:"#64748b",margin:"12px 0 0"}}>Nell'archivio mensile esistente: PUN {num(current.mono,3)} €/kWh · PSV {num(current.psv,6)} €/Smc. Questi valori non sono presentati come media progressiva verificata.</p>}
    <h4 style={{margin:"20px 0 8px"}}>Previsionale futures: 12 o 24 mesi</h4>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:12}}><label style={{fontWeight:700}}>Orizzonte <select value={horizon} onChange={e=>setHorizon(Number(e.target.value) as 12|24)} style={{padding:8,borderRadius:8,marginLeft:8}}><option value={12}>12 mesi</option><option value={24}>24 mesi</option></select></label><label style={{fontWeight:700}}>PCS gas kWh/Smc <input value={pcs} onChange={e=>setPcs(e.target.value)} inputMode="decimal" style={{width:75,padding:8,marginLeft:8,border:"1px solid #cbd5e1",borderRadius:8}} /></label><button type="button" onClick={exportPdf} style={{padding:"10px 14px",background:"#0f172a",color:"white",border:0,borderRadius:8,fontWeight:700}}>ESPORTA PDF</button><button type="button" onClick={exportCsv} style={{padding:"10px 14px",background:"#e2e8f0",color:"#0f172a",border:0,borderRadius:8,fontWeight:700}}>ESPORTA CSV</button></div>
    <p style={{fontSize:13,color:"#92400e",background:"#fffbeb",padding:10,borderRadius:8}}>I primi 12 mesi sono compilati automaticamente con stime indicative ricavate dalla media degli ultimi sei mesi storici disponibili e da coefficienti stagionali semplificati. Non sono futures né previsioni certificate; puoi correggerli. Se manca lo storico, i valori restano vuoti.</p>
    <button type="button" onClick={regenerateEstimates} style={{padding:"9px 12px",background:"#fff7ed",border:"1px solid #fdba74",borderRadius:8,fontWeight:700,cursor:"pointer",marginBottom:12}}>RICALCOLA STIME 12 MESI</button>
    <p style={{fontSize:13,color:"#475569"}}>Inserisci quotazioni da una fonte di cui disponi dei diritti di utilizzo. Valori manuali, non aggiornati automaticamente. Per prodotti trimestrali o annuali, indicare nella fonte che si tratta di una ripartizione, non di una quotazione mensile. Dati salvati soltanto nel browser corrente.</p>
    <p style={{fontSize:12}}><a href={SOURCES.powerForward} target="_blank" rel="noopener noreferrer" style={linkStyle}>EEX energia</a> · <a href={SOURCES.gasForward} target="_blank" rel="noopener noreferrer" style={linkStyle}>ICE PSV</a> · <a href="https://gme.mercatoelettrico.org/Home/InterfacciaAPI" target="_blank" rel="noopener noreferrer" style={linkStyle}>Condizioni API GME</a></p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14,margin:"14px 0"}}>{(["pun","psv"] as const).map(asset=>{const points=visibleMonths.map((m,i)=>({m,i,v:parsePositive(forwardRows[m]?.[asset])})).filter((p):p is {m:string;i:number;v:number}=>p.v!==null);const max=Math.max(...points.map(p=>p.v),0.01);const min=Math.min(...points.map(p=>p.v),max);const coords=points.map(p=>`${20+(p.i/Math.max(1,visibleMonths.length-1))*520},${180-((p.v-min)/Math.max(max-min,0.00001))*150}`).join(" ");return <div key={asset} style={{border:"1px solid #e2e8f0",borderRadius:12,padding:12}}><strong style={{color:asset==="pun"?"#c2410c":"#0369a1"}}>CURVA {asset.toUpperCase()} - {points.length}/{horizon} mesi valorizzati</strong><svg viewBox="0 0 560 210" style={{width:"100%",height:190,display:"block"}} role="img" aria-label={"Curva "+asset.toUpperCase()}><line x1="20" x2="540" y1="180" y2="180" stroke="#94a3b8"/><line x1="20" x2="20" y1="20" y2="180" stroke="#94a3b8"/>{points.length>1&&<polyline points={coords} fill="none" stroke={asset==="pun"?"#ea580c":"#0284c7"} strokeWidth="3" strokeDasharray="7 5"/>}{points.map(p=><circle key={p.m} cx={20+(p.i/Math.max(1,visibleMonths.length-1))*520} cy={180-((p.v-min)/Math.max(max-min,0.00001))*150} r="4" fill={asset==="pun"?"#ea580c":"#0284c7"}/>)}<text x="20" y="202" fontSize="12" fill="#475569">{visibleMonths[0]}</text><text x="540" y="202" fontSize="12" textAnchor="end" fill="#475569">{visibleMonths[visibleMonths.length-1]}</text></svg><small style={{color:"#64748b"}}>{points.length?"Linea tratteggiata: prezzi inseriti, non interpolazioni certificate.":"Nessun prezzo inserito: grafico vuoto."} · {asset==="pun"?"€/kWh":"€/Smc"}</small></div>})}</div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}>
      <thead><tr>{["Mese","PUN previsto €/kWh","PSV previsto €/Smc","Fonte / metodo","Data quotazione"].map(label=><th key={label} style={{padding:8,borderBottom:"1px solid #cbd5e1"}}>{label}</th>)}</tr></thead>
      <tbody>{visibleMonths.map(m=><tr key={m}>
        <td style={{padding:8,borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>{m}</td>
        {(["pun","psv","source","date"] as const).map(field=><td key={field} style={{padding:5,borderBottom:"1px solid #e2e8f0"}}>
          <input aria-label={field+" "+m} type={field==="date"?"date":"text"} inputMode={field==="pun"||field==="psv"?"decimal":undefined} placeholder={field==="source"?"Fonte e tipo contratto":"—"} value={forwardRows[m]?.[field]||""} onChange={e=>updateForward(m,field,e.target.value)} style={{width:field==="source"?190:field==="date"?140:120,maxWidth:"100%",padding:8,border:"1px solid #cbd5e1",borderRadius:7}} />
        </td>)}
      </tr>)}</tbody>
    </table></div>
    <div style={{marginTop:16}}>
      <strong>Importa valori autorizzati da CSV</strong>
      <p style={{fontSize:12,color:"#64748b"}}>Una riga per mese: AAAA-MM;PUN €/kWh;PSV €/Smc;fonte;AAAA-MM-GG. Separatore punto e virgola, virgola o punto per i decimali.</p>
      <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={3} placeholder="2026-11;0,115;0,45;Futures mensile - fonte autorizzata;2026-10-15" style={{width:"100%",maxWidth:700,border:"1px solid #cbd5e1",borderRadius:8,padding:10}} />
      <div><button type="button" onClick={importCsv} style={{background:"#0f172a",color:"white",border:0,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontWeight:700}}>IMPORTA CSV</button> <small>{importMessage}</small></div>
    </div>
  </section>;
}
