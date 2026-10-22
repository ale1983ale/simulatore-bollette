import React,{useEffect,useState} from "react";
import {supabase} from "./supabase";
export default function AgentProduction({token}:{token:string}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(""),[tab,setTab]=useState("RECESSI"),[search,setSearch]=useState("");
 useEffect(()=>{void supabase.rpc("agent_production_data",{p_session_token:token}).then(({data,error})=>{if(error)setError(error.message);else setData(data);});},[token]);
 const prod=tab==="PRODUZIONE"||tab==="ATTIVO PRODUZIONE";
 const items=(prod?data?.produzione:data?.recessi)||[];
 const rows=items.filter((x:any)=>JSON.stringify(x).toLowerCase().includes(search.toLowerCase()));
 const cols=prod?["PERIODO","AGENTE","FORNITURA","CONTRATTI","CONSUMO"]:["MESE","AGENTE","CLIENTE","POD/PDR","FORNITURA","CONSUMO"];
 return <section style={{padding:16,background:"white",borderRadius:14}}>
  <h2>📊 DATI PRODUZIONE</h2>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Caricamento...</p>}
  {data&&<>
   <nav style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:15}}>{["RECESSI","PRODUZIONE","ATTIVO PRODUZIONE","DETTAGLIO RECESSI"].map(x=><button key={x} onClick={()=>setTab(x)} style={{padding:10,borderRadius:9,background:tab===x?"#0f172a":"#e2e8f0",color:tab===x?"white":"#0f172a",border:0,fontWeight:800}}>{x}</button>)}</nav>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca nei tuoi dati" style={{padding:10,border:"1px solid #cbd5e1",borderRadius:9,marginBottom:12}}/>
   {tab==="ATTIVO PRODUZIONE"&&<p>Contratti in attivazione: {data.produzione.reduce((n:number,r:any)=>n+Number(r.in_attivazione_count||0),0)} · Recessi: {data.recessi.length}</p>}
   <p>{rows.length} righe</p>
   <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",minWidth:650}}><thead><tr>{cols.map(c=><th key={c} style={{textAlign:"left",padding:9,background:"#e2e8f0"}}>{c}</th>)}</tr></thead><tbody>{rows.map((r:any)=><tr key={r.id} style={{borderBottom:"1px solid #e2e8f0"}}>{(prod?[r.period_label,r.agente,r.commodity,r.in_attivazione_count,r.consumo_totale]:[r.month_key,r.agente,r.denominazione,r.pod_pdr,r.commodity,r.consumo]).map((v:any,i:number)=><td key={i} style={{padding:9}}>{String(v??"—")}</td>)}</tr>)}</tbody></table></div>
  </>}
 </section>;
}
