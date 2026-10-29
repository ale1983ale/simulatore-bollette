import React,{useEffect,useMemo,useState} from "react";
import * as XLSX from "xlsx";
import {supabase} from "./supabase";

type Item={id:number;dedup_key:string;commodity:"LUCE"|"GAS";period:string;scadenza:string;agente:string;cliente:string;codice_cliente:string;fattura:string;punto:string;pod_pdr:string;importo:number;telefono:string;email:string;indirizzo:string;avvertito:boolean;pagato:boolean;note:string};
const MONTHS=["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const css={padding:"10px 13px",borderRadius:9,border:"1px solid #cbd5e1",background:"white",fontWeight:800,cursor:"pointer"} as const;
const euro=(n:number)=>Number(n||0).toLocaleString("it-IT",{style:"currency",currency:"EUR"});
const norm=(v:unknown)=>String(v??"").trim();
function parseDate(v:unknown):string{
 if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;}
 if(v instanceof Date&&!isNaN(v.getTime()))return v.toISOString().slice(0,10);
 const t=norm(v);const it=t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(it)return `${it[3]}-${it[2].padStart(2,"0")}-${it[1].padStart(2,"0")}`;
 return /^\d{4}-\d\d-\d\d/.test(t)?t.slice(0,10):"";
}
export default function Insoluti({token,isAdmin=false}:{token:string;isAdmin?:boolean}){
 const [items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[period,setPeriod]=useState(""),[agent,setAgent]=useState(""),[commodity,setCommodity]=useState(""),[search,setSearch]=useState(""),[modal,setModal]=useState<Item|null>(null),[note,setNote]=useState("");
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
 const parsed=rows.filter(r=>norm(r.CD_CLIENTE)&&norm(r.NUM_FATTURA)).map(r=>{const date=parseDate(r.DATA_SCADENZA_FATTURA||r.DATA_SCADENZA_RATA);if(!date)return null;const month=date.slice(0,7);const key=[kind,norm(r.CD_CLIENTE),norm(r.NUM_FATTURA),norm(r.CD_PUNTO),norm(r.POD)].join("|").toUpperCase();return {dedup_key:key,commodity:kind,period:month,scadenza:date,agente:norm(r.AGENZIA),cliente:norm(r.RAGIONE_SOCIALE),codice_cliente:norm(r.CD_CLIENTE),fattura:norm(r.NUM_FATTURA),punto:norm(r.CD_PUNTO),pod_pdr:norm(r.POD),importo:Number(r.IMPORTO_NON_PAGATO)||0,telefono:norm(r.NUMERO_TELF),email:norm(r.EMAIL_CLIENTE),indirizzo:norm(r.INDIRIZZO_FORN),raw:r};}).filter(Boolean);
 if(!parsed.length)throw new Error("Nessuna riga valida in "+file.name);
 for(let j=0;j<parsed.length;j+=150){const {data,error}=await supabase.rpc("insoluti_admin_import",{p_session_token:token,p_rows:parsed.slice(j,j+150)});if(error)throw error;totalImported+=Number(data||0);}
 }setMessage(`Importazione completata: ${totalImported} righe elaborate. Stati e note già salvati conservati.`);await load();
 }catch(e){setMessage("Importazione interrotta: "+String((e as Error).message||e));}finally{setBusy(false);}};
 return <div style={{display:"grid",gap:14,color:"#0f172a"}}>
  <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:16,padding:18}}>
   <h2 style={{margin:"0 0 8px"}}>💶 INSOLUTI</h2><p style={{margin:"0 0 14px",color:"#64748b"}}>Scadenze per agente · Luce ⚡ e Gas 🔥 · Stati AVVERTITO / PAGATO e note</p>
   {isAdmin&&<label style={{display:"inline-block",...css,background:"#0f172a",color:"white",marginBottom:12}}>📤 IMPORTA FILE EXCEL LUCE / GAS <input type="file" multiple accept=".xlsx,.xls" disabled={busy} onChange={e=>{void importFiles(e.target.files);e.target.value="";}} style={{display:"none"}}/></label>}
   {message&&<div style={{padding:10,background:"#f1f5f9",borderRadius:9,marginBottom:12}}>{message}</div>}
   <div style={{display:"flex",gap:9,flexWrap:"wrap",marginBottom:12}}>
    <select style={css} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">TUTTE LE SCADENZE</option>{periods.map(p=><option key={p} value={p}>SCADENZA {MONTHS[Number(p.slice(5,7))-1]} {p.slice(0,4)}</option>)}</select>
    {isAdmin&&<select style={css} value={agent} onChange={e=>setAgent(e.target.value)}><option value="">TUTTI GLI AGENTI</option>{agents.map(a=><option key={a}>{a}</option>)}</select>}
    <select style={css} value={commodity} onChange={e=>setCommodity(e.target.value)}><option value="">LUCE + GAS</option><option value="LUCE">⚡ LUCE</option><option value="GAS">🔥 GAS</option></select>
    <input placeholder="Cerca cliente, agente, POD/PDR, fattura..." style={{...css,flex:"1 1 240px"}} value={search} onChange={e=>setSearch(e.target.value)}/>
    <button style={css} onClick={()=>void load()} disabled={loading}>↻ AGGIORNA</button>
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{[["PRATICHE",filtered.length],["IMPORTO INSOLUTO",euro(total)],["AVVERTITI",filtered.filter(i=>i.avvertito).length],["PAGATI",filtered.filter(i=>i.pagato).length]].map(([name,value])=><div key={name} style={{background:"#f8fafc",border:"1px solid #e2e8f0",padding:12,borderRadius:12,minWidth:120,flex:"1 1 120px"}}><div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>{name}</div><strong style={{fontSize:19}}>{value}</strong></div>)}</div>
  </div>
  <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:16,padding:14,overflowX:"auto"}}>
   {loading?<p>Caricamento…</p>:!filtered.length?<p>Nessun insoluto presente per i filtri selezionati.</p>:<table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:900}}><thead><tr style={{background:"#e2e8f0"}}>{["TIPO","SCADENZA","AGENTE","CLIENTE / FATTURA","POD / PDR","IMPORTO","AVVERTITO","PAGATO","NOTE"].map(x=><th key={x} style={{padding:10,textAlign:"left"}}>{x}</th>)}</tr></thead><tbody>{filtered.map(i=><tr key={i.id} style={{borderBottom:"1px solid #e2e8f0",background:i.pagato?"#f0fdf4":"white"}}>
    <td style={{padding:9,color:i.commodity==="LUCE"?"#ea580c":"#0284c7",fontWeight:900}}>{i.commodity==="LUCE"?"⚡":"🔥"} {i.commodity}</td>
    <td style={{padding:9,whiteSpace:"nowrap"}}><b>SCADENZA {MONTHS[Number(i.period.slice(5,7))-1]}</b><div>{i.scadenza?.split("-").reverse().join("/")}</div></td>
    <td style={{padding:9}}>{i.agente}</td><td style={{padding:9}}><b>{i.cliente}</b><div style={{color:"#64748b"}}>{i.fattura}</div></td>
    <td style={{padding:9}}>{i.pod_pdr}</td><td style={{padding:9,fontWeight:900,whiteSpace:"nowrap"}}>{euro(i.importo)}</td>
    {(["avvertito","pagato"] as const).map(f=><td key={f} style={{padding:8}}><button disabled={busy} onClick={()=>void update(i,f,String(!i[f]))} style={{...css,background:i[f]?"#dcfce7":"white",color:i[f]?"#166534":"#334155",borderColor:i[f]?"#86efac":"#cbd5e1"}}>{i[f]?"✓":"○"} {f.toUpperCase()}</button></td>)}
    <td style={{padding:8}}><button style={{...css,background:i.note?"#fef9c3":"white"}} onClick={()=>{setModal(i);setNote(i.note||"");}}>📝 NOTE {i.note?"✓":""}</button></td>
   </tr>)}</tbody></table>}
  </div>
  {modal&&<div style={{position:"fixed",inset:0,zIndex:10000,background:"#0f172a99",display:"grid",placeItems:"center",padding:16}} onClick={()=>setModal(null)}><div role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()} style={{background:"white",borderRadius:18,padding:22,width:"min(580px,100%)",boxSizing:"border-box"}}><h3>📝 NOTE — {modal.cliente}</h3><p>{modal.fattura} · {euro(modal.importo)}</p><textarea rows={7} value={note} onChange={e=>setNote(e.target.value)} style={{width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:10,padding:12}}/><div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}><button style={css} onClick={()=>setModal(null)}>ANNULLA</button><button disabled={busy} style={{...css,background:"#0f172a",color:"white"}} onClick={()=>void update(modal,"note",note)}>SALVA NOTE</button></div></div></div>}
 </div>;
}
