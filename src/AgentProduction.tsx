import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type Item = Record<string, any>;
type Data = { produzione: Item[]; recessi: Item[] };
const number = (value: unknown) => Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const date = (value: unknown) => { const v = String(value || ""); return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4) : v || "—"; };
const label = (key: string) => key.replace(/_/g," ").toUpperCase();
const field = (row: Item, key: string) => row[key] == null || row[key] === "" ? "—" : typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key]);

export default function AgentProduction({ token }: { token: string }) {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [tab,setTab]=useState("RECESSI"),[search,setSearch]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[commodity,setCommodity]=useState("TUTTE");
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
 const open=(r:Item)=>{setDetailMode("scheda");setDetail(r);setNote(String(r.note||""));setRecovered(Boolean(r.recuperato));setMessage("");};
 const save=async()=>{if(!detail)return;setSaving(true);setMessage("");const {error:e}=await supabase.rpc("agent_recesso_save_note",{p_session_token:token,p_recesso_id:Number(detail.id),p_note:note,p_recuperato:recovered});if(e)setMessage("Errore: "+e.message);else{setMessage("Note salvate");setDetail({...detail,note,recuperato:recovered});await refresh();}setSaving(false);};
 const recessSummary=useMemo(()=>{
  const groups=new Map<string,{month:string,commodity:string,count:number,consumo:number,recovered:number}>();
  for(const r of recessi){
   const month=String(r.month_key||r.validita_date||"SENZA MESE").slice(0,7);
   const kind=String(r.commodity||"N/D").toUpperCase();
   const key=month+"|"+kind;
   const g=groups.get(key)||{month,commodity:kind,count:0,consumo:0,recovered:0};
   g.count++;g.consumo+=Number(r.consumo||0);if(r.recuperato)g.recovered++;groups.set(key,g);
  }
  return Array.from(groups.values()).sort((a,b)=>b.month.localeCompare(a.month)||a.commodity.localeCompare(b.commodity));
 },[recessi]);
 const recessTotals={count:recessi.length,luce:recessi.filter(r=>String(r.commodity).toUpperCase()==="LUCE").length,gas:recessi.filter(r=>String(r.commodity).toUpperCase()==="GAS").length,consumo:recessi.reduce((n,r)=>n+Number(r.consumo||0),0),recovered:recessi.filter(r=>r.recuperato).length};
 const totalProd=produzione.reduce((n,r)=>n+Number(r.in_attivazione_count||0),0);
 const totalRecessi=recessi.length;
 return <section style={{padding:16,background:"white",borderRadius:14,minWidth:0}}>
  <h2>📊 DATI PRODUZIONE</h2>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {loading&&<p>Caricamento dati…</p>}
  {data&&<>
   <nav style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>{["RECESSI","PRODUZIONE","ATTIVO PRODUZIONE","DETTAGLIO RECESSI"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"10px 14px",borderRadius:9,border:0,fontWeight:800,cursor:"pointer",background:tab===t?"#0f172a":"#e2e8f0",color:tab===t?"white":"#0f172a"}}>{t}</button>)}</nav>
   <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"end",marginBottom:16}}>
    <label>Dal mese<input aria-label="Dal mese" type="month" value={from} onChange={e=>setFrom(e.target.value)} style={{display:"block",padding:9}}/></label>
    <label>Al mese<input aria-label="Al mese" type="month" value={to} onChange={e=>setTo(e.target.value)} style={{display:"block",padding:9}}/></label>
    <label>Fornitura<select value={commodity} onChange={e=>setCommodity(e.target.value)} style={{display:"block",padding:10}}><option>TUTTE</option><option>LUCE</option><option>GAS</option></select></label>
    <label>Cerca<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, POD/PDR, note…" style={{display:"block",padding:10}}/></label>
    <button onClick={()=>{setFrom("");setTo("");setCommodity("TUTTE");setSearch("");}} style={{padding:10}}>AZZERA FILTRI</button>
   </div>
   <p style={{fontWeight:700}}>Produzione: {totalProd} contratti in attivazione · Recessi: {totalRecessi}</p>
   {tab==="ATTIVO PRODUZIONE" ? <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:15}}><div>Contratti in attivazione: <strong>{totalProd}</strong></div><div>Recessi: <strong>{totalRecessi}</strong></div><div>Differenza: <strong>{totalProd-totalRecessi}</strong></div><div>Consumo produzione: <strong>{number(produzione.reduce((n,r)=>n+Number(r.consumo_totale||0),0))}</strong></div><div>Consumo recessi: <strong>{number(recessi.reduce((n,r)=>n+Number(r.consumo||0),0))}</strong></div></div> : null}
   {tab==="PRODUZIONE" || tab==="ATTIVO PRODUZIONE" ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}><thead><tr>{["PERIODO","FORNITURA","CONTRATTI","CONSUMO TOTALE","IN ATTIVAZIONE CONSUMO"].map(h=><th key={h} style={{padding:10,textAlign:"left",background:"#e2e8f0"}}>{h}</th>)}</tr></thead><tbody>{produzione.map(r=><tr key={r.id} style={{borderBottom:"1px solid #e2e8f0"}}><td style={{padding:10}}>{r.period_label||date(r.period_start)}</td><td>{field(r,"commodity")}</td><td>{number(r.in_attivazione_count)}</td><td>{number(r.consumo_totale)}</td><td>{number(r.in_attivazione_consumo)}</td></tr>)}</tbody></table></div> : null}
   {tab==="RECESSI"&&<div style={{marginTop:14}}>
    <h3>RIEPILOGO RECESSI · PERIODO SELEZIONATO</h3>
    <p style={{color:"#64748b"}}>{from||"Inizio archivio"} — {to||"Ultimo mese disponibile"} · Solo i recessi dell'agente collegato</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:16}}>
     {[["TOTALE RECESSI",recessTotals.count],["LUCE",recessTotals.luce],["GAS",recessTotals.gas],["RECUPERATI",recessTotals.recovered],["CONSUMO COMPLESSIVO",number(recessTotals.consumo)]].map(([name,value])=><div key={String(name)} style={{padding:14,background:"#f1f5f9",borderRadius:12}}><div style={{fontSize:12,fontWeight:800,color:"#475569"}}>{name}</div><div style={{fontSize:24,fontWeight:900}}>{value}</div></div>)}
    </div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:520,borderCollapse:"collapse"}}><thead><tr>{["MESE","FORNITURA","NUM. RECESSI","CONSUMO","RECUPERATI"].map(h=><th key={h} style={{padding:10,textAlign:"left",background:"#e2e8f0"}}>{h}</th>)}</tr></thead><tbody>{recessSummary.map(g=><tr key={g.month+g.commodity} style={{borderBottom:"1px solid #e2e8f0"}}><td style={{padding:10}}>{g.month}</td><td>{g.commodity}</td><td>{g.count}</td><td>{number(g.consumo)}</td><td>{g.recovered}</td></tr>)}</tbody></table></div>
    {recessSummary.length===0&&<p>Nessun recesso nel periodo selezionato.</p>}
    <p style={{color:"#64748b",fontSize:13}}>Per aprire un singolo recesso, consultare la sottoscheda DETTAGLIO RECESSI.</p>
   </div>}
   {tab==="DETTAGLIO RECESSI"&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}><thead><tr>{["MESE","CLIENTE","POD/PDR","FORNITURA","CONSUMO","NOTE","DETTAGLIO"].map(h=><th key={h} style={{padding:10,textAlign:"left",background:"#e2e8f0"}}>{h}</th>)}</tr></thead><tbody>{recessi.map(r=><tr key={r.id} style={{borderBottom:"1px solid #e2e8f0"}}><td style={{padding:10}}>{r.month_key||date(r.validita_date)}</td><td>{field(r,"denominazione")}</td><td>{field(r,"pod_pdr")}</td><td>{field(r,"commodity")}</td><td>{number(r.consumo)}</td><td>{r.note||"—"}</td><td><button onClick={()=>open(r)}>APRI</button></td></tr>)}</tbody></table></div>}
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
