import React,{useEffect,useRef,useState} from "react";
import {supabase} from "./supabase";
import {getAdminSessionToken} from "./adminSecurity";
import PdfEditor from "./PdfEditor";

type Document={id:number;nome:string;dimensione_bytes:number;creato_il:string};
const button:React.CSSProperties={padding:"10px 14px",borderRadius:10,border:"1px solid #cbd5e1",background:"white",color:"#0f172a",fontWeight:800,cursor:"pointer"};
const toBase64=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Lettura PDF non riuscita"));reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.readAsDataURL(file);});
export default function ProvvigioniPresentazione(){
 const [documents,setDocuments]=useState<Document[]>([]),[selected,setSelected]=useState<number|null>(null),[url,setUrl]=useState(""),[pdfBase64,setPdfBase64]=useState(""),[zoom,setZoom]=useState(100),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const objectUrl=useRef("");
 const clearUrl=()=>{if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current="";}setUrl("");setPdfBase64("");};
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 const list=async()=>{const token=await getAdminSessionToken();const {data,error:e}=await supabase.rpc("provvigioni_presentazioni_list",{p_session_token:token});if(e)throw e;setDocuments(Array.isArray(data)?data:[]);};
 useEffect(()=>{void list().catch(e=>setError(e.message));},[]);
 const open=async(id:number)=>{setBusy(true);setError("");clearUrl();try{const token=await getAdminSessionToken();const {data,error:e}=await supabase.rpc("provvigioni_presentazioni_get",{p_session_token:token,p_id:id});if(e)throw e;const bytes=Uint8Array.from(atob(String(data)),c=>c.charCodeAt(0));const blob=new Blob([bytes],{type:"application/pdf"});objectUrl.current=URL.createObjectURL(blob);setUrl(objectUrl.current);setPdfBase64(String(data));setSelected(id);setZoom(100);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const upload=async(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(file.size>8388608){setError("Dimensione massima: 8 MB per PDF.");return;}setBusy(true);setError("");setNotice("");try{const head=new Uint8Array(await file.slice(0,5).arrayBuffer());if(String.fromCharCode(...head)!=="%PDF-")throw new Error("Seleziona un file PDF valido.");const token=await getAdminSessionToken();const b64=await toBase64(file);const {data,error:e}=await supabase.rpc("provvigioni_presentazioni_add",{p_session_token:token,p_nome:file.name,p_pdf_base64:b64});if(e)throw e;await list();setNotice("PDF caricato correttamente.");if(data)await open(Number(data));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const remove=async(doc:Document)=>{if(!window.confirm("Eliminare definitivamente "+doc.nome+"?"))return;setBusy(true);setError("");try{const token=await getAdminSessionToken();const {error:e}=await supabase.rpc("provvigioni_presentazioni_delete",{p_session_token:token,p_id:doc.id});if(e)throw e;if(selected===doc.id){setSelected(null);clearUrl();}await list();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const selectedName=documents.find(d=>d.id===selected)?.nome||"";
 return <div style={{display:"grid",gap:16}}>
  <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:16,padding:20,boxShadow:"0 4px 18px #0f172a0b"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
    <div><h2 style={{margin:"0 0 6px",color:"#0f172a"}}>📑 PRESENTAZIONE</h2><p style={{margin:0,color:"#64748b"}}>Archivio PDF riservato al super admin. Carica e consulta i documenti direttamente qui.</p></div>
    <label style={{...button,background:"#f97316",color:"white",border:0,display:"inline-flex",alignItems:"center",gap:8,cursor:busy?"wait":"pointer"}}>＋ CARICA PDF<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={upload} style={{display:"none"}}/></label>
   </div>
   {error&&<p role="alert" style={{color:"#b91c1c",fontWeight:700}}>{error}</p>}
   {notice&&<p role="status" style={{color:"#15803d"}}>{notice}</p>}
   <p style={{color:"#64748b",fontSize:12,marginBottom:0}}>Dimensione massima 8 MB per documento. I file sono conservati nell'archivio protetto Supabase.</p>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:16,alignItems:"start"}}>
   <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:14,padding:14}}>
    <h3 style={{marginTop:0}}>DOCUMENTI ({documents.length})</h3>
    {documents.length===0&&<p style={{color:"#64748b"}}>Nessun PDF caricato.</p>}
    <div style={{display:"grid",gap:8}}>{documents.map(d=><div key={d.id} style={{padding:12,borderRadius:11,border:selected===d.id?"2px solid #f97316":"1px solid #e2e8f0",background:selected===d.id?"#fff7ed":"#f8fafc"}}>
     <div style={{fontWeight:850,overflowWrap:"anywhere"}}>📄 {d.nome}</div>
     <div style={{color:"#64748b",fontSize:12,margin:"5px 0 10px"}}>{(d.dimensione_bytes/1048576).toFixed(2)} MB · {new Date(d.creato_il).toLocaleDateString("it-IT")}</div>
     <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={{...button,background:"#0f172a",color:"white"}} disabled={busy} onClick={()=>void open(d.id)}>👁 VISUALIZZA</button><button style={{...button,color:"#b91c1c"}} disabled={busy} onClick={()=>void remove(d)}>ELIMINA</button></div>
    </div>)}</div>
   </div>
   <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:14,padding:14,minWidth:0}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:12}}>
     <strong style={{overflowWrap:"anywhere"}}>{selectedName||"ANTEPRIMA PDF"}</strong>
     {url&&<a href={url} target="_blank" rel="noopener noreferrer" style={{...button,textDecoration:"none"}}>↗ APRI ORIGINALE</a>}
    </div>
    {pdfBase64&&selected!==null?<PdfEditor key={selected} base64={pdfBase64} documentId={selected} filename={selectedName}/>:<div style={{minHeight:360,display:"grid",placeItems:"center",background:"#f8fafc",borderRadius:12,color:"#64748b",textAlign:"center",padding:20}}>{busy?"Caricamento PDF…":"Seleziona un documento per visualizzarlo qui."}</div>}
   </div>
  </div>
 </div>;
}
