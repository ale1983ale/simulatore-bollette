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
 const [lensScale,setLensScale]=useState(2);
 const [penColor,setPenColor]=useState("#111827");
 const [highlightColor,setHighlightColor]=useState("#fde047");
 const [menu,setMenu]=useState<"magnify"|"pen"|"highlight"|null>(null);
 const [lens,setLens]=useState<{page:number;x:number;y:number;screenX:number;screenY:number}|null>(null);
 const lensCanvas=useRef<HTMLCanvasElement|null>(null);
 const viewerRef=useRef<HTMLDivElement|null>(null);
 const [viewerWidth,setViewerWidth]=useState(0);
 useEffect(()=>{const el=viewerRef.current;if(!el)return;const update=()=>setViewerWidth(Math.max(200,el.clientWidth-24));update();const observer=new ResizeObserver(update);observer.observe(el);window.addEventListener("resize",update);return()=>{observer.disconnect();window.removeEventListener("resize",update);};},[full,pages.length]);
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
  const base=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:Math.max(0.1,(viewerWidth||base.width)/base.width)});
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const ctx=canvas.getContext("2d");if(!ctx)continue;
  const task=page.render({canvasContext:ctx,viewport});tasks.push(task);
  try{await task.promise;}catch(e:any){if(e?.name!=="RenderingCancelledException")setStatus(String(e.message||e));}
 }
 })();
 return()=>{cancelled=true;tasks.forEach(t=>{try{t.cancel();}catch{}});};
 },[pdf,pages,viewerWidth]);
 useEffect(()=>{if(!lens||!lensCanvas.current)return;const source=canvasRefs.current[lens.page];const target=lensCanvas.current;if(!source)return;const ctx=target.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,280,280);const sx=lens.x*source.width,sy=lens.y*source.height;const sample=260/lensScale;ctx.fillStyle="white";ctx.fillRect(0,0,280,280);ctx.drawImage(source,Math.max(0,sx-sample/2),Math.max(0,sy-sample/2),Math.min(sample,source.width-Math.max(0,sx-sample/2)),Math.min(sample,source.height-Math.max(0,sy-sample/2)),0,0,280,280);},[lens]);
 const save=async()=>{setBusy(true);setStatus("");try{const token=await getAdminSessionToken();const {error}=await supabase.rpc("provvigioni_presentazioni_annotations_save",{p_session_token:token,p_id:documentId,p_annotazioni:marksRef.current});if(error)throw error;setDirty(false);setStatus("Annotazioni salvate.");}catch(e:any){setStatus("Errore salvataggio: "+e.message);}finally{setBusy(false);}};
 const start=(event:React.PointerEvent<SVGSVGElement>,page:number)=>{
  if(tool==="move"||tool==="magnify")return;
  const bounds=event.currentTarget.getBoundingClientRect();const x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
  if(tool==="text"){const value=window.prompt("Testo da inserire nel PDF:");if(value?.trim()){const item:Mark={kind:"text",x,y,text:value.trim(),color:"#b91c1c"};changeMarks({...marksRef.current,[page]:[...(marksRef.current[page]||[]),item]});}return;}
  event.currentTarget.setPointerCapture(event.pointerId);
  const item:Mark=tool==="pen"?{kind:"pen",x,y,points:[[x,y]],color:penColor}:{kind:"highlight",x,y,w:0,h:0,color:highlightColor};
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
 return <div style={{display:"grid",gap:12,...(full?{position:"fixed" as const,inset:0,zIndex:30000,background:"#f8fafc",padding:"max(10px, env(safe-area-inset-top, 10px)) 10px max(12px, env(safe-area-inset-bottom, 12px))",overflow:"hidden",gridTemplateRows:"auto auto minmax(0,1fr) auto"}:{})}}>
  <div style={{display:"flex",alignItems:"center",gap:6,padding:full?"6px 7px":"10px",background:full?"#172235":"#f1f5f9",borderRadius:12,minWidth:0,position:"relative",flexDirection:"column"}}>
    {!full&&<div style={{display:"flex",width:"100%",alignItems:"center",gap:8,justifyContent:"space-between",minWidth:0}}>
      <strong style={{fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>📄 {filename} · {pages.length} pagine</strong>
      <button type="button" style={{...toolButton,background:"#f97316",color:"white",padding:"9px 12px",flex:"0 0 auto"}} onClick={()=>{setFull(true);setMenu(null);setLens(null);}}>⛶</button>
    </div>}


    <div style={{display:"grid",width:"100%",gridTemplateColumns:full?"repeat(7,minmax(0,1fr))":"repeat(4,minmax(0,1fr))",gap:full?5:8,alignItems:"center"}}>
      {([
       {id:"magnify",symbol:"🔎",name:"Lente",color:"#38bdf8"},
       {id:"pen",symbol:"🖊",name:"Pennarello",color:penColor},
       {id:"highlight",symbol:"🖍",name:"Evidenziatore",color:highlightColor},
       {id:"text",symbol:"T",name:"Scrivi",color:"#fbbf24"},
       {id:"undo",symbol:"↶",name:"Annulla",color:"#c4b5fd"},
       {id:"move",symbol:"✋",name:"Sposta",color:"#7dd3fc"},
       {id:"save",symbol:"💾",name:"Salva",color:"#86efac"}
      ] as const).map(item=><div key={item.id} style={{position:"relative",minWidth:0}}>
       <button type="button" title={item.name} aria-label={item.name} disabled={item.id==="save"&&(!dirty||busy)}
        onClick={()=>{setMenu(null);if(item.id==="save"){void save();return;}if(item.id==="undo"){const last=[...pages].reverse().find(p=>(marksRef.current[p]||[]).length>0);if(last)changeMarks({...marksRef.current,[last]:marksRef.current[last].slice(0,-1)});return;}setTool(item.id);setLens(null);}}
        style={{width:"100%",minWidth:0,height:full?43:46,borderRadius:9,border:tool===item.id?"2px solid #f97316":full?"1px solid #475569":"1px solid #cbd5e1",background:tool===item.id?(full?"#334155":"#ffedd5"):(full?"#24344c":"white"),cursor:"pointer",opacity:item.id==="save"&&(!dirty||busy)?.45:1,padding:"3px 1px",position:"relative"}}>
        {item.id==="highlight"?<svg aria-hidden="true" viewBox="0 0 24 24" width={full?26:23} height={full?26:23} style={{transform:"rotate(-35deg)"}}><path d="M7 2h10v13H7z" fill={highlightColor} stroke="#475569" strokeWidth="1.3"/><path d="M7 15h10l-2 4H9z" fill="#64748b"/><path d="M9 19h6l-1 3h-4z" fill={highlightColor}/><path d="M9 5h6" stroke="#fff" strokeWidth="1.4"/></svg>:item.id==="pen"?<svg aria-hidden="true" viewBox="0 0 24 24" width={full?26:23} height={full?26:23} style={{transform:"rotate(35deg)"}}><path d="M8 2h8v16H8z" fill={penColor} stroke={penColor==="#111827"?"#f8fafc":"#334155"} strokeWidth="1.2"/><path d="M8 18h8l-4 5z" fill="#e2e8f0"/><path d="M10 5h4" stroke="#fff" strokeWidth="1.4"/></svg>:<span aria-hidden="true" style={{fontSize:full?"clamp(18px,4.5vw,25px)":"20px",lineHeight:1.1,color:item.color,fontWeight:900}}>{item.symbol}</span>}
       </button>
       {(item.id==="magnify"||item.id==="pen"||item.id==="highlight")&&<button type="button" aria-label={"Opzioni "+item.name} title={"Opzioni "+item.name}
         onClick={()=>setMenu(m=>m===item.id?null:item.id)} style={{position:"absolute",top:0,right:0,border:0,borderRadius:6,background:"#f97316",color:"white",fontSize:11,fontWeight:900,lineHeight:"15px",width:17,height:17,cursor:"pointer",padding:0}}>⌄</button>}
      </div>)}
    </div>
    {full?<button type="button" aria-label="Chiudi schermo intero" onClick={()=>{setFull(false);setMenu(null);setLens(null);}} style={{position:"absolute",right:4,top:-4,background:"#7f1d1d",color:"white",border:0,borderRadius:8,height:26,width:26,fontWeight:900,fontSize:18,cursor:"pointer",zIndex:2}}>×</button>:null}
    {menu&&<div style={{position:"relative",alignSelf:"stretch",width:"100%",zIndex:32000,background:"white",border:"1px solid #cbd5e1",borderRadius:12,padding:10,boxShadow:"0 8px 25px #0003",minWidth:190}}>
     <div style={{fontSize:12,fontWeight:900,marginBottom:7,color:"#0f172a"}}>{menu==="magnify"?"INGRANDIMENTO LENTE":menu==="pen"?"COLORE PENNARELLO":"COLORE EVIDENZIATORE"}</div>
     <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {menu==="magnify"?([1.5,2,3,5] as const).map(v=><button key={v} type="button" onClick={()=>{setLensScale(v);setTool("magnify");setMenu(null);}} style={{...toolButton,padding:"8px",background:lensScale===v?"#ffedd5":"white",borderColor:lensScale===v?"#f97316":"#cbd5e1"}}>{v}×</button>):
      (menu==="pen"?[{name:"Rosso",hex:"#dc2626"},{name:"Nero",hex:"#111827"},{name:"Blu",hex:"#2563eb"}]:[{name:"Giallo",hex:"#fde047"},{name:"Arancione",hex:"#fb923c"},{name:"Verde",hex:"#86efac"}]).map(opt=><button key={opt.hex} type="button" title={opt.name} aria-label={opt.name} onClick={()=>{if(menu==="pen"){setPenColor(opt.hex);setTool("pen");}else{setHighlightColor(opt.hex);setTool("highlight");}setMenu(null);}} style={{...toolButton,padding:6,background:opt.hex,width:38,height:36,border:(menu==="pen"?penColor:highlightColor)===opt.hex?"3px solid #f97316":"1px solid #94a3b8"}}/>)
      }
     </div>
    </div>}
   </div>
  {status&&<p role="status" style={{fontWeight:700,color:status.startsWith("Errore")?"#b91c1c":"#15803d"}}>{status}</p>}
  <div ref={viewerRef} style={{height:full?"100%":"min(75vh,980px)",minHeight:full?0:450,overflow:"auto",background:"#cbd5e1",padding:12,borderRadius:12}}>
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
