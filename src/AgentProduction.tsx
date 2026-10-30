import Insoluti from "./Insoluti";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type Item = Record<string, any>;
type Data = { produzione: Item[]; recessi: Item[] };
const number = (value: unknown) => Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const date = (value: unknown) => { const v = String(value || ""); return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4) : v || "—"; };
const monthLabel = (value: unknown) => {
 const v=String(value||"");
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))return v||"—";
 return new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(new Date(Number(v.slice(0,4)),Number(v.slice(5,7))-1,1));
};
const label = (key: string) => key.replace(/_/g," ").toUpperCase();
const field = (row: Item, key: string) => row[key] == null || row[key] === "" ? "—" : typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key]);

export default function AgentProduction({ token }: { token: string }) {
 const [highlightedRowId,setHighlightedRowId]=useState<string|null>(null);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [tab,setTab]=useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("section")==="insoluti"?"INSOLUTI":"RECESSI"),[selectedRecessMonth,setSelectedRecessMonth]=useState(""),[search,setSearch]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[commodity,setCommodity]=useState("TUTTE");
 const [detailSort,setDetailSort]=useState("month"),[detailSortAsc,setDetailSortAsc]=useState(false);
 const [detail,setDetail]=useState<Item|null>(null),[detailMode,setDetailMode]=useState<"scheda"|"note">("scheda"),[note,setNote]=useState(""),[recovered,setRecovered]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const refresh=async()=>{setLoading(true);setError("");const {data:result,error:failure}=await supabase.rpc("agent_production_data",{p_session_token:token});if(failure)setError(failure.message);else setData(result as Data);setLoading(false);};
 useEffect(()=>{void refresh();},[token]);
 const isProduction=tab==="PRODUZIONE";
 const monthOf=(r:Item)=>String(isProduction?r.period_end||r.period_start||"":r.month_key||r.validita_date||"").slice(0,7);
 const matches=(r:Item,production:boolean)=>{
  const month=String(production?r.period_end||r.period_start||"":r.month_key||r.validita_date||"").slice(0,7);
  return (!from||month>=from)&&(!to||month<=to)&&(commodity==="TUTTE"||String(r.commodity||"").toUpperCase()===commodity)&&(!search||JSON.stringify(r).toLocaleLowerCase("it").includes(search.toLocaleLowerCase("it")));
 };
 const recessi=useMemo(()=>(data?.recessi||[]).filter(r=>matches(r,false)),[data,from,to,commodity,search]);
 const produzione=useMemo(()=>(data?.produzione||[]).filter(r=>matches(r,true)),[data,from,to,commodity,search]);
 const detailRecessi=useMemo(()=>{
 const filtered=selectedRecessMonth?recessi.filter(r=>String(r.month_key||r.validita_date||"").slice(0,7)===selectedRecessMonth):recessi;
 const value=(r:Item):string|number=>({month:String(r.month_key||r.validita_date||""),client:String(r.denominazione||""),pod:String(r.pod_pdr||""),commodity:String(r.commodity||""),consumption:Number(r.consumo||0),notes:String(r.note||""),detail:r.recuperato?1:0} as Record<string,string|number>)[detailSort]??"";
 return [...filtered].sort((a,b)=>{const x=value(a),y=value(b);const cmp=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"it",{numeric:true,sensitivity:"base"});return detailSortAsc?cmp:-cmp;});
 },[recessi,selectedRecessMonth,detailSort,detailSortAsc]);
 const open=(r:Item,mode:"scheda"|"note"="scheda")=>{setDetailMode(mode);setDetail(r);setNote(String(r.note||""));setRecovered(Boolean(r.recuperato));setMessage("");};
 const save=async()=>{if(!detail)return;setSaving(true);setMessage("");const {error:e}=await supabase.rpc("agent_recesso_save_note",{p_session_token:token,p_recesso_id:Number(detail.id),p_note:note,p_recuperato:recovered});if(e)setMessage("Errore: "+e.message);else{setMessage("Note salvate");setDetail({...detail,note,recuperato:recovered});await refresh();}setSaving(false);};
 const setRecoveredDirect=async(r:Item)=>{
  if(saving)return;
  setSaving(true);setError("");
  const next=!Boolean(r.recuperato);
  const {error:failure}=await supabase.rpc("agent_recesso_save_note",{
   p_session_token:token,p_recesso_id:Number(r.id),p_note:String(r.note||""),p_recuperato:next
  });
  if(failure)setError("Errore aggiornamento recesso: "+failure.message);
  else await refresh();
  setSaving(false);
 };
 const actionStyle:React.CSSProperties={border:0,borderRadius:9,padding:"9px 10px",fontSize:12,fontWeight:850,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 2px 5px #0f172a15"};
 const months=useMemo(()=>{
  const valid=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const sources=[...(data?.recessi||[]).map(r=>String(r.month_key||r.validita_date||"").slice(0,7)),...(data?.produzione||[]).map(r=>String(r.period_end||r.period_start||"").slice(0,7))].filter(valid);
  const first=from||sources.sort()[0]||new Date().toISOString().slice(0,7);
  const last=to||new Date().toISOString().slice(0,7);
  if(!valid(first)||!valid(last)||first>last)return [] as string[];
  const result:string[]=[];
  let year=Number(first.slice(0,4)),month=Number(first.slice(5,7));
  const max=Number(last.slice(0,4))*12+Number(last.slice(5,7));
  while(year*12+month<=max&&result.length<240){
   result.push(String(year)+"-"+String(month).padStart(2,"0"));
   month++;if(month>12){month=1;year++;}
  }
  return result.reverse();
 },[data,from,to]);
 const kinds=commodity==="TUTTE"?["LUCE","GAS"]:[commodity];
 const recessSummary=useMemo(()=>{
  const groups=new Map<string,{month:string,commodity:string,count:number,consumo:number,recovered:number}>();
  for(const month of months)for(const kind of kinds)groups.set(month+"|"+kind,{month,commodity:kind,count:0,consumo:0,recovered:0});
  for(const r of recessi){
   const month=String(r.month_key||r.validita_date||"").slice(0,7);
   const kind=String(r.commodity||"N/D").toUpperCase();
   const key=month+"|"+kind;
   const g=groups.get(key)||{month,commodity:kind,count:0,consumo:0,recovered:0};
   g.count++;g.consumo+=Number(r.consumo||0);if(r.recuperato)g.recovered++;groups.set(key,g);
  }
  return Array.from(groups.values()).sort((a,b)=>b.month.localeCompare(a.month)||a.commodity.localeCompare(b.commodity));
 },[recessi,months,commodity]);
 const productionSummary=useMemo(()=>{
  const groups=new Map<string,{month:string,commodity:string,count:number,consumo:number,activation:number}>();
  for(const month of months)for(const kind of kinds)groups.set(month+"|"+kind,{month,commodity:kind,count:0,consumo:0,activation:0});
  for(const r of produzione){
   const month=String(r.period_end||r.period_start||"").slice(0,7);
   const kind=String(r.commodity||"N/D").toUpperCase();
   const key=month+"|"+kind;
   const g=groups.get(key)||{month,commodity:kind,count:0,consumo:0,activation:0};
   g.count+=Number(r.in_attivazione_count||0);g.consumo+=Number(r.consumo_totale||0);g.activation+=Number(r.in_attivazione_consumo||0);groups.set(key,g);
  }
  return Array.from(groups.values()).sort((a,b)=>b.month.localeCompare(a.month)||a.commodity.localeCompare(b.commodity));
 },[produzione,months,commodity]);
 const recessTotals={count:recessi.length,luce:recessi.filter(r=>String(r.commodity).toUpperCase()==="LUCE").length,gas:recessi.filter(r=>String(r.commodity).toUpperCase()==="GAS").length,consumo:recessi.reduce((n,r)=>n+Number(r.consumo||0),0),recovered:recessi.filter(r=>r.recuperato).length};
 const totalProd=produzione.reduce((n,r)=>n+Number(r.in_attivazione_count||0),0);
 const totalRecessi=recessi.length;
 if(tab==="INSOLUTI")return <section style={{padding:14,background:"#f8fafc",borderRadius:18}}><button type="button" onClick={()=>setTab("RECESSI")} style={{padding:"10px 14px",borderRadius:10,border:"1px solid #cbd5e1",background:"white",cursor:"pointer",marginBottom:12}}>← PRODUZIONE / RECESSI</button><Insoluti token={token}/></section>;
 return <section className="agent-production" style={{padding:"clamp(12px,2vw,24px)",background:"#f8fafc",borderRadius:18,minWidth:0,border:"1px solid #e2e8f0"}}>
  <h2 style={{fontWeight:900,color:"#0f172a",letterSpacing:"-.03em",margin:"0 0 18px"}}>📊 DATI PRODUZIONE</h2>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {loading&&<p>Caricamento dati…</p>}
  {data&&<>
   <nav style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginBottom:16}}>{["RECESSI","PRODUZIONE","ATTIVO PRODUZIONE","DETTAGLIO RECESSI","INSOLUTI"].map(t=><button key={t} onClick={()=>{setTab(t);if(t==="DETTAGLIO RECESSI")setSelectedRecessMonth("");}} style={{width:"100%",minWidth:0,minHeight:48,padding:"10px 8px",fontSize:13,lineHeight:1.2,borderRadius:12,border:tab===t?"1px solid #f97316":"1px solid #cbd5e1",fontWeight:900,cursor:"pointer",background:tab===t?"#0f172a":"white",color:tab===t?"white":"#334155",boxShadow:tab===t?"0 5px 16px #0f172a24":"0 1px 3px #0f172a0d"}}>{t}</button>)}</nav>
   <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginBottom:18,padding:14,background:"white",border:"1px solid #e2e8f0",borderRadius:14,boxShadow:"0 2px 8px #0f172a0a"}}>
    <label style={{display:"grid",gap:5,minWidth:0,fontSize:12,fontWeight:800,color:"#475569"}}>Dal mese<input aria-label="Dal mese" type="month" value={from} onChange={e=>setFrom(e.target.value)} style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:10,borderRadius:9,border:"1px solid #cbd5e1",fontSize:14}}/></label>
    <label style={{display:"grid",gap:5,minWidth:0,fontSize:12,fontWeight:800,color:"#475569"}}>Al mese<input aria-label="Al mese" type="month" value={to} onChange={e=>setTo(e.target.value)} style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:10,borderRadius:9,border:"1px solid #cbd5e1",fontSize:14}}/></label>
    <div style={{gridColumn:"1 / -1",display:"flex",gap:8,flexWrap:"wrap"}}>{(["LUCE","GAS"] as const).map(kind=>{const active=commodity==="TUTTE"||commodity===kind;return <button key={kind} type="button" aria-pressed={active} onClick={()=>setCommodity(current=>current===kind?"TUTTE":kind)} style={{flex:"1 1 110px",minHeight:44,padding:"9px 12px",borderRadius:10,border:active?"2px solid "+(kind==="LUCE"?"#f59e0b":"#0284c7"):"1px solid #cbd5e1",background:active?(kind==="LUCE"?"#fef3c7":"#e0f2fe"):"white",color:kind==="GAS"?"#0284c7":"#92400e",fontSize:16,fontWeight:850,cursor:"pointer"}}>{kind==="LUCE"?"⚡":"🔥"} {kind}</button>})}</div>
    <label style={{display:"grid",gap:5,minWidth:0,fontSize:12,fontWeight:800,color:"#475569",gridColumn:"1 / -1"}}>Cerca<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, POD/PDR, note…" style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:11,borderRadius:9,border:"1px solid #cbd5e1",fontSize:14}}/></label>
    <button type="button" onClick={()=>{setFrom("");setTo("");setCommodity("TUTTE");setSearch("");}} style={{gridColumn:"1 / -1",padding:"11px 14px",borderRadius:10,border:"1px solid #cbd5e1",background:"#f1f5f9",fontWeight:850,cursor:"pointer"}}>↺ AZZERA FILTRI</button>
   </div>
   <p style={{fontWeight:700}}>Produzione: {totalProd} contratti in attivazione · Recessi: {totalRecessi}</p>
   {tab==="ATTIVO PRODUZIONE" ? <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:15}}><div>Contratti in attivazione: <strong>{totalProd}</strong></div><div>Recessi: <strong>{totalRecessi}</strong></div><div>Differenza: <strong>{totalProd-totalRecessi}</strong></div><div>Consumo produzione: <strong>{number(produzione.reduce((n,r)=>n+Number(r.consumo_totale||0),0))}</strong></div><div>Consumo recessi: <strong>{number(recessi.reduce((n,r)=>n+Number(r.consumo||0),0))}</strong></div></div> : null}
   {tab==="PRODUZIONE" || tab==="ATTIVO PRODUZIONE" ? <div style={{overflowX:"auto",background:"white",borderRadius:14,border:"1px solid #e2e8f0",boxShadow:"0 2px 10px #0f172a0a"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}><thead><tr>{["PERIODO","FORNITURA","CONTRATTI","CONSUMO TOTALE","IN ATTIVAZIONE CONSUMO"].map(h=><th key={h} style={{padding:"13px 12px",textAlign:"left",background:"#e2e8f0",fontSize:12,fontWeight:900,color:"#0f172a",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{productionSummary.map(r=><tr key={r.month+"|"+r.commodity} style={{borderBottom:"1px solid #e2e8f0",background:"white"}}><td style={{padding:10}}>{monthLabel(r.month)}</td><td>{r.commodity}</td><td>{number(r.count)}</td><td>{number(r.consumo)}</td><td>{number(r.activation)}</td></tr>)}</tbody></table></div> : null}
   {tab==="RECESSI"&&<div style={{marginTop:14}}>
    <h3>RIEPILOGO RECESSI · PERIODO SELEZIONATO</h3>
    <p style={{color:"#64748b"}}>{from?monthLabel(from):"Inizio archivio"} — {to?monthLabel(to):"Ultimo mese disponibile"} · Solo i recessi dell'agente collegato</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:16}}>
     {[["TOTALE RECESSI",recessTotals.count],["LUCE",recessTotals.luce],["GAS",recessTotals.gas],["RECUPERATI",recessTotals.recovered],["CONSUMO COMPLESSIVO",number(recessTotals.consumo)]].map(([name,value])=><div key={String(name)} style={{padding:18,background:"white",border:"1px solid #e2e8f0",borderLeft:"4px solid #f97316",borderRadius:14,boxShadow:"0 4px 14px #0f172a0a"}}><div style={{fontSize:12,fontWeight:800,color:"#475569"}}>{name}</div><div style={{fontSize:24,fontWeight:900}}>{value}</div></div>)}
    </div>
    <div style={{display:"grid",gap:10}}>
     {Array.from(recessSummary.reduce((map,g)=>{const entry=map.get(g.month)||{month:g.month,luce:{count:0,consumo:0},gas:{count:0,consumo:0}};const target=g.commodity==="LUCE"?entry.luce:g.commodity==="GAS"?entry.gas:null;if(target){target.count+=g.count;target.consumo+=g.consumo;}map.set(g.month,entry);return map;},new Map<string,{month:string;luce:{count:number;consumo:number};gas:{count:number;consumo:number}}>()).values()).sort((a,b)=>b.month.localeCompare(a.month)).map((g,i)=><div key={g.month} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9,padding:9,minHeight:94,borderRadius:15,background:i%2===0?"#f8fafc":"#eaf3ff",border:"1px solid #dbe4ee"}}>
      <strong style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",padding:"2px 10px",fontSize:17,color:"#0f172a"}}>{monthLabel(g.month)}</strong>
      {(["LUCE","GAS"] as const).map(kind=>{const item=kind==="LUCE"?g.luce:g.gas;const gas=kind==="GAS";return <div key={kind} style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,padding:10,borderRadius:12,background:gas?"#edf9ff":"#fff7ed",border:"1px solid "+(gas?"#bae6fd":"#fed7aa")}}>
       <div style={{display:"grid",gap:5}}><strong style={{color:gas?"#0369a1":"#c2410c"}}>{gas?"♨ GAS":"⚡ LUCE"}</strong><div style={{display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}><div style={{display:"grid",gap:2}}><span style={{fontSize:10,fontWeight:900,letterSpacing:".07em",color:"#64748b"}}>N° RECESSI</span><strong style={{fontSize:24,fontWeight:850,fontFamily:"Arial, sans-serif",letterSpacing:"-.035em"}}>{item.count}</strong></div><div style={{height:34,width:1,background:gas?"#7dd3fc":"#fdba74"}}/><div style={{display:"grid",gap:2}}><span style={{fontSize:10,fontWeight:900,letterSpacing:".07em",color:"#64748b"}}>CONSUMO TOTALE</span><strong style={{fontSize:20,fontWeight:850,fontFamily:"Arial, sans-serif",letterSpacing:"-.025em"}}>{number(item.consumo)} <span style={{fontSize:12,color:"#64748b"}}>{gas?"Smc":"kWh"}</span></strong></div></div></div>
       <button type="button" disabled={!item.count} onClick={()=>{setSelectedRecessMonth(g.month);setCommodity(kind);setTab("DETTAGLIO RECESSI");}} style={{padding:"10px 12px",borderRadius:9,border:"1px solid "+(gas?"#7dd3fc":"#fdba74"),background:item.count?"white":"#e2e8f0",color:gas?"#0369a1":"#9a3412",fontWeight:900,cursor:item.count?"pointer":"default"}}>VEDI CLIENTI ↗</button>
      </div>;})}
     </div>)}
    </div>
    {recessSummary.length===0&&<p>Nessun recesso nel periodo selezionato.</p>}
    <p style={{color:"#64748b",fontSize:13}}>Per aprire un singolo recesso, consultare la sottoscheda DETTAGLIO RECESSI.</p>
   </div>}
   {tab==="DETTAGLIO RECESSI"&&<div>
    {selectedRecessMonth&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:13,marginBottom:12,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12}}>
     <strong>📅 RECESSI DI {monthLabel(selectedRecessMonth).toUpperCase()} · {detailRecessi.length} risultati</strong>
     <button type="button" onClick={()=>setSelectedRecessMonth("")} style={{padding:"9px 13px",border:0,borderRadius:9,background:"#1d4ed8",color:"white",fontWeight:800,cursor:"pointer"}}>MOSTRA TUTTI I MESI</button>
    </div>}
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}><thead><tr>{([["MESE","month"],["CLIENTE","client"],["POD/PDR","pod"],["FORNITURA","commodity"],["CONSUMO","consumption"],["NOTE","notes"],["DETTAGLIO","detail"]] as const).map(([h,key])=><th key={key} style={{padding:10,textAlign:"left",background:"#e2e8f0"}}><button type="button" onClick={()=>{if(detailSort===key)setDetailSortAsc(v=>!v);else{setDetailSort(key);setDetailSortAsc(true);}}} style={{border:0,background:"transparent",cursor:"pointer",fontWeight:850,whiteSpace:"nowrap",color:"#0f172a"}}>{h} {detailSort===key?(detailSortAsc?"▲":"▼"):"↕"}</button></th>)}</tr></thead><tbody>{detailRecessi.map(r=><tr key={r.id} onClick={()=>setHighlightedRowId(current=>current===String(r.id)?null:String(r.id))} aria-selected={highlightedRowId===String(r.id)} title="Tocca per evidenziare tutta la riga" style={{borderBottom:"1px solid #e2e8f0",background:highlightedRowId===String(r.id)?"#fde68a":"white",outline:highlightedRowId===String(r.id)?"2px solid #d97706":"none",outlineOffset:-2,cursor:"pointer",transition:"background .15s"}}><td style={{padding:10}}>{monthLabel(r.month_key)||date(r.validita_date)}</td><td>{field(r,"denominazione")}</td><td>{field(r,"pod_pdr")}</td><td>{field(r,"commodity")}</td><td>{number(r.consumo)}</td><td>{r.note||"—"}</td><td style={{minWidth:310,whiteSpace:"nowrap"}}><div style={{display:"inline-flex",gap:5,alignItems:"center",flexWrap:"nowrap",whiteSpace:"nowrap"}}>
 <button type="button" onClick={()=>open(r)} style={{...actionStyle,background:"#2563eb",color:"white"}}>📋 APRI</button>
 <button type="button" onClick={()=>open(r,"note")} style={{...actionStyle,background:"#ffedd5",color:"#9a3412"}}>📝 NOTE</button>
 <button type="button" disabled={saving} onClick={()=>void setRecoveredDirect(r)}
  title={r.recuperato?"Segna come non recuperato":"Segna come recuperato"}
  style={{...actionStyle,background:r.recuperato?"#dcfce7":"#f1f5f9",color:r.recuperato?"#166534":"#334155",border:r.recuperato?"1px solid #86efac":"1px solid #cbd5e1",opacity:saving?.65:1}}>
  {r.recuperato?"✓ RECUPERATO":"○ RECUPERATO"}
 </button></div></td></tr>)}</tbody></table></div></div>}
   {detail&&<div role="presentation" onClick={()=>{if(!saving)setDetail(null);}}
     style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(15,23,42,.65)",display:"grid",placeItems:"center",padding:14}}>
     <div role="dialog" aria-modal="true" aria-label="Dettaglio recesso" onClick={e=>e.stopPropagation()}
      style={{width:"min(760px,100%)",maxHeight:"90vh",overflowY:"auto",background:"white",borderRadius:18,padding:22,boxSizing:"border-box",boxShadow:"0 20px 70px #0004"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
       <h3 style={{margin:0}}>{detailMode==="note"?"📝 NOTE RECESSO":"📋 SCHEDA RECESSO"}</h3>
       <button type="button" disabled={saving} onClick={()=>setDetail(null)}
        style={{border:0,borderRadius:9,padding:"9px 13px",background:"#e2e8f0",cursor:"pointer"}}>✕ CHIUDI</button>
      </div>
      <p style={{fontWeight:800,color:"#334155"}}>{detail.denominazione}</p>
      {detailMode==="scheda"?<>
       <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
        {Object.entries(detail.raw&&typeof detail.raw==="object"?detail.raw:{
         "DATA VALIDITÀ":date(detail.validita_date),"MESE RECESSO":detail.month_key,
         "AGENTE":detail.agente,"CLIENTE":detail.denominazione,"POD/PDR":detail.pod_pdr,
         "FORNITURA":detail.commodity,"CONSUMO":detail.consumo
        }).map(([key,value])=><div key={key} style={{overflowWrap:"anywhere",padding:9,background:"#f8fafc",borderRadius:9}}>
         <div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>{key}</div>
         <div>{String(value||"—")}</div>
        </div>)}
       </div>
       <div style={{marginTop:16,padding:12,background:"#f0f9ff",borderRadius:10}}>
        <strong>STORICO NOTE · DALLA PIÙ RECENTE</strong>
        {(detail.note_history||[]).map((h:Item,i:number)=><div key={i} style={{padding:"9px 0",borderBottom:"1px solid #cbd5e1"}}>
         <div style={{fontSize:12,color:"#64748b"}}>{h.created_at?new Date(h.created_at).toLocaleString("it-IT"):"—"}</div>
         <div style={{whiteSpace:"pre-wrap"}}>{h.note}</div>
        </div>)}
        {!(detail.note_history||[]).length&&<p style={{fontSize:13,color:"#64748b"}}>Nessuna nota nello storico.</p>}
       </div>
       <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
        <button type="button" onClick={()=>setDetailMode("note")}
         style={{border:0,borderRadius:10,padding:"12px 16px",background:"#ffedd5",color:"#9a3412",fontWeight:850,cursor:"pointer"}}>📝 NOTE</button>
       </div>
      </>:<div style={{display:"grid",gap:12}}>
       <textarea rows={6} value={note} onChange={e=>setNote(e.target.value)}
        placeholder="Scrivi qui le note relative al recesso..."
        style={{width:"100%",padding:12,borderRadius:10,border:"1px solid #cbd5e1",boxSizing:"border-box",font:"inherit"}}/>
       <label><input type="checkbox" checked={recovered} onChange={e=>setRecovered(e.target.checked)}/> RECESSO RECUPERATO</label>
       <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" onClick={()=>setDetailMode("scheda")} style={{padding:12,borderRadius:10,border:0}}>← SCHEDA RECESSO</button>
        <button type="button" disabled={saving} onClick={()=>void save()}
         style={{border:0,borderRadius:10,padding:12,background:"#16a34a",color:"white",fontWeight:850,cursor:"pointer"}}>{saving?"SALVATAGGIO…":"SALVA NOTE"}</button>
       </div>
       {message&&<p role="status">{message}</p>}
      </div>}
     </div>
    </div>}
  </>}
 </section>;
}
