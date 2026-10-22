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
 const [detail,setDetail]=useState<Item|null>(null),[note,setNote]=useState(""),[recovered,setRecovered]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
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
 const open=(r:Item)=>{setDetail(r);setNote(String(r.note||""));setRecovered(Boolean(r.recuperato));setMessage("");};
 const save=async()=>{if(!detail)return;setSaving(true);setMessage("");const {error:e}=await supabase.rpc("agent_recesso_save_note",{p_session_token:token,p_recesso_id:Number(detail.id),p_note:note,p_recuperato:recovered});if(e)setMessage("Errore: "+e.message);else{setMessage("Note salvate");setDetail({...detail,note,recuperato:recovered});await refresh();}setSaving(false);};
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
   {tab!=="PRODUZIONE"&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}><thead><tr>{["MESE","CLIENTE","POD/PDR","FORNITURA","CONSUMO","NOTE","DETTAGLIO"].map(h=><th key={h} style={{padding:10,textAlign:"left",background:"#e2e8f0"}}>{h}</th>)}</tr></thead><tbody>{recessi.map(r=><tr key={r.id} style={{borderBottom:"1px solid #e2e8f0"}}><td style={{padding:10}}>{r.month_key||date(r.validita_date)}</td><td>{field(r,"denominazione")}</td><td>{field(r,"pod_pdr")}</td><td>{field(r,"commodity")}</td><td>{number(r.consumo)}</td><td>{r.note||"—"}</td><td><button onClick={()=>open(r)}>APRI</button></td></tr>)}</tbody></table></div>}
   {detail&&<div role="presentation" onClick={()=>setDetail(null)} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.5)",display:"grid",placeItems:"center",padding:12}}><div role="dialog" aria-modal="true" aria-label="Dettaglio recesso" onClick={e=>e.stopPropagation()} style={{background:"white",borderRadius:14,padding:20,width:"min(760px,100%)",maxHeight:"90vh",overflow:"auto"}}><div style={{display:"flex",justifyContent:"space-between"}}><h3>DETTAGLIO RECESSO</h3><button onClick={()=>setDetail(null)}>CHIUDI ✕</button></div>
    <dl style={{display:"grid",gridTemplateColumns:"minmax(110px,1fr) 2fr",gap:8}}>{Object.entries(detail).filter(([k])=>!["note_history","note","recuperato"].includes(k)).map(([k,v])=><React.Fragment key={k}><dt style={{fontWeight:700}}>{label(k)}</dt><dd style={{margin:0,overflowWrap:"anywhere"}}>{typeof v==="object"?JSON.stringify(v):String(v??"—")}</dd></React.Fragment>)}</dl>
    <label style={{display:"block",fontWeight:700}}>NOTE<textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} style={{display:"block",width:"100%",padding:10,boxSizing:"border-box"}}/></label>
    <label style={{display:"block",margin:"12px 0"}}><input type="checkbox" checked={recovered} onChange={e=>setRecovered(e.target.checked)}/> RECESSO RECUPERATO</label>
    <button disabled={saving} onClick={()=>void save()} style={{padding:12,fontWeight:800}}>{saving?"SALVATAGGIO…":"SALVA NOTE E STATO"}</button>{message&&<p role="status">{message}</p>}
    <h4>STORICO NOTE</h4>{(detail.note_history||[]).map((h:Item,i:number)=><p key={i} style={{borderBottom:"1px solid #ddd",padding:8}}>{date(h.created_at)} — {h.note}</p>)}
   </div></div>}
  </>}
 </section>;
}
