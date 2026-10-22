import React,{useEffect,useRef,useState} from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {supabase} from "./supabase";
import {getAdminSessionToken} from "./adminSecurity";
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorker;
type Mark={kind:"pen"|"highlight"|"text";points?:number[][];x:number;y:number;w?:number;h?:number;text?:string;color:string};
type Marks=Record<string,Mark[]>;
type Props={base64:string;documentId:number;filename:string};
const toolButton:React.CSSProperties={border:"1px solid #cbd5e1",borderRadius:10,padding:"10px 12px",background:"white",fontWeight:800,color:"#0f172a",cursor:"pointer"};
export default function PdfEditor({base64,documentId,filename}:Props){
 const [pdf,setPdf]=useState<any>(null),[pages,setPages]=useState<number[]>([]),[zoom,setZoom]=useState(100),[tool,setTool]=useState<"move"|"magnify"|"pen"|"highlight"|"text">("move"),[marks,setMarks]=useState<Marks>({}),[dirty,setDirty]=useState(false),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [full,setFull]=useState(false);
 const [lens,setLens]=useState<{page:number;x:number;y:number;screenX:number;screenY:number}|null>(null);
 const lensCanvas=useRef<HTMLCanvasElement|null>(null);
 const [draft,setDraft]=useState<{page:number;mark:Mark}|null>(null);
 const pdfRef=useRef<any>(null),marksRef=useRef<Marks>({}),canvasRefs=useRef<Record<number,HTMLCanvasElement|null>>({});
 const changeMarks=(value:Marks)=>{marksRef.current=value;setMarks(value);setDirty(true);};
 useEffect(()=>{let cancelled=false;let task:any;setPdf(null);setPages([]);setStatus("");setDirty(false);setMarks({});marksRef.current={};
 (async()=>{try{
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  task=pdfjs.getDocument({data:bytes});
  const loaded=await task.promise;
  if(cancelled)return;
  pdfRef.current=loaded;setPdf(loaded);setPages(Array.from({length:loaded.numPages},(_,i)=>i+1));
  const token=await getAdminSessionToken();
  const {data,error}=await supabase.rpc("provvigioni_presentazioni_annotations_get",{p_session_token:token,p_id:documentId});
  if(error)throw error;
  if(!cancelled){const saved=data&&typeof data==="object"?data:{};marksRef.current=saved;setMarks(saved);}
 }catch(e:any){if(!cancelled)setStatus("Errore PDF: "+e.message);}})();
 return()=>{cancelled=true;pdfRef.current=null;try{void task?.destroy();}catch{}};
 },[base64,documentId]);
 useEffect(()=>{if(!pdf)return;let cancelled=false;const tasks:any[]=[];
 (async()=>{for(const pageNumber of pages){
  if(cancelled)return;
  const canvas=canvasRefs.current[pageNumber];if(!canvas)continue;
  const page=await pdf.getPage(pageNumber);if(cancelled)return;
  const viewport=page.getViewport({scale:1.25*zoom/100});
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const ctx=canvas.getContext("2d");if(!ctx)continue;
  const task=page.render({canvasContext:ctx,viewport});tasks.push(task);
  try{await task.promise;}catch(e:any){if(e?.name!=="RenderingCancelledException")setStatus(String(e.message||e));}
 }
 })();
 return()=>{cancelled=true;tasks.forEach(t=>{try{t.cancel();}catch{}});};
 },[pdf,pages,zoom]);
 useEffect(()=>{if(!lens||!lensCanvas.current)return;const source=canvasRefs.current[lens.page];const target=lensCanvas.current;if(!source)return;const ctx=target.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,280,280);const sx=lens.x*source.width,sy=lens.y*source.height;const sample=130;ctx.fillStyle="white";ctx.fillRect(0,0,280,280);ctx.drawImage(source,Math.max(0,sx-sample/2),Math.max(0,sy-sample/2),Math.min(sample,source.width-Math.max(0,sx-sample/2)),Math.min(sample,source.height-Math.max(0,sy-sample/2)),0,0,280,280);},[lens]);
 const save=async()=>{setBusy(true);setStatus("");try{const token=await getAdminSessionToken();const {error}=await supabase.rpc("provvigioni_presentazioni_annotations_save",{p_session_token:token,p_id:documentId,p_annotazioni:marksRef.current});if(error)throw error;setDirty(false);setStatus("Annotazioni salvate.");}catch(e:any){setStatus("Errore salvataggio: "+e.message);}finally{setBusy(false);}};
 const start=(event:React.PointerEvent<SVGSVGElement>,page:number)=>{
  if(tool==="move"||tool==="magnify")return;
  const bounds=event.currentTarget.getBoundingClientRect();const x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
  if(tool==="text"){const value=window.prompt("Testo da inserire nel PDF:");if(value?.trim()){const item:Mark={kind:"text",x,y,text:value.trim(),color:"#b91c1c"};changeMarks({...marksRef.current,[page]:[...(marksRef.current[page]||[]),item]});}return;}
  event.currentTarget.setPointerCapture(event.pointerId);
  const item:Mark=tool==="pen"?{kind:"pen",x,y,points:[[x,y]],color:"#dc2626"}:{kind:"highlight",x,y,w:0,h:0,color:"#fde047"};
  setDraft({page,mark:item});
 };
 const move=(event:React.PointerEvent<SVGSVGElement>,page:number)=>{
  if(tool==="magnify"){
   const bounds=event.currentTarget.getBoundingClientRect();
   setLens({page,x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height)),screenX:event.clientX,screenY:event.clientY});
   return;
  }
  if(!draft||draft.page!==page)return;
  const bounds=event.currentTarget.getBoundingClientRect();const x=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y=Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height));
  setDraft(d=>!d?null:{...d,mark:d.mark.kind==="pen"?{...d.mark,points:[...(d.mark.points||[]),[x,y]]}:{...d.mark,w:x-d.mark.x,h:y-d.mark.y}});
 };
 const finish=()=>{if(!draft)return;const {page,mark}=draft;changeMarks({...marksRef.current,[page]:[...(marksRef.current[page]||[]),mark]});setDraft(null);};
 const draw=(mark:Mark,index:number)=>{
  if(mark.kind==="pen")return <polyline key={index} points={(mark.points||[]).map(p=>p[0]*1000+","+(p[1]*1000)).join(" ")} fill="none" stroke={mark.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>;
  if(mark.kind==="highlight")return <rect key={index} x={Math.min(mark.x,mark.x+(mark.w||0))*1000} y={Math.min(mark.y,mark.y+(mark.h||0))*1000} width={Math.abs(mark.w||0)*1000} height={Math.abs(mark.h||0)*1000} fill={mark.color} opacity=".42"/>;
  return <text key={index} x={mark.x*1000} y={mark.y*1000} fill={mark.color} fontSize="25" fontWeight="bold">{mark.text}</text>;
 };
 return <div style={{display:"grid",gap:12,...(full?{position:"fixed" as const,inset:0,zIndex:30000,background:"#f8fafc",padding:10,overflow:"hidden",gridTemplateRows:"auto auto minmax(0,1fr) auto"}:{})}}>
  {full?<div style={{display:"flex",alignItems:"center",gap:5,padding:"7px 5px",background:"#172235",borderRadius:12,overflow:"hidden",minWidth:0}}>
    {([
      {id:"magnify",symbol:"🔎",name:"Lente 2×",color:"#38bdf8"},
      {id:"pen",symbol:"🖍️",name:"Penna",color:"#fb7185"},
      {id:"highlight",symbol:"🖊️",name:"Evidenzia",color:"#fde047"},
      {id:"undo",symbol:"↶",name:"Annulla",color:"#c4b5fd"},
      {id:"text",symbol:"𝐓",name:"Scrivi",color:"#fbbf24"},
      {id:"move",symbol:"✋",name:"Sposta",color:"#7dd3fc"},
      {id:"save",symbol:"💾",name:"Salva",color:"#86efac"}
    ] as const).map(item=><button key={item.id} type="button" title={item.name} aria-label={item.name}
      disabled={(item.id==="save"&&(!dirty||busy))}
      onClick={()=>{if(item.id==="save"){void save();return;}if(item.id==="undo"){const last=[...pages].reverse().find(p=>(marksRef.current[p]||[]).length>0);if(last)changeMarks({...marksRef.current,[last]:marksRef.current[last].slice(0,-1)});return;}setTool(item.id);setLens(null);}}
      style={{flex:"1 1 0",minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"7px 1px",borderRadius:9,border:tool===item.id?"2px solid #f97316":"1px solid #475569",background:tool===item.id?"#334155":"#24344c",cursor:"pointer",opacity:item.id==="save"&&(!dirty||busy)?.5:1}}>
      <span aria-hidden="true" style={{fontSize:"clamp(16px,4.4vw,23px)",lineHeight:1.15,color:item.color,fontWeight:900}}>{item.symbol}</span>
      <span style={{fontSize:"clamp(8px,2vw,11px)",fontWeight:800,color:"#ffffff",whiteSpace:"nowrap"}}>{item.name}</span>
    </button>)}
    <button type="button" title="Chiudi schermo intero" aria-label="Chiudi schermo intero" onClick={()=>{setFull(false);setLens(null);}}
      style={{border:0,borderRadius:9,background:"#7f1d1d",color:"white",fontSize:20,fontWeight:900,padding:"9px 7px",flex:"0 0 auto",cursor:"pointer"}}>×</button>
   </div>:<div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",padding:12,background:"#f1f5f9",borderRadius:12}}>
    <strong style={{flex:"1 1 190px",overflowWrap:"anywhere"}}>📄 {filename} · {pages.length} pagine</strong>
    <button style={{...toolButton,background:"#f97316",color:"white"}} onClick={()=>{setFull(true);setLens(null);}}>⛶ APRI A SCHERMO INTERO</button>
    <button style={toolButton} onClick={()=>setZoom(v=>Math.max(50,v-25))}>−</button><strong>{zoom}%</strong><button style={toolButton} onClick={()=>setZoom(v=>Math.min(200,v+25))}>＋</button>
    {([["move","✋ SPOSTA"],["magnify","🔎 LENTE 2×"],["pen","🖍️ DISEGNA"],["highlight","🟨 EVIDENZIA"],["text","🔤 SCRIVI"]] as const).map(([id,title])=><button key={id} onClick={()=>setTool(id)} style={{...toolButton,background:tool===id?"#0f172a":"white",color:tool===id?"white":"#0f172a"}}>{title}</button>)}
    <button style={toolButton} onClick={()=>{const last=[...pages].reverse().find(p=>(marksRef.current[p]||[]).length>0);if(last)changeMarks({...marksRef.current,[last]:marksRef.current[last].slice(0,-1)});}}>↶ ANNULLA</button>
    <button disabled={!dirty||busy} onClick={()=>void save()} style={{...toolButton,background:"#16a34a",color:"white",opacity:!dirty||busy?.55:1}}>💾 SALVA</button>
   </div>}
  {status&&<p role="status" style={{fontWeight:700,color:status.startsWith("Errore")?"#b91c1c":"#15803d"}}>{status}</p>}
  <div style={{height:full?"100%":"min(75vh,980px)",minHeight:full?0:450,overflow:"auto",background:"#cbd5e1",padding:12,borderRadius:12}}>
   {pages.map(page=><div key={page} style={{position:"relative",width:"fit-content",maxWidth:"none",margin:"0 auto 18px",background:"white",boxShadow:"0 3px 14px #0f172a30"}}>
    <canvas ref={node=>{canvasRefs.current[page]=node;}} style={{display:"block",maxWidth:"none"}}/>
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={e=>start(e,page)} onPointerMove={e=>move(e,page)} onPointerUp={finish} onPointerCancel={()=>{setDraft(null);setLens(null);}} onPointerLeave={()=>setLens(null)}
     style={{position:"absolute",inset:0,width:"100%",height:"100%",touchAction:tool==="move"?"auto":"none",pointerEvents:tool==="move"?"none":"auto",cursor:tool==="magnify"?"zoom-in":tool==="move"?"default":"crosshair"}}>
     {(marks[page]||[]).map(draw)}{draft?.page===page&&draw(draft.mark,-1)}
    </svg>
    <div style={{position:"absolute",bottom:8,right:8,background:"#0f172acb",color:"white",borderRadius:8,padding:"3px 8px",fontSize:12,pointerEvents:"none"}}>Pagina {page}</div>
   </div>)}
   {tool==="magnify"&&lens&&<div style={{position:"fixed",left:Math.min(lens.screenX+22,window.innerWidth-296),top:Math.max(12,Math.min(lens.screenY-300,window.innerHeight-296)),width:280,height:280,border:"4px solid #f97316",borderRadius:"50%",overflow:"hidden",pointerEvents:"none",boxShadow:"0 8px 25px #0006",zIndex:31000,background:"white"}}><canvas ref={lensCanvas} width={280} height={280} style={{width:280,height:280}}/></div>}
   {!pdf&&<p style={{textAlign:"center",padding:30}}>Caricamento pagine PDF…</p>}
  </div>
  <p style={{fontSize:12,color:"#64748b"}}>Disegni, evidenziazioni e testi sono salvati separatamente dal PDF originale e visibili riaprendo il documento. Tocca SALVA ANNOTAZIONI prima di uscire.</p>
 </div>;
}
