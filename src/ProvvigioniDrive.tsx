import React,{useEffect,useState} from "react";
import {listGoogleDriveFolder,getPresentationDriveConfig,setPresentationDriveFolder,listPresentationDrivePdfs,readPresentationDrivePdf,type GoogleDriveItem} from "./googleDrive";
import PdfEditor from "./PdfEditor";
const btn:React.CSSProperties={border:"1px solid #cbd5e1",background:"white",borderRadius:10,padding:"10px 13px",fontWeight:850,cursor:"pointer",color:"#0f172a"};
export default function ProvvigioniDrive(){
 const [config,setConfig]=useState<{folder_id:string|null;folder_name:string|null}|null>(null);
 const [items,setItems]=useState<GoogleDriveItem[]>([]),[browse,setBrowse]=useState(false),[stack,setStack]=useState<{id:string;name:string}[]>([]),[folders,setFolders]=useState<GoogleDriveItem[]>([]);
 const [selected,setSelected]=useState<GoogleDriveItem|null>(null),[pdf,setPdf]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=async()=>{setError("");const cfg=await getPresentationDriveConfig();setConfig(cfg);if(cfg.folder_id){const result=await listPresentationDrivePdfs();setItems(result.items||[]);}else setItems([]);};
 useEffect(()=>{void load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const browseFolder=async(id:string,name:string,nextStack?:{id:string;name:string}[])=>{setBusy(true);setError("");try{const result=await listGoogleDriveFolder(id);setFolders((result.items||[]).filter(x=>x.is_folder));setStack(nextStack||[...stack,{id,name:result.folder.name||name}]);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const choose=async()=>{const folder=stack[stack.length-1];if(!folder)return;setBusy(true);setError("");try{await setPresentationDriveFolder(folder.id);setBrowse(false);setSelected(null);setPdf("");await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const open=async(item:GoogleDriveItem)=>{setBusy(true);setError("");try{const value=await readPresentationDrivePdf(item.id);setSelected(item);setPdf(value);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <div style={{display:"grid",gap:13}}>
  <div style={{padding:15,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
   <div><strong>📁 CARTELLA GOOGLE DRIVE</strong><div style={{fontSize:13,color:"#475569",marginTop:5}}>{config?.folder_name||"Nessuna cartella selezionata"} · PDF sincronizzati quando apri la scheda o premi Aggiorna</div></div>
   <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button style={btn} disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>↻ AGGIORNA DA DRIVE</button><button style={{...btn,background:"#2563eb",color:"white"}} disabled={busy} onClick={()=>{setBrowse(true);void browseFolder("root","Il mio Drive",[{id:"root",name:"Il mio Drive"}]);}}>📂 SCEGLI CARTELLA</button></div>
  </div>
  {error&&<div role="alert" style={{color:"#b91c1c",fontWeight:750}}>{error}</div>}
  {loading&&<p>Caricamento Google Drive…</p>}
  {browse&&<div style={{padding:14,borderRadius:14,border:"2px solid #93c5fd",background:"white"}}>
   <strong>SELEZIONA CARTELLA PRESENTAZIONI</strong>
   <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",margin:"12px 0"}}>
    <button style={btn} disabled={busy||stack.length<=1} onClick={()=>{const next=stack.slice(0,-1);const target=next[next.length-1];if(target)void browseFolder(target.id,target.name,next);}}>← INDIETRO</button>
    <span style={{fontWeight:750}}>{stack.map(x=>x.name).join(" / ")}</span>
   </div>
   <div style={{display:"grid",gap:7}}>{folders.map(f=><button key={f.id} style={{...btn,textAlign:"left"}} disabled={busy} onClick={()=>void browseFolder(f.id,f.name)}>📁 {f.name} →</button>)}</div>
   {!folders.length&&<p style={{color:"#64748b"}}>Nessuna sottocartella presente.</p>}
   <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}><button style={{...btn,background:"#16a34a",color:"white"}} disabled={busy} onClick={()=>void choose()}>✓ USA QUESTA CARTELLA</button><button style={btn} onClick={()=>setBrowse(false)}>ANNULLA</button></div>
  </div>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,290px),1fr))",gap:14,alignItems:"start"}}>
   <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:14,padding:14}}>
    <h3 style={{marginTop:0}}>PDF DA DRIVE ({items.length})</h3>
    {!items.length&&<p style={{color:"#64748b"}}>{config?.folder_id?"Nessun PDF nella cartella selezionata.":"Scegli una cartella per visualizzare i PDF."}</p>}
    <div style={{display:"grid",gap:8}}>{items.map(item=><button key={item.id} type="button" disabled={busy} onClick={()=>void open(item)} style={{...btn,textAlign:"left",background:selected?.id===item.id?"#fff7ed":"#f8fafc",border:selected?.id===item.id?"2px solid #f97316":"1px solid #e2e8f0",overflowWrap:"anywhere"}}>
      📄 {item.name}<div style={{fontSize:12,color:"#64748b",marginTop:5}}>{item.modified_time?new Date(item.modified_time).toLocaleDateString("it-IT"):""} · 👁 VISUALIZZA</div>
    </button>)}</div>
   </div>
   <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:14,padding:12,minWidth:0}}>
    {selected&&pdf?<PdfEditor key={selected.id+"-"+selected.modified_time} base64={pdf} documentId={0} driveFileId={selected.id} filename={selected.name}/>:<div style={{minHeight:280,display:"grid",placeItems:"center",color:"#64748b",textAlign:"center"}}>{busy?"Caricamento PDF…":"Seleziona un PDF da Google Drive."}</div>}
   </div>
  </div>
 </div>;
}
