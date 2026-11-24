import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getAdminSessionToken } from "./adminSecurity";
import { adminAgentList, type SafeAgentRecord } from "./agentSecurity";

export type ReservedOffer = {
  id?: number;
  name: string;
  commodity: "LUCE" | "GAS";
  customer_type: "DOMESTICO" | "BUSINESS";
  price_mode: "VARIABILE" | "FISSO" | "BILANCIATO";
  params: Record<string, number | string>;
  agent_ids: number[];
  active: boolean;
};
const blank = (): ReservedOffer => ({
  name:"", commodity:"LUCE", customer_type:"DOMESTICO",price_mode:"VARIABILE",
  params:{canone:0,spread:0,maggiorazioneCapacityMarket:0,quotaVariabile:0,percentualeFissa:50,percentualeVariabile:50},
  agent_ids:[],active:true
});
const fieldStyle:React.CSSProperties={padding:9,border:"1px solid #cbd5e1",borderRadius:8,width:"100%",boxSizing:"border-box"};
export default function ReservedOffersAdmin({energyOffers,gasOffers,onSaved}:{
 energyOffers:Array<Record<string,any>>;gasOffers:Array<Record<string,any>>;onSaved:()=>void;
}){
 const [offers,setOffers]=useState<ReservedOffer[]>([]);
 const [agents,setAgents]=useState<SafeAgentRecord[]>([]);
 const [draft,setDraft]=useState<ReservedOffer>(blank());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [copyFrom,setCopyFrom]=useState("");
 const refresh=async()=>{
  try {
   const token=await getAdminSessionToken();
   const [result,list]=await Promise.all([
    supabase.rpc("reserved_offers_admin",{p_session_token:token,p_action:"list"}),
    adminAgentList()
   ]);
   if(result.error)throw result.error;
   setOffers(Array.isArray(result.data)?result.data:[]);
   setAgents([...list].sort((a,b)=>`${a.cognome||""} ${a.nome||""} ${a.username||""}`.localeCompare(`${b.cognome||""} ${b.nome||""} ${b.username||""}`,"it",{sensitivity:"base"})));
  }catch(e:any){setMessage("Errore caricamento: "+(e?.message||String(e)));}
 };
 useEffect(()=>{void refresh();},[]);
 const set=(key:keyof ReservedOffer,value:any)=>setDraft(d=>({...d,[key]:value}));
 const save=async()=>{
  if(!draft.name.trim()||!draft.agent_ids.length){setMessage("Indica nome e almeno un agente.");return;}
  setBusy(true);setMessage("");
  try{
   const token=await getAdminSessionToken();
   const {error}=await supabase.rpc("reserved_offers_admin",{p_session_token:token,p_action:"save",p_offer:draft,p_id:draft.id||null});
   if(error)throw error;
   setDraft(blank());setCopyFrom("");await refresh();onSaved();setMessage("Offerta riservata salvata su Supabase.");
  }catch(e:any){setMessage("Salvataggio non riuscito: "+(e?.message||String(e)));}
  finally{setBusy(false);}
 };
 const remove=async(id:number)=>{
  if(!window.confirm("Eliminare questa offerta riservata?"))return;
  setBusy(true);
  try{
   const token=await getAdminSessionToken();
   const {error}=await supabase.rpc("reserved_offers_admin",{p_session_token:token,p_action:"delete",p_id:id});
   if(error)throw error;
   await refresh();onSaved();setMessage("Offerta eliminata.");
  }catch(e:any){setMessage(e?.message||String(e));}
  finally{setBusy(false);}
 };
 const [pendingAgents,setPendingAgents]=useState<Record<number,number[]>>({});
 const saveAgents=async(o:ReservedOffer,ids:number[])=>{
  if(!ids.length){setMessage("Seleziona almeno un agente oppure disattiva l'offerta.");return;}
  setBusy(true);
  try{
   const token=await getAdminSessionToken();
   const {error}=await supabase.rpc("reserved_offers_admin",{p_session_token:token,p_action:"save",p_offer:{...o,agent_ids:ids},p_id:o.id});
   if(error)throw error;
   setPendingAgents(p=>{const next={...p};delete next[o.id!];return next;});
   await refresh();onSaved();setMessage("Agenti autorizzati aggiornati.");
  }catch(e:any){setMessage("Errore: "+(e?.message||String(e)));}
  finally{setBusy(false);}
 };
 const agentMenu=(ids:number[],change:(ids:number[])=>void)=>(
  <details style={{minWidth:220,maxWidth:360}}>
   <summary style={{...fieldStyle,cursor:"pointer",background:"#fff"}}>{ids.length?ids.length+" agenti selezionati":"Seleziona agenti"} ▾</summary>
   <div style={{maxHeight:240,overflowY:"auto",border:"1px solid #cbd5e1",borderRadius:8,padding:8,background:"#fff"}}>
    {agents.map(a=><label key={a.id} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 4px",borderBottom:"1px solid #f1f5f9"}}><input type="checkbox" disabled={busy} checked={ids.includes(a.id)} onChange={e=>change(e.target.checked?[...ids,a.id]:ids.filter(id=>id!==a.id))}/>{a.cognome} {a.nome} ({a.username})</label>)}
    {!agents.length&&<span>Nessun agente disponibile</span>}
   </div>
  </details>
 );
 const copyOptions=[...energyOffers.map(o=>({key:"LUCE:"+o.nome,commodity:"LUCE" as const,offer:o})),...gasOffers.map(o=>({key:"GAS:"+o.nome,commodity:"GAS" as const,offer:o}))];
 return <section style={{background:"#fff",border:"1px solid #cbd5e1",borderRadius:14,padding:18,marginTop:24}}>
  <h2 style={{marginTop:0}}>🔒 OFFERTE RISERVATE</h2>
  <p style={{color:"#475569",fontSize:13}}>Offerte personalizzate per uno o più agenti. Le assegnazioni sono verificate dal server. Le offerte inattive non sono disponibili nel simulatore.</p>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
   <button type="button" onClick={()=>{setDraft(blank());setCopyFrom("");}} style={fieldStyle}>+ CREA DA ZERO</button>
   <select style={{...fieldStyle,maxWidth:390}} value={copyFrom} onChange={e=>{
    const key=e.target.value;setCopyFrom(key);
    const found=copyOptions.find(o=>o.key===key);
    if(found){const o=found.offer;setDraft({...blank(),name:o.nome+" RISERVATA",commodity:found.commodity,customer_type:(o.allowedCustomerGroups||[]).includes("DOMESTICI")|| (o.allowedCustomerGroups||[]).includes("DOMESTICO")?"DOMESTICO":"BUSINESS",params:{...blank().params,...o},agent_ids:[]});}
   }}><option value="">DUPLICA UN LISTINO ESISTENTE...</option>{copyOptions.map(o=><option key={o.key} value={o.key}>{o.commodity} · {o.offer.nome}</option>)}</select>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
   <label>Nome offerta<input style={fieldStyle} value={draft.name} onChange={e=>set("name",e.target.value)}/></label>
   <label>Fornitura<select style={fieldStyle} value={draft.commodity} onChange={e=>set("commodity",e.target.value)}><option>LUCE</option><option>GAS</option></select></label>
   <label>Destinazione<select style={fieldStyle} value={draft.customer_type} onChange={e=>set("customer_type",e.target.value)}><option value="DOMESTICO">DOMESTICO</option><option value="BUSINESS">BUSINESS</option></select></label>
   <label>Prezzo<select style={fieldStyle} value={draft.price_mode} onChange={e=>set("price_mode",e.target.value)}><option value="VARIABILE">INDICIZZATO</option><option value="FISSO">FISSO</option><option value="BILANCIATO">BILANCIATO</option></select></label>
   {(["canone","spread",...(draft.commodity==="LUCE"?["maggiorazioneCapacityMarket","maggiorazioneCapacityMarketFissa"]:["quotaVariabile"]),...(draft.price_mode==="BILANCIATO"?["percentualeFissa","percentualeVariabile"]:[])]).map(k=><label key={k}>{({canone:"Quota fissa €/anno",spread:"Spread €/kWh o €/Smc",maggiorazioneCapacityMarket:"Capacity market",maggiorazioneCapacityMarketFissa:"Capacity market fissa",quotaVariabile:"Quota variabile",percentualeFissa:"% prezzo fisso",percentualeVariabile:"% indicizzato"} as Record<string,string>)[k]||k}<input type="number" step="any" style={fieldStyle} value={draft.params[k]??0} onChange={e=>set("params",{...draft.params,[k]:Number(e.target.value)})}/></label>)}
  </div>
  <h3>Agenti autorizzati</h3>
  {agentMenu(draft.agent_ids,ids=>set("agent_ids",ids))}
  <label style={{display:"flex",gap:8,margin:"14px 0"}}><input type="checkbox" checked={draft.active} onChange={e=>set("active",e.target.checked)}/>Offerta attiva</label>
  <button type="button" disabled={busy} onClick={()=>void save()} style={{background:"#2563eb",color:"white",border:0,padding:"11px 20px",borderRadius:9,fontWeight:800}}>SALVA OFFERTA RISERVATA</button>
  {message&&<p role="status">{message}</p>}
  <h3>Offerte riservate salvate</h3>
  {offers.length===0&&<p>Nessuna offerta riservata.</p>}
  {offers.map(o=><div key={o.id} style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",padding:10,borderBottom:"1px solid #e2e8f0"}}>
   <strong>{o.name}</strong><span>{o.commodity} · {o.customer_type} · {o.price_mode} · {o.agent_ids.length} agenti · {o.active?"ATTIVA":"DISATTIVA"}</span>
   <div style={{display:"grid",gap:5}}><strong style={{fontSize:12}}>AGENTI ABILITATI</strong>{agentMenu(pendingAgents[o.id!]??o.agent_ids,ids=>setPendingAgents(p=>({...p,[o.id!]:ids})))}
   {pendingAgents[o.id!]!==undefined&&<button type="button" disabled={busy} onClick={()=>void saveAgents(o,pendingAgents[o.id!])}>SALVA ASSEGNAZIONI</button>}</div>
   <button type="button" onClick={()=>{setDraft(o);setCopyFrom("");}}>MODIFICA</button>
   <button type="button" disabled={busy} onClick={()=>void remove(o.id!)}>ELIMINA</button>
  </div>)}
 </section>;
}
