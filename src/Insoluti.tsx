import React,{useEffect,useMemo,useState} from "react";
import * as XLSX from "xlsx";
import {supabase} from "./supabase";

type Item={id:number;dedup_key:string;commodity:"LUCE"|"GAS";period:string;scadenza:string;agente:string;cliente:string;codice_cliente:string;fattura:string;punto:string;pod_pdr:string;importo:number;telefono:string;email:string;indirizzo:string;avvertito:boolean;pagato:boolean;note:string;raw?:Record<string,unknown>};
const MONTHS=["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const css={padding:"10px 13px",borderRadius:9,border:"1px solid #cbd5e1",background:"white",fontWeight:800,cursor:"pointer"} as const;
const euro=(n:number)=>Number(n||0).toLocaleString("it-IT",{style:"currency",currency:"EUR"});
const norm=(v:unknown)=>String(v??"").trim();
const fileLabel=(p:string)=>`SCADENZE ${MONTHS[Number(p.slice(5,7))-1]||p} ${p.slice(0,4)}`;
const periodFromFile=(name:string)=>{const upper=name.toUpperCase();const monthIndex=MONTHS.findIndex(m=>upper.includes(m));const year=upper.match(/20\d{2}/)?.[0];const numeric=upper.match(/(?:^|\D)(20\d{2})[-_. ](0?[1-9]|1[0-2])(?:\D|$)/);if(numeric)return `${numeric[1]}-${numeric[2].padStart(2,"0")}`;return monthIndex>=0&&year?`${year}-${String(monthIndex+1).padStart(2,"0")}`:"";};
function parseDate(v:unknown):string{
 if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;}
 if(v instanceof Date&&!isNaN(v.getTime()))return v.toISOString().slice(0,10);
 const t=norm(v);const it=t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(it)return `${it[3]}-${it[2].padStart(2,"0")}-${it[1].padStart(2,"0")}`;
 return /^\d{4}-\d\d-\d\d/.test(t)?t.slice(0,10):"";
}
export default function Insoluti({token,isAdmin=false}:{token:string;isAdmin?:boolean}){
 const [items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[period,setPeriod]=useState(""),[agent,setAgent]=useState(""),[agentSearch,setAgentSearch]=useState(""),[commodity,setCommodity]=useState(""),[search,setSearch]=useState(""),[modal,setModal]=useState<Item|null>(null),[modalMode,setModalMode]=useState<"scheda"|"note">("scheda"),[note,setNote]=useState("");
 const load=async()=>{if(!token)return;setLoading(true);const {data,error}=await supabase.rpc(isAdmin?"insoluti_admin_list":"insoluti_agent_list",{p_session_token:token});if(error)setMessage(error.message);else setItems((data||[]) as Item[]);setLoading(false);};
 useEffect(()=>{void load();},[token,isAdmin]);
 const periods=useMemo(()=>Array.from(new Set(items.map(i=>i.period))).sort().reverse(),[items]);
 const agents=useMemo(()=>Array.from(new Set(items.map(i=>i.agente))).sort((a,b)=>a.localeCompare(b,"it")),[items]);
 const filtered=useMemo(()=>items.filter(i=>(!period||i.period===period)&&(!agent||i.agente===agent)&&(!commodity||i.commodity===commodity)&&(!search||[i.cliente,i.agente,i.fattura,i.pod_pdr,i.codice_cliente].join(" ").toLowerCase().includes(search.toLowerCase()))),[items,period,agent,commodity,search]);
 const total=filtered.reduce((a,i)=>a+Number(i.importo||0),0);
 const update=async(i:Item,field:"avvertito"|"pagato"|"note",value:string)=>{setBusy(true);const {error}=await supabase.rpc("insoluti_set_status",{p_session_token:token,p_is_admin:isAdmin,p_id:i.id,p_field:field,p_value:value});if(error)setMessage(error.message);else{setItems(prev=>prev.map(x=>x.id===i.id?{...x,[field]:field==="note"?value:value==="true"}:x));if(field==="note")setModal(null);}setBusy(false);};
 const importFiles=async(files:FileList|null)=>{if(!files?.length)return;setBusy(true);setMessage("");let totalImported=0;try{
 for(const file of Array.from(files)){const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:true});
 const kind=/GAS/i.test(file.name)?"GAS":/ENERGIA|LUCE/i.test(file.name)?"LUCE":/\-G\b/i.test(rows.map(r=>norm(r.NUM_FATTURA)).join(" "))?"GAS":"LUCE";
 const inferredPeriod=periodFromFile(file.name);
 const validDates=rows.map(r=>parseDate(r.DATA_SCADENZA_FATTURA||r.DATA_SCADENZA_RATA)).filter(Boolean);
 const suggestedPeriod=inferredPeriod||(validDates.length?validDates.slice().sort()[Math.floor(validDates.length/2)].slice(0,7):"");
 const enteredPeriod=window.prompt("Periodo GENERALE del file "+file.name+" (AAAA-MM). Le date delle singole fatture rimarranno invariate.",suggestedPeriod);
 if(enteredPeriod===null)throw new Error("Importazione annullata");
 const filePeriod=enteredPeriod.trim();
 if(!/^20\\d{2}-(0[1-9]|1[0-2])$/.test(filePeriod))throw new Error("Periodo file non valido: usa AAAA-MM");
 const parsed=rows.filter(r=>norm(r.CD_CLIENTE)&&norm(r.NUM_FATTURA)).map(r=>{const date=parseDate(r.DATA_SCADENZA_FATTURA||r.DATA_SCADENZA_RATA);if(!date)return null;const month=filePeriod;const key=[kind,norm(r.CD_CLIENTE),norm(r.NUM_FATTURA),norm(r.CD_PUNTO),norm(r.POD)].join("|").toUpperCase();return {dedup_key:key,commodity:kind,period:month,scadenza:date,agente:norm(r.AGENZIA),cliente:norm(r.RAGIONE_SOCIALE),codice_cliente:norm(r.CD_CLIENTE),fattura:norm(r.NUM_FATTURA),punto:norm(r.CD_PUNTO),pod_pdr:norm(r.POD),importo:Number(r.IMPORTO_NON_PAGATO)||0,telefono:norm(r.NUMERO_TELF),email:norm(r.EMAIL_CLIENTE),indirizzo:norm(r.INDIRIZZO_FORN),raw:r};}).filter(Boolean);
 if(!parsed.length)throw new Error("Nessuna riga valida in "+file.name);
 const unique=Array.from(new Map(parsed.map(row=>[(row as {dedup_key:string}).dedup_key,row])).values());
 for(let j=0;j<unique.length;j+=150){const {data,error}=await supabase.rpc("insoluti_admin_import",{p_session_token:token,p_rows:unique.slice(j,j+150)});if(error)throw error;totalImported+=Number(data||0);}
 }setMessage(`Importazione completata: ${totalImported} righe elaborate. Stati e note già salvati conservati.`);await load();
 }catch(e){setMessage("Importazione interrotta: "+String((e as Error).message||e));}finally{setBusy(false);}};
 return <div style={{display:"grid",gap:14,color:"#0f172a"}}>
  <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:16,padding:18}}>
   <h2 style={{margin:"0 0 8px"}}>💶 INSOLUTI</h2><p style={{margin:"0 0 14px",color:"#64748b"}}>Scadenze per agente · Luce ⚡ e Gas 🔥 · Stati AVVERTITO / PAGATO e note</p>
   {isAdmin&&<label style={{display:"inline-block",...css,background:"#0f172a",color:"white",marginBottom:12}}>📤 IMPORTA FILE EXCEL LUCE / GAS <input type="file" multiple accept=".xlsx,.xls" disabled={busy} onChange={e=>{void importFiles(e.target.files);e.target.value="";}} style={{display:"none"}}/></label>}
   {message&&<div style={{padding:10,background:"#f1f5f9",borderRadius:9,marginBottom:12}}>{message}</div>}
   <div style={{display:"flex",gap:9,flexWrap:"wrap",marginBottom:12}}>
    <select style={css} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">TUTTE LE SCADENZE</option>{periods.map(p=><option key={p} value={p}>SCADENZA {MONTHS[Number(p.slice(5,7))-1]} {p.slice(0,4)}</option>)}</select>
    {isAdmin&&<div style={{display:"grid",gap:4,minWidth:210,flex:"1 1 210px"}}><input style={{...css,width:"100%",boxSizing:"border-box"}} value={agentSearch} onChange={e=>{setAgentSearch(e.target.value);setAgent("");}} placeholder="🔎 Cerca agente scrivendo..."/><select style={{...css,width:"100%"}} value={agent} onChange={e=>setAgent(e.target.value)}><option value="">TUTTI GLI AGENTI</option>{agents.filter(a=>a.toLocaleLowerCase("it").includes(agentSearch.toLocaleLowerCase("it"))).map(a=><option key={a} value={a}>{a}</option>)}</select></div>}
    <div style={{display:"flex",gap:5,alignItems:"center"}}>{([["","TUTTE"],["LUCE","⚡ LUCE"],["GAS","🔥 GAS"]] as const).map(([v,label])=><button type="button" key={v} onClick={()=>setCommodity(v)} style={{...css,background:commodity===v?"#0f172a":"white",color:commodity===v?"white":v==="LUCE"?"#c2410c":v==="GAS"?"#0369a1":"#334155",borderColor:commodity===v?"#0f172a":"#cbd5e1"}}>{label}</button>)}</div>
    <input placeholder="Cerca cliente, agente, POD/PDR, fattura..." style={{...css,flex:"1 1 240px"}} value={search} onChange={e=>setSearch(e.target.value)}/>
    <button style={css} onClick={()=>void load()} disabled={loading}>↻ AGGIORNA</button>
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{[["PRATICHE",filtered.length],["IMPORTO INSOLUTO",euro(total)],["AVVERTITI",filtered.filter(i=>i.avvertito).length],["PAGATI",filtered.filter(i=>i.pagato).length]].map(([name,value])=><div key={name} style={{background:"#f8fafc",border:"1px solid #e2e8f0",padding:12,borderRadius:12,minWidth:120,flex:"1 1 120px"}}><div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>{name}</div><strong style={{fontSize:19}}>{value}</strong></div>)}</div>
  </div>
  <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:16,padding:14,overflowX:"auto"}}>
   {loading?<p>Caricamento…</p>:!filtered.length?<p>Nessun insoluto presente per i filtri selezionati.</p>:<table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:900}}><thead><tr style={{background:"#e2e8f0"}}>{["TIPO","SCADENZA","FILE","AGENTE","CLIENTE / FATTURA","POD / PDR","IMPORTO","AVVERTITO","PAGATO","SCHEDA","NOTE"].map(x=><th key={x} style={{padding:10,textAlign:"left"}}>{x}</th>)}</tr></thead><tbody>{filtered.map(i=><tr key={i.id} style={{borderBottom:"1px solid #e2e8f0",background:i.pagato?"#f0fdf4":"white"}}>
    <td style={{padding:9,color:i.commodity==="LUCE"?"#ea580c":"#0284c7",fontWeight:900}}>{i.commodity==="LUCE"?"⚡":"🔥"} {i.commodity}</td>
    <td style={{padding:9,whiteSpace:"nowrap"}}><b>SCADENZA {MONTHS[Number(i.period.slice(5,7))-1]}</b><div>{i.scadenza?.split("-").reverse().join("/")}</div></td><td style={{padding:9,whiteSpace:"nowrap",fontWeight:800}}>{fileLabel(i.period)}</td>
    <td style={{padding:9}}>{i.agente}</td><td style={{padding:9}}><b>{i.cliente}</b><div style={{color:"#64748b"}}>{i.fattura}</div></td>
    <td style={{padding:9}}>{i.pod_pdr}</td><td style={{padding:9,fontWeight:900,whiteSpace:"nowrap"}}>{euro(i.importo)}</td>
    {(["avvertito","pagato"] as const).map(f=><td key={f} style={{padding:8}}><button disabled={busy} onClick={()=>void update(i,f,String(!i[f]))} style={{...css,background:i[f]?"#dcfce7":"white",color:i[f]?"#166534":"#334155",borderColor:i[f]?"#86efac":"#cbd5e1"}}>{i[f]?"✓":"○"} {f.toUpperCase()}</button></td>)}
    <td style={{padding:8}}><button style={{...css,background:"#eff6ff",color:"#1d4ed8"}} onClick={()=>{setModal(i);setModalMode("scheda");setNote(i.note||"");}}>📋 SCHEDA</button></td>
    <td style={{padding:8}}><button style={{...css,background:i.note?"#fef9c3":"white"}} onClick={()=>{setModal(i);setModalMode("note");setNote(i.note||"");}}>📝 NOTE {i.note?"✓":""}</button></td>
   </tr>)}</tbody></table>}
  </div>
  {modal&&<div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(15,23,42,.65)",display:"grid",placeItems:"center",padding:14}} onClick={()=>setModal(null)}>
    <div role="dialog" aria-modal="true" aria-label="Dettaglio insoluto" onClick={e=>e.stopPropagation()} style={{width:"min(760px,100%)",maxHeight:"90vh",overflowY:"auto",background:"white",borderRadius:18,padding:22,boxSizing:"border-box",boxShadow:"0 20px 70px #0004"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:16}}><div><div style={{fontWeight:900,fontSize:20}}>{modal.commodity==="LUCE"?"⚡ LUCE":"🔥 GAS"} · {modal.cliente}</div><div style={{fontSize:13,color:"#64748b"}}>SCADENZA {MONTHS[Number(modal.period.slice(5,7))-1]} {modal.period.slice(0,4)}</div></div><button onClick={()=>setModal(null)} style={{...css,fontSize:18}}>✕</button></div>
      <div style={{display:"flex",gap:8,marginBottom:16}}><button onClick={()=>setModalMode("scheda")} style={{...css,background:modalMode==="scheda"?"#0f172a":"white",color:modalMode==="scheda"?"white":"#0f172a"}}>📋 SCHEDA</button><button onClick={()=>setModalMode("note")} style={{...css,background:modalMode==="note"?"#0f172a":"white",color:modalMode==="note"?"white":"#0f172a"}}>📝 NOTE</button></div>
      {modalMode==="scheda"?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:10}}>
        {([["Cliente",modal.cliente],["Agente",modal.agente],["Codice cliente",modal.codice_cliente],["Numero fattura",modal.fattura],["Codice punto",modal.punto],["POD / PDR",modal.pod_pdr],["Importo insoluto",euro(modal.importo)],["Scadenza fattura",modal.scadenza?.split("-").reverse().join("/")],["Telefono",modal.telefono],["Email",modal.email],["Indirizzo fornitura",modal.indirizzo]] as [string,string][]).map(([k,v])=><div key={k} style={{padding:12,borderRadius:11,background:"#f8fafc",border:"1px solid #e2e8f0"}}><div style={{fontSize:11,color:"#64748b",fontWeight:800,marginBottom:5}}>{k.toUpperCase()}</div><div style={{fontWeight:750,overflowWrap:"anywhere"}}>{v||"—"}</div></div>)}
        {Object.entries(modal.raw||{}).filter(([k,v])=>v!==""&&v!=null&&!["CD_CLIENTE","NUM_FATTURA","CD_PUNTO","POD","AGENZIA","RAGIONE_SOCIALE","IMPORTO_NON_PAGATO","NUMERO_TELF","EMAIL_CLIENTE","INDIRIZZO_FORN"].includes(k)).map(([k,v])=><div key={k} style={{padding:12,borderRadius:11,background:"#f8fafc",border:"1px solid #e2e8f0"}}><div style={{fontSize:11,color:"#64748b",fontWeight:800,marginBottom:5}}>{k.replace(/_/g," ")}</div><div style={{overflowWrap:"anywhere"}}>{String(v)}</div></div>)}
      </div>:<div style={{display:"grid",gap:12}}><textarea rows={7} value={note} onChange={e=>setNote(e.target.value)} style={{width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:10,padding:12}}/><button disabled={busy} style={{...css,background:"#16a34a",color:"white"}} onClick={()=>void update(modal,"note",note)}>SALVA NOTE</button></div>}
      <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>{(["avvertito","pagato"] as const).map(f=><button key={f} disabled={busy} onClick={()=>void update(modal,f,String(!items.find(x=>x.id===modal.id)?.[f]))} style={{...css,background:items.find(x=>x.id===modal.id)?.[f]?"#dcfce7":"white"}}>{items.find(x=>x.id===modal.id)?.[f]?"✓":"○"} {f.toUpperCase()}</button>)}</div>
    </div>
  </div>}
 </div>;
}
