import React, { useMemo } from "react";

type MarketRow = { mese?: string; mono?: number | string; psv?: number | string };

const MONTHS = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const SOURCES = {
  pun: "https://gme.mercatoelettrico.org/it-it/Home/Pubblicazioni/Indici-GME/PUNIndexGme",
  gas: "https://gme.mercatoelettrico.org/it-it/Home/Pubblicazioni/Indici-GME/IGIndexGmeStatistiche",
  powerForward: "https://www.eex.com/en/markets/power/power-futures",
  gasForward: "https://www.ice.com/products/49321531/Italian-PSV-Natural-Gas-Futures/expiry"
};
const linkStyle: React.CSSProperties = {color:"#2563eb",fontWeight:700,textDecoration:"underline"};
const cellStyle: React.CSSProperties = {border:"1px solid #e2e8f0",borderRadius:12,padding:14,background:"#f8fafc",minWidth:0};
export default function PunPsvMonitoringPanel({rows}: {rows: MarketRow[]}) {
  const now = new Date();
  const currentLabel = MONTHS[now.getMonth()] + " " + now.getFullYear();
  const current = rows.find(r => String(r.mese || "").toUpperCase().trim() === currentLabel);
  const months = useMemo(() => Array.from({length:12},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()+i+1,1);
    return MONTHS[d.getMonth()]+" "+d.getFullYear();
  }),[now.getFullYear(),now.getMonth()]);
  const num=(v: unknown,digits:number) => {
    const n=typeof v==="number"?v:Number(String(v??"").replace(",","."));
    return Number.isFinite(n)&&n!==0?n.toLocaleString("it-IT",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—";
  };
  return <section aria-label="Monitoraggio e previsionale PUN-PSV" style={{border:"1px solid #dbeafe",borderRadius:16,padding:18,margin:"16px 0 24px",background:"#fff"}}>
    <h3 style={{margin:"0 0 8px",color:"#0f172a"}}>MONITORAGGIO E PREVISIONALE PUN-PSV</h3>
    <p style={{fontSize:13,color:"#475569",margin:"0 0 14px"}}>Riquadro informativo escluso dai PDF. Le quotazioni giornaliere e futures richiedono un feed dati autorizzato: nessun valore viene stimato o presentato come aggiornato in tempo reale.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
      <div style={cellStyle}><strong>PUN giornaliero</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>—</div><small>Non collegato · <a style={linkStyle} href={SOURCES.pun} target="_blank" rel="noopener noreferrer">GME</a></small></div>
      <div style={cellStyle}><strong>PSV giornaliero</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>—</div><small>Non collegato · <a style={linkStyle} href={SOURCES.gas} target="_blank" rel="noopener noreferrer">GME IG Index</a></small></div>
      <div style={cellStyle}><strong>PUN medio {currentLabel.toLowerCase()}</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>—</div><small>Media progressiva giornaliera non disponibile</small></div>
      <div style={cellStyle}><strong>PSV medio {currentLabel.toLowerCase()}</strong><div style={{fontSize:24,fontWeight:800,margin:"8px 0"}}>—</div><small>Media progressiva giornaliera non disponibile</small></div>
    </div>
    {current && <p style={{fontSize:12,color:"#64748b",margin:"12px 0 0"}}>Nell'archivio mensile esistente: PUN {num(current.mono,3)} €/kWh · PSV {num(current.psv,6)} €/Smc. Questi valori non sono presentati come media progressiva verificata.</p>}
    <h4 style={{margin:"20px 0 8px"}}>Previsionale 12 mesi</h4>
    <p style={{fontSize:13,color:"#475569",margin:"0 0 12px"}}>Prezzi futures mensili non disponibili tramite feed gratuito verificato. Consulta <a href={SOURCES.powerForward} style={linkStyle} target="_blank" rel="noopener noreferrer">EEX energia Italia</a> e <a href={SOURCES.gasForward} style={linkStyle} target="_blank" rel="noopener noreferrer">ICE PSV gas</a>. Nessuna interpolazione non dichiarata.</p>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}>
      <thead><tr><th style={{padding:8,borderBottom:"1px solid #cbd5e1"}}>Mese</th><th style={{padding:8,borderBottom:"1px solid #cbd5e1"}}>PUN previsto (€/kWh)</th><th style={{padding:8,borderBottom:"1px solid #cbd5e1"}}>PSV previsto (€/Smc)</th></tr></thead>
      <tbody>{months.map(m=><tr key={m}><td style={{padding:8,borderBottom:"1px solid #e2e8f0"}}>{m}</td><td style={{padding:8,borderBottom:"1px solid #e2e8f0"}}>Non disponibile</td><td style={{padding:8,borderBottom:"1px solid #e2e8f0"}}>Non disponibile</td></tr>)}</tbody>
    </table></div>
  </section>;
}
