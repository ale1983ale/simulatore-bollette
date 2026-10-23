import { confirmAction } from "./confirmAction";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RecruitingContext } from "./recruitingClient";

export type TodoDraft = {
  title: string; dueDate?: string; dueTime?: string; body?: string;
  linkedKind?: "candidate" | "agent"; linkedId?: string; linkedName?: string; sourceKey?: string;
};
type TodoAttachment = {name:string;type:string;data:string;path?:string};
type Todo = {
  id: string; title: string; due_date: string | null; due_time: string | null;
  linked_kind: "candidate" | "agent" | null; linked_id: string | null;
  linked_name: string; body: string; priority: boolean; completed: boolean;
  created_at: string; source_key: string | null; attachments: TodoAttachment[];
};
type ContactOption = { id: string; name: string; kind: "candidate" | "agent" };
const empty: TodoDraft = { title: "", dueDate: "", dueTime: "", body: "" };
const field: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 9, boxSizing: "border-box", font: "inherit" };
const linkStyle: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:6, padding:"7px 11px", borderRadius:999, border:"1px solid #bfdbfe", background:"linear-gradient(135deg,#eff6ff,#f0f9ff)", color:"#1d4ed8", fontWeight:850, fontSize:12, cursor:"pointer", boxShadow:"0 1px 3px rgba(37,99,235,.08)" };
const action: React.CSSProperties = { padding: "10px 14px", borderRadius: 14, border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 800, background: "white" };

export default function RecruitingTodos({ ctx, contacts, draft, onDraftConsumed, visible, onOpenLinkedContact }: {
  ctx: RecruitingContext | null; contacts: ContactOption[]; draft: TodoDraft | null;
  onDraftConsumed: () => void; visible: boolean;
  onOpenLinkedContact?: (kind: "candidate" | "agent", id: string) => void;
}) {
  const [items, setItems] = useState<Todo[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<TodoDraft>(empty);
  const [priority, setPriority] = useState(false);
  const [todoFiles,setTodoFiles]=useState<TodoAttachment[]>([]);
  const [pendingTodoFiles,setPendingTodoFiles]=useState<File[]>([]);
  const [previewFile,setPreviewFile]=useState<TodoAttachment|null>(null);
  const [previewUrl,setPreviewUrl]=useState<string|null>(null);
  const openAttachment=async(file:TodoAttachment)=>{
    try{
      const response=file.path&&ctx ? null : await fetch(file.data);
      const blob=file.path&&ctx ? (await ctx.client.storage.from("recruiting-todo-files").download(file.path)).data : await response!.blob();
      if(!blob)throw Error("File non disponibile");
      const url=URL.createObjectURL(blob);
      setPreviewUrl(current=>{if(current)URL.revokeObjectURL(current);return url;});
      setPreviewFile(file);
    }catch(error:any){setMessage("Impossibile aprire l'allegato: "+(error?.message||"file non leggibile"));}
  };
  const closeAttachment=()=>{
    setPreviewFile(null);
    setPreviewUrl(current=>{if(current)URL.revokeObjectURL(current);return null;});
  };

  const todoFileInputRef=useRef<HTMLInputElement|null>(null);
  const [todoUploading,setTodoUploading]=useState(false);
  const addTodoFiles=async(files:File[])=>{
    if(!files.length){setMessage("Nessun file ricevuto da Android.");return;}
    const count=todoFiles.length+pendingTodoFiles.length+files.length;
    if(count>5){setMessage("Massimo 5 allegati.");return;}
    const tooLarge=files.find(file=>file.size>10*1024*1024);
    if(tooLarge){setMessage(tooLarge.name+" supera 10 MB.");return;}
    setPendingTodoFiles(current=>[...current,...files]);
    setMessage("✓ Allegati pronti. Premi SALVA per caricarli.");
  };
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [calendarTodo, setCalendarTodo] = useState<Todo | null>(null);
  const [calendarDate, setCalendarDate] = useState("");
  const [calendarTime, setCalendarTime] = useState("");
  const [calendarType, setCalendarType] = useState("ALTRO");
  const [calendarSaving, setCalendarSaving] = useState(false);

  const [subtab,setSubtab]=useState<"todo"|"diario">("todo");
  const [diaryItems,setDiaryItems]=useState<any[]>([]);
  const [diaryText,setDiaryText]=useState("");
  const [diaryLinked,setDiaryLinked]=useState("");
  const [diarySaving,setDiarySaving]=useState(false);
  const [diaryEditing,setDiaryEditing]=useState<string|null>(null);
  const [diaryPendingFiles,setDiaryPendingFiles]=useState<File[]>([]);
  const diaryFileInputRef=useRef<HTMLInputElement|null>(null);
  const [diarySearch,setDiarySearch]=useState("");
  const [diaryContactMenuOpen,setDiaryContactMenuOpen]=useState(false);
  const diaryContactMenuRef=useRef<HTMLDivElement|null>(null);
  const [diaryFiles,setDiaryFiles]=useState<Array<{name:string;type:string;data:string}>>([]);
  const [diaryUploading,setDiaryUploading]=useState(false);
  useEffect(()=>{if(!diaryContactMenuOpen)return;const close=(e:MouseEvent)=>{if(diaryContactMenuRef.current&&!diaryContactMenuRef.current.contains(e.target as Node))setDiaryContactMenuOpen(false);};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[diaryContactMenuOpen]);
  const diaryContacts=[...contacts].sort((a,b)=>a.name.localeCompare(b.name,"it",{sensitivity:"base"}));
  const diaryGroups=Object.values(diaryItems.reduce((acc:Record<string,{key:string;name:string;items:any[]}>,item:any)=>{
    const key=item.linked_kind&&item.linked_id?item.linked_kind+":"+item.linked_id:"generic";
    if(!acc[key])acc[key]={key,name:item.linked_name||"APPUNTI GENERICI",items:[]};
    acc[key].items.push(item);return acc;
  },{})).sort((a,b)=>a.name.localeCompare(b.name,"it",{sensitivity:"base"}));
  const addDiaryFiles=async(files:FileList|null)=>{
    if(!files?.length)return;
    const selected=Array.from(files);
    if(diaryFiles.length+diaryPendingFiles.length+selected.length>5){setMessage("Massimo 5 allegati.");return;}
    const oversized=selected.find(file=>file.size>10*1024*1024);
    if(oversized){setMessage(oversized.name+" supera 10 MB.");return;}
    setDiaryPendingFiles(current=>[...current,...selected]);
    setMessage("Allegati pronti: premi SALVA per caricarli.");
  };
  const startDiaryEdit=(item:any)=>{
    setDiaryEditing(item.id);
    setDiaryText(item.body||"");
    setDiaryLinked(item.linked_kind&&item.linked_id?item.linked_kind+":"+item.linked_id:"");
    setDiaryFiles(Array.isArray(item.attachments)?item.attachments:[]);
    setDiaryPendingFiles([]);
    setMessage("");
    setTimeout(()=>document.getElementById("diary-note-"+item.id)?.scrollIntoView({behavior:"smooth",block:"center"}),80);
  };
  const cancelDiaryEdit=()=>{
    setDiaryEditing(null);setDiaryText("");setDiaryLinked("");setDiaryFiles([]);setDiaryPendingFiles([]);setMessage("");
  };

  const loadDiary=useCallback(async()=>{
    if(!ctx)return;
    const {data,error}=await ctx.client.from("recruiting_diary").select("*").eq("owner_key",ctx.ownerKey).order("created_at",{ascending:false});
    if(error)setMessage(error.message);else setDiaryItems(data||[]);
  },[ctx]);
  useEffect(()=>{if(visible&&subtab==="diario")void loadDiary();},[visible,subtab,loadDiary]);
  const saveDiary=async()=>{
    if(!ctx||diarySaving||(!diaryText.trim()&&!diaryFiles.length&&!diaryPendingFiles.length))return;
    setDiarySaving(true);setMessage("");
    const uploaded:string[]=[];
    try{
      const linked=contacts.find(c=>c.kind+":"+c.id===diaryLinked);
      const added:TodoAttachment[]=[];
      for(let i=0;i<diaryPendingFiles.length;i++){
        const file=diaryPendingFiles[i];
        setMessage("Caricamento allegato "+(i+1)+" di "+diaryPendingFiles.length+": "+file.name);
        const path=ctx.ownerKey+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const {error}=await ctx.client.storage.from("recruiting-todo-files").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
        if(error)throw Error(file.name+": "+error.message);
        uploaded.push(path);added.push({name:file.name,type:file.type||"application/octet-stream",data:"",path});
      }
      const payload={body:diaryText.trim(),linked_kind:linked?.kind||null,linked_id:linked?.id||null,linked_name:linked?.name||"",attachments:[...diaryFiles,...added]};
      const query=ctx.client.from("recruiting_diary");
      const {error}=diaryEditing
        ?await query.update(payload).eq("owner_key",ctx.ownerKey).eq("id",diaryEditing)
        :await query.insert({...payload,owner_key:ctx.ownerKey,completed:false});
      if(error)throw Error(error.message);
      cancelDiaryEdit();await loadDiary();
      setMessage("✓ Appunto e allegati salvati.");
    }catch(e:any){
      if(uploaded.length)await ctx.client.storage.from("recruiting-todo-files").remove(uploaded);
      setMessage("Salvataggio non riuscito: "+(e?.message||"Errore"));
    }finally{setDiarySaving(false);}
  };
  const diaryAction=async(item:any,kind:"done"|"delete")=>{
    if(!ctx)return;
    if(kind==="delete"&&!await confirmAction("Eliminare questo appunto dal diario?"))return;
    const q=ctx.client.from("recruiting_diary");
    const {error}=kind==="delete"?await q.delete().eq("owner_key",ctx.ownerKey).eq("id",item.id):await q.update({completed:!item.completed}).eq("owner_key",ctx.ownerKey).eq("id",item.id);
    if(error)setMessage(error.message);else await loadDiary();
  };
  const [showCompleted, setShowCompleted] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactMenuOpen,setContactMenuOpen]=useState(false);
  const contactMenuRef=useRef<HTMLDivElement|null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    title: "", dateFrom: "", dateTo: "", timeFrom: "", timeTo: "",
    contact: "", body: "", priority: "all", status: "pending"
  });
  const updateFilter = (key: keyof typeof filters, value: string) =>
    setFilters(current => ({ ...current, [key]: value }));
  const normalized = (value: string) => value.toLocaleLowerCase("it").trim();
  const filteredContacts = [...contacts]
    .filter(contact => normalized(contact.name).includes(normalized(contactSearch)))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
  const load = useCallback(async () => {
    if (!ctx) return;
    const { data, error } = await ctx.client.from("recruiting_todos").select("*").eq("owner_key", ctx.ownerKey).order("created_at", { ascending: true });
    if (error) setMessage(error.message);
    else setItems((data || []) as Todo[]);
  }, [ctx]);
  useEffect(() => { if (visible) void load(); }, [visible, load]);
  useEffect(() => {
    if (!draft) return;
    setForm(draft); setContactSearch(""); setPriority(false); setTodoFiles([]); setPendingTodoFiles([]); setEditing(null); setFormOpen(true); onDraftConsumed();
  }, [draft, onDraftConsumed]);
  const save = async () => {
    if (todoUploading || saving) return;
    if (!ctx || !form.title?.trim()) { setMessage("L'OGGETTO è obbligatorio."); return; }
    setSaving(true); setMessage("");
    const uploadedPaths:string[]=[];
    try{
      const newAttachments:TodoAttachment[]=[];
      for(let i=0;i<pendingTodoFiles.length;i++){
        const file=pendingTodoFiles[i];
        setMessage("Caricamento allegato "+(i+1)+" di "+pendingTodoFiles.length+": "+file.name);
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const path=ctx.ownerKey+"/"+crypto.randomUUID()+"-"+safeName;
        const {error}=await ctx.client.storage.from("recruiting-todo-files").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
        if(error)throw Error("Caricamento "+file.name+": "+error.message);
        uploadedPaths.push(path);
        newAttachments.push({name:file.name,type:file.type||"application/octet-stream",data:"",path});
      }
      const payload = {
        owner_key: ctx.ownerKey, title: form.title.trim(), due_date: form.dueDate || null,
        due_time: form.dueTime || null, body: form.body || "", priority, attachments: [...todoFiles,...newAttachments],
        linked_kind: form.linkedKind || null, linked_id: form.linkedId || null,
        linked_name: form.linkedName || "", source_key: form.sourceKey || null,
        updated_at: new Date().toISOString()
      };
      setMessage("Salvataggio attività...");
      const result = editing
        ? await ctx.client.from("recruiting_todos").update(payload).eq("owner_key", ctx.ownerKey).eq("id", editing)
        : await ctx.client.from("recruiting_todos").insert(payload);
      if(result.error)throw Error(result.error.code==="23505"?"Questo evento è già presente.":result.error.message);
      setFormOpen(false);setEditing(null);setForm(empty);setTodoFiles([]);setPendingTodoFiles([]);
      setMessage("✓ Attività e allegati salvati.");
      await load();
    }catch(error:any){
      if(uploadedPaths.length)await ctx.client.storage.from("recruiting-todo-files").remove(uploadedPaths);
      setMessage("Salvataggio non riuscito: "+(error?.message||"errore sconosciuto"));
    }finally{setSaving(false);}
  };
  const change = async (item: Todo, values: Partial<Todo>) => {
    if (!ctx) return;
    const { error } = await ctx.client.from("recruiting_todos").update({ ...values, updated_at: new Date().toISOString() }).eq("owner_key", ctx.ownerKey).eq("id", item.id);
    if (error) setMessage(error.message); else await load();
  };
  const startCalendarAppointment = (item: Todo) => {
    setMessage("");
    setCalendarTodo(item);
    setCalendarDate(item.due_date || "");
    setCalendarTime(item.due_time?.slice(0, 5) || "");
    setCalendarType("COSE_DA_FARE_GENERICHE");
  };
  const confirmCalendarAppointment = async () => {
    if (!ctx || !calendarTodo) return;
    if (!calendarDate || !calendarTime) {
      setMessage("Per aggiungere un appuntamento al Calendario devi indicare sia il giorno sia l'ora.");
      return;
    }
    setCalendarSaving(true);
    setMessage("");
    const item = calendarTodo;
    const notesText = [item.title, item.linked_name ? "Contatto: " + item.linked_name : "", item.body].filter(Boolean).join("\\n");
    const { data, error } = await ctx.client.from("recruiting_events").insert({
      owner_key: ctx.ownerKey,
      candidate_id: item.linked_kind === "candidate" ? item.linked_id : null,
      event_date: calendarDate,
      event_time: calendarTime,
      event_type: calendarType === "COSE_DA_FARE_GENERICHE" ? "ALTRO" : calendarType,
      custom_type: calendarType === "COSE_DA_FARE_GENERICHE" ? "COSE DA FARE GENERICHE" : "",
      notes: notesText
    }).select("id").single();
    if (error || !data?.id) {
      setMessage("Impossibile aggiungere l'appuntamento: " + (error?.message || "errore di salvataggio"));
      setCalendarSaving(false);
      return;
    }
    const diaryAppointment = diaryItems.some(entry=>entry.id===item.id);
    const { error: updateError } = await ctx.client.from(diaryAppointment?"recruiting_diary":"recruiting_todos").update(diaryAppointment?{calendar_event_id:String(data.id)}:{
      due_date: calendarDate, due_time: calendarTime, source_key: "hr:" + String(data.id),
      updated_at: new Date().toISOString()
    }).eq("owner_key", ctx.ownerKey).eq("id", item.id);
    if (updateError) setMessage("Appuntamento creato, ma non è stato possibile collegarlo alla cosa da fare: " + updateError.message);
    else setMessage("Appuntamento aggiunto al Calendario e collegato alla cosa da fare.");
    setCalendarTodo(null);
    setCalendarSaving(false);
    if(diaryAppointment)await loadDiary();else await load();
  };
  const startEdit = (item: Todo) => {
    setEditing(item.id); setContactSearch(""); setPriority(item.priority); setTodoFiles(Array.isArray(item.attachments)?item.attachments:[]); setPendingTodoFiles([]);
    setForm({ title: item.title, dueDate: item.due_date || "", dueTime: item.due_time?.slice(0,5) || "",
      body: item.body, linkedKind: item.linked_kind || undefined, linkedId: item.linked_id || undefined,
      linkedName: item.linked_name, sourceKey: item.source_key || undefined });
    setFormOpen(true);
    setTimeout(()=>document.getElementById("ge-todo-edit-"+item.id)?.scrollIntoView({behavior:"smooth",block:"center"}),80);
  };
  const sorted = [...items].filter(x => {
    if (filters.status === "pending" && x.completed) return false;
    if (filters.status === "done" && !x.completed) return false;
    if (filters.priority === "yes" && !x.priority) return false;
    if (filters.priority === "no" && x.priority) return false;
    if (filters.title && !normalized(x.title).includes(normalized(filters.title))) return false;
    if (filters.body && !normalized(x.body).includes(normalized(filters.body))) return false;
    if (filters.contact && !normalized(x.linked_name).includes(normalized(filters.contact))) return false;
    if (filters.dateFrom && (!x.due_date || x.due_date < filters.dateFrom)) return false;
    if (filters.dateTo && (!x.due_date || x.due_date > filters.dateTo)) return false;
    if (filters.timeFrom && (!x.due_time || x.due_time.slice(0, 5) < filters.timeFrom)) return false;
    if (filters.timeTo && (!x.due_time || x.due_time.slice(0, 5) > filters.timeTo)) return false;
    return true;
  }).sort((a,b) =>
    Number(!b.completed && b.priority) - Number(!a.completed && a.priority) ||
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const todoEditor = (
<div style={{ background: "#f8fafc", padding: 15, borderRadius: 12, marginTop: 14, display: "grid", gap: 10 }}>
      <label>OGGETTO *<input style={field} value={form.title} onChange={e => setForm(v => ({...v,title:e.target.value}))} required /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 170px" }}>DATA (opzionale)<input type="date" style={field} value={form.dueDate || ""} onChange={e => setForm(v => ({...v,dueDate:e.target.value}))} /></label>
        <label style={{ flex: "1 1 130px" }}>ORA (opzionale)<input type="time" style={field} value={form.dueTime || ""} onChange={e => setForm(v => ({...v,dueTime:e.target.value}))} /></label>
      </div>
      <div ref={contactMenuRef} style={{position:"relative"}}>
        <div style={{fontSize:13,marginBottom:5}}>CONTATTO COLLEGATO (opzionale)</div>
        <button type="button" onClick={()=>{setContactMenuOpen(v=>!v);setContactSearch("");}} style={{...field,textAlign:"left",background:"#fff",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{form.linkedName || "Nessun collegamento"}</span><span style={{color:"#64748b"}}>⌄</span>
        </button>
        {contactMenuOpen && <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:30,background:"white",border:"1px solid #cbd5e1",borderRadius:10,boxShadow:"0 8px 22px rgba(15,23,42,.14)",padding:8,marginTop:4}}>
          <input autoFocus style={{...field,marginBottom:6}} placeholder="⌕ Cerca nome o cognome nel menu..." value={contactSearch} onChange={e=>setContactSearch(e.target.value)} />
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {[{id:"",name:"Nessun collegamento",kind:"candidate" as const},...filteredContacts].map(x=><button key={x.kind+":"+x.id} type="button" onClick={()=>{
              setForm(v=>({...v,linkedKind:x.id?x.kind:undefined,linkedId:x.id||undefined,linkedName:x.id?x.name:""}));
              setContactMenuOpen(false);setContactSearch("");
            }} style={{display:"block",width:"100%",padding:"10px 9px",textAlign:"left",border:0,borderRadius:7,background:form.linkedId===x.id&&x.id?"#eff6ff":"white",cursor:"pointer",fontWeight:form.linkedId===x.id?800:500}}>{x.name}</button>)}
            {filteredContacts.length===0&&<div style={{padding:10,color:"#64748b"}}>Nessun contatto trovato</div>}
          </div>
        </div>}
      </div>
      <label>CORPO DELLA COSA DA FARE<textarea rows={4} style={field} value={form.body || ""} onChange={e=>setForm(v=>({...v,body:e.target.value}))} /></label>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:7}}>
        <input ref={todoFileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" aria-label="Seleziona allegati" style={{position:"absolute",width:1,height:1,opacity:0,overflow:"hidden",pointerEvents:"none"}} onChange={e=>{const input=e.currentTarget;const selected=Array.from(input.files||[]);void addTodoFiles(selected).finally(()=>{input.value="";});}} />
        <button type="button" disabled={todoUploading || todoFiles.length+pendingTodoFiles.length>=5} onClick={()=>todoFileInputRef.current?.click()} style={{...action,padding:"12px 17px",background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:15}}>📎 SCEGLI ALLEGATI</button>
        {todoUploading&&<span role="status" style={{fontSize:13,color:"#1d4ed8"}}>Caricamento allegati in corso...</span>}
        {todoFiles.length+pendingTodoFiles.length>0&&<span role="status" style={{fontSize:13,fontWeight:800,color:"#166534"}}>✓ {todoFiles.length+pendingTodoFiles.length} allegat{todoFiles.length+pendingTodoFiles.length===1?"o":"i"} pront{todoFiles.length+pendingTodoFiles.length===1?"o":"i"} da salvare</span>}
      </div>
      {todoFiles.map((file,index)=><div key={index} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:9,borderRadius:10,background:"white",border:"1px solid #e2e8f0"}}>
        <a href="#" onClick={e=>{e.preventDefault();void openAttachment(file);}} style={{flex:"1 1 170px",overflowWrap:"anywhere"}}>📎 {file.name}</a>
        <button type="button" style={action} onClick={()=>setTodoFiles(v=>v.filter((_,i)=>i!==index))}>✕ RIMUOVI</button>
      </div>)}
      {pendingTodoFiles.map((file,index)=><div key={"pending-"+index} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:9,background:"#f0fdf4",borderRadius:10}}>
        <span style={{flex:1,overflowWrap:"anywhere"}}>📎 {file.name} ({(file.size/1048576).toFixed(1)} MB)</span>
        <button type="button" style={action} onClick={()=>setPendingTodoFiles(v=>v.filter((_,i)=>i!==index))}>✕ RIMUOVI</button>
      </div>)}
      <small style={{color:"#64748b"}}>Massimo 5 allegati, 10 MB ciascuno. Su Android puoi aggiungerli uno alla volta: premi nuovamente SCEGLI ALLEGATI per ogni file.</small>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={priority} onChange={e=>setPriority(e.target.checked)} /> PRIORITÀ — mantieni in alto finché non è fatta</label>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...action, background: "#16a34a", color: "white" }} disabled={saving || todoUploading || !form.title.trim()} onClick={()=>void save()}>{saving?"SALVATAGGIO...":"SALVA"}</button>
        <button style={action} onClick={()=>{setFormOpen(false);setEditing(null);}}>ANNULLA</button>
      </div>
    </div>
  );
  return <div className="ge-workspace" style={{ background: "white", border: "1px solid #cbd5e1", borderRadius: 14, padding: 16, marginTop: 12 }}>
    {previewFile&&previewUrl&&<div role="dialog" aria-modal="true" aria-label={"Anteprima "+previewFile.name} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(15,23,42,.86)",display:"flex",flexDirection:"column",padding:"max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))",boxSizing:"border-box"}}>
      <div style={{display:"flex",gap:9,alignItems:"center",justifyContent:"space-between",color:"#fff",paddingBottom:12}}>
        <strong style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>📎 {previewFile.name}</strong>
        <button type="button" onClick={closeAttachment} style={{...action,background:"#fff",color:"#0f172a",minHeight:44}}>✕ CHIUDI</button>
      </div>
      {previewFile.type.startsWith("image/")||/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(previewFile.name)
        ?<img src={previewUrl} alt={previewFile.name} style={{flex:1,width:"100%",minHeight:0,objectFit:"contain"}} />
        :previewFile.type==="application/pdf"||/\.pdf$/i.test(previewFile.name)
          ?<iframe title={previewFile.name} src={previewUrl} style={{flex:1,width:"100%",minHeight:0,border:0,borderRadius:12,background:"#fff"}} />
          :<div style={{flex:1,display:"grid",placeItems:"center",color:"#fff",textAlign:"center",padding:20}}>Questo formato non dispone di anteprima integrata. Puoi aprirlo con un'app compatibile scaricandolo.</div>}
      <div style={{display:"flex",justifyContent:"center",paddingTop:10}}>
        <a href={previewUrl} download={previewFile.name} style={{...linkStyle,background:"#fff",padding:"12px 20px"}}>⬇ SCARICA / APRI CON ALTRA APP</a>
      </div>
    </div>}
    <style>{`
    .ge-workspace{font-family:inherit;color:#14233d;box-shadow:0 12px 32px rgba(20,44,82,.05);min-width:0;overflow-wrap:anywhere}
    .ge-workspace *{box-sizing:border-box}
    .ge-workspace-header{padding:18px 20px!important;background:linear-gradient(110deg,#fff6e9,#fffaf4);border:1px solid #ffe1b4;border-radius:17px;gap:14px!important}
    .ge-workspace-header h2{font-size:clamp(19px,2.2vw,26px);font-weight:850;letter-spacing:-.4px;color:#17243d}
    .ge-workspace button{transition:background .15s,transform .12s,box-shadow .15s}
    .ge-workspace button:active{transform:scale(.985)}
    .ge-workspace-header button,.ge-workspace-tabs button{min-height:44px;border-radius:12px!important;font-size:13px!important;padding:10px 14px!important;box-shadow:0 2px 4px rgba(15,23,42,.04)}
    .ge-workspace-tabs{background:#f4f8ff;padding:8px;border-radius:15px;gap:8px!important}
    .ge-workspace-tabs button{flex:1 1 150px}
    .ge-diary,.ge-todo-panel{min-width:0}
    .ge-diary>h3,.ge-diary-list>h3,.ge-todo-list>h3{font-size:clamp(16px,2vw,20px);font-weight:850;color:#142743;margin:18px 0 12px;line-height:1.35}
    .ge-diary-form{background:linear-gradient(135deg,#f2f7ff,#f9fbff);border:1px solid #d6e5ff;border-radius:16px;padding:clamp(12px,2.2vw,20px);margin:10px 0 18px}
    .ge-diary-form label{font-size:13px;font-weight:750;color:#243a5c}
    .ge-diary-form textarea,.ge-diary-form input,.ge-diary-form select{font-size:15px!important;border-radius:12px!important;background:white;max-width:100%}
    .ge-diary-form textarea{min-height:110px}
    .ge-diary-form button{min-height:43px;border-radius:12px!important}
    .ge-diary-form button:disabled{opacity:.6}
    .ge-diary-list,.ge-todo-list{background:#f7faff;border:1px solid #e0e9f6;border-radius:16px;padding:clamp(9px,1.5vw,16px)}
    .ge-diary-list>h3,.ge-todo-list>h3{margin:2px 4px 6px}
    .ge-diary-group{border:0!important;padding:0!important;background:transparent!important}
    .ge-diary-group h4{background:#eaf3ff;border-radius:11px;padding:11px 14px;margin:4px 0 10px!important;font-size:15px!important}
    .ge-diary-note,.ge-todo-card{background:#fff!important;border:1px solid #dce7f4!important;border-left:5px solid #367ff4!important;border-radius:14px!important;padding:clamp(12px,2vw,17px)!important;box-shadow:0 3px 12px rgba(23,48,83,.04);min-width:0}
    .ge-diary-note:has(button:disabled),.ge-todo-card:has(button:disabled){opacity:1}
    .ge-diary-note small,.ge-todo-card small{color:#687b96!important}
    .ge-diary-note a,.ge-todo-card a{overflow-wrap:anywhere}
    .ge-diary-actions,.ge-todo-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px!important;margin-top:14px}
    .ge-diary-actions button,.ge-todo-actions button{min-width:0!important;min-height:42px;border-radius:11px!important;padding:9px 7px!important;font-size:12px!important;font-weight:800!important;white-space:normal;line-height:1.25}
    .ge-diary-actions button:nth-child(1){background:#eff6ff!important;color:#1d4ed8!important;border-color:#dbeafe!important}
    .ge-diary-actions button:nth-child(2){background:#ecfdf5!important;color:#047857!important;border-color:#c6f6df!important}
    .ge-diary-actions button:nth-child(3){background:#fff!important;color:#243a5c!important;border-color:#d5e0ed!important}
    .ge-diary-actions button:nth-child(4){background:#fff1f2!important;color:#be123c!important;border-color:#ffe0e6!important}
    .ge-todo-actions button:nth-child(1){background:#ecfdf5!important;color:#047857!important;border-color:#c6f6df!important}
    .ge-todo-actions button:nth-child(2){background:#eff6ff!important;color:#1d4ed8!important;border-color:#dbeafe!important}
    .ge-todo-actions button:nth-child(3){background:#fff7e6!important;color:#995d0a!important;border-color:#fde7b3!important}
    .ge-todo-actions button:nth-child(4){background:#fff1f2!important;color:#be123c!important;border-color:#ffe0e6!important}
    @media(max-width:640px){
      .ge-workspace{padding:10px!important}
      .ge-workspace-header{padding:13px!important}
      .ge-workspace-header>div{width:100%;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px!important}
      .ge-workspace-header>div button:last-child{grid-column:span 2}
      .ge-workspace-header button{font-size:11px!important;padding:10px 7px!important}
      .ge-workspace-tabs{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px!important}
      .ge-workspace-tabs button{min-width:0!important;font-size:12px!important;padding:10px 5px!important}
      .ge-diary-actions,.ge-todo-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .ge-diary-actions button,.ge-todo-actions button{min-height:45px;font-size:12px!important}
      .ge-diary-group h4{font-size:14px!important}
    }
`}</style>
    <div className="ge-workspace-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <h2 style={{ margin: 0 }}>☑ COSE DA FARE</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={action} onClick={() => setFiltersOpen(v => !v)}>{filtersOpen ? "NASCONDI FILTRI" : "⌕ FILTRI E RICERCA"}</button>
        <button style={action} onClick={() => { const next = !showCompleted; setShowCompleted(next); updateFilter("status", next ? "all" : "pending"); }}>{showCompleted ? "NASCONDI FATTE" : "MOSTRA FATTE"}</button>
        <button style={{ ...action, background: "#2563eb", color: "white" }} onClick={() => { setForm(empty); setContactSearch(""); setPriority(false); setEditing(null); setFormOpen(true); }}>＋ NUOVA COSA DA FARE</button>
      </div>
    </div>
    <div className="ge-workspace-tabs" style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
      <button style={{...action,background:subtab==="todo"?"#1d4ed8":"white",color:subtab==="todo"?"white":"#0f172a"}} onClick={()=>setSubtab("todo")}>☑ COSE DA FARE</button>
      <button style={{...action,background:subtab==="diario"?"#1d4ed8":"white",color:subtab==="diario"?"white":"#0f172a"}} onClick={()=>setSubtab("diario")}>📔 DIARIO</button>
    </div>
    {subtab==="diario"&&<div className="ge-diary" style={{marginTop:14}}>
      <h3>📒 DIARIO · APPUNTI PER AGENTE / CONTATTO</h3>
      <div className="ge-diary-form" style={{display:"grid",gap:12}}>
      <div ref={diaryContactMenuRef} style={{position:"relative",display:"grid",gap:6}}>
        <label>AGENTE O CONTATTO</label>
        <button type="button" style={{...field,textAlign:"left",background:"#fff",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}} onClick={()=>{setDiaryContactMenuOpen(v=>!v);setDiarySearch("");}}>
          <span>{diaryLinked ? (diaryContacts.find(c=>c.kind+":"+c.id===diaryLinked)?.name||"Seleziona agente o contatto") : "Nessun collegamento"}</span><span>⌄</span>
        </button>
        {diaryContactMenuOpen&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:40,background:"#fff",border:"1px solid #cbd5e1",borderRadius:12,boxShadow:"0 8px 25px rgba(15,23,42,.18)",padding:8,marginTop:4}}>
          <input autoFocus style={field} placeholder="🔎 Cerca nome o cognome..." value={diarySearch} onChange={e=>setDiarySearch(e.target.value)} />
          <div style={{maxHeight:250,overflowY:"auto",marginTop:6}}>
            <button type="button" style={{...field,textAlign:"left",background:"white",border:"none",cursor:"pointer"}} onClick={()=>{setDiaryLinked("");setDiaryContactMenuOpen(false);setDiarySearch("");}}>Nessun collegamento</button>
            {diaryContacts.filter(c=>c.name.toLocaleLowerCase("it").includes(diarySearch.toLocaleLowerCase("it"))).map(c=><button type="button" key={c.kind+":"+c.id} style={{...field,textAlign:"left",background:diaryLinked===c.kind+":"+c.id?"#eff6ff":"white",border:"none",cursor:"pointer"}} onClick={()=>{setDiaryLinked(c.kind+":"+c.id);setDiaryContactMenuOpen(false);setDiarySearch("");}}>{c.name} · {c.kind==="agent"?"AGENTE":"CONTATTO"}</button>)}
            {!diaryContacts.some(c=>c.name.toLocaleLowerCase("it").includes(diarySearch.toLocaleLowerCase("it")))&&<p style={{padding:8,color:"#64748b"}}>Nessun risultato</p>}
          </div>
        </div>}
      </div>
      {!diaryEditing&&<label style={{display:"grid",gap:6}}>NUOVO APPUNTO<textarea rows={4} style={field} value={diaryText} onChange={e=>setDiaryText(e.target.value)} placeholder="Scrivi un appunto..." /></label>}
      {!diaryEditing&&<div style={{display:"grid",gap:8}}>
        <input ref={diaryFileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" style={{position:"absolute",width:1,height:1,opacity:0,pointerEvents:"none"}} onChange={e=>{void addDiaryFiles(e.currentTarget.files);e.currentTarget.value="";}} />
        <button type="button" style={{...action,width:"fit-content",background:"#eff6ff",color:"#1d4ed8"}} onClick={()=>diaryFileInputRef.current?.click()}>📎 AGGIUNGI ALLEGATI</button>
        {diaryPendingFiles.map((file,i)=><div key={i}>📎 {file.name} ({(file.size/1048576).toFixed(1)} MB) <button type="button" style={action} onClick={()=>setDiaryPendingFiles(v=>v.filter((_,j)=>i!==j))}>✕</button></div>)}
        <small>Fino a 5 allegati da 10 MB ciascuno.</small>
        <button style={{...action,background:"#2563eb",color:"white",width:"fit-content"}} disabled={diarySaving||(!diaryText.trim()&&!diaryFiles.length&&!diaryPendingFiles.length)} onClick={()=>void saveDiary()}>{diarySaving?"SALVATAGGIO...":"＋ SALVA APPUNTO"}</button>
      </div>}
      </div>
      {message&&<p role="status" style={{color:message.startsWith("✓")?"#15803d":"#b91c1c"}}>{message}</p>}
      <div className="ge-diary-list" style={{display:"grid",gap:12,marginTop:16}}>
        <h3>☷ APPUNTI INSERITI</h3>
        {diaryGroups.map(group=><article className="ge-diary-group" key={group.key} style={{border:"1px solid #cbd5e1",borderRadius:14,padding:14,background:"#fff"}}>
          <h4 style={{margin:"0 0 12px",color:"#1d4ed8",fontSize:17}}>{group.name} <span style={{fontSize:12,color:"#64748b"}}>({group.items.length} note)</span></h4>{group.items[0]?.linked_kind==="candidate" && group.items[0]?.linked_id && onOpenLinkedContact && <button type="button" style={{...linkStyle,marginBottom:12}} onClick={()=>onOpenLinkedContact("candidate",String(group.items[0].linked_id))}>↗ APRI SCHEDA CONTATTO</button>}
          <div style={{display:"grid",gap:10}}>{group.items.map(item=><section className="ge-diary-note" key={item.id} id={"diary-note-"+item.id} style={{background:item.completed?"#f1f5f9":"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12}}>
            <small style={{color:"#64748b"}}>{new Date(item.created_at).toLocaleString("it-IT")}</small>
            {diaryEditing===item.id ? <div style={{display:"grid",gap:9,margin:"10px 0",padding:12,border:"2px solid #2563eb",borderRadius:12,background:"#fff"}}>
              <strong>✎ MODIFICA APPUNTO</strong>
              <textarea rows={5} style={field} value={diaryText} onChange={e=>setDiaryText(e.target.value)} />
              <select style={field} value={diaryLinked} onChange={e=>setDiaryLinked(e.target.value)}>
                <option value="">Nessun collegamento</option>
                {diaryContacts.map(c=><option key={c.kind+":"+c.id} value={c.kind+":"+c.id}>{c.name} · {c.kind==="agent"?"AGENTE":"CONTATTO"}</option>)}
              </select>
              {diaryFiles.map((file,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>📎 {file.name}<button type="button" style={action} onClick={()=>setDiaryFiles(v=>v.filter((_,j)=>i!==j))}>✕ RIMUOVI</button></div>)}
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={e=>{void addDiaryFiles(e.currentTarget.files);e.currentTarget.value="";}} />
              {diaryPendingFiles.map((file,i)=><div key={i}>📎 {file.name} <button type="button" style={action} onClick={()=>setDiaryPendingFiles(v=>v.filter((_,j)=>i!==j))}>✕</button></div>)}
              <small>Massimo 5 allegati da 10 MB ciascuno.</small>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button type="button" style={{...action,background:"#16a34a",color:"#fff"}} disabled={diarySaving} onClick={()=>void saveDiary()}>{diarySaving?"SALVATAGGIO...":"✓ SALVA MODIFICHE"}</button>
                <button type="button" style={action} onClick={cancelDiaryEdit}>ANNULLA</button>
              </div>
              {message&&<span role="status">{message}</span>}
            </div> : <p style={{whiteSpace:"pre-wrap",textDecoration:item.completed?"line-through":"none",margin:"8px 0"}}>{item.body}</p>}
            {Array.isArray(item.attachments)&&item.attachments.map((file:any,i:number)=><a key={i} href="#" onClick={e=>{e.preventDefault();void openAttachment(file);}} style={{display:"inline-block",marginRight:10,marginBottom:8,color:"#1d4ed8",fontWeight:700,fontSize:13}}>📎 {file.name}</a>)}
            <div className="ge-diary-actions" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button type="button" style={{...action,background:"#eff6ff",color:"#1d4ed8"}} onClick={()=>startDiaryEdit(item)}>✎ MODIFICA</button>
              <button style={action} onClick={()=>void diaryAction(item,"done")}>{item.completed?"↶ RIAPRI":"✓ FATTO"}</button>
              <button style={action} disabled={Boolean(item.calendar_event_id)} onClick={()=>{setCalendarTodo({id:item.id,title:"DIARIO · "+(item.linked_name||"APPUNTO"),body:item.body,linked_name:item.linked_name,linked_kind:item.linked_kind,linked_id:item.linked_id,due_date:null,due_time:null,source_key:null} as Todo);setCalendarDate("");setCalendarTime("");setCalendarType("ALTRO");}}>{item.calendar_event_id?"✓ IN CALENDARIO":"📅 CALENDARIO"}</button>
              <button style={{...action,color:"#b91c1c"}} onClick={()=>void diaryAction(item,"delete")}>ELIMINA</button>
            </div>
          </section>)}</div>
        </article>)}
        {!diaryGroups.length&&<p>Nessun appunto presente.</p>}
      </div>
    </div>}
    {subtab==="todo"&&<div className="ge-todo-panel">
    {message && <p role="alert" style={{ color: "#b91c1c" }}>{message}</p>}
    {filtersOpen && <div style={{ background: "#f1f5f9", padding: 14, borderRadius: 12, marginTop: 14 }}>
      <strong>FILTRA COSE DA FARE</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 10, marginTop: 10 }}>
        <label>OGGETTO<input style={field} placeholder="Cerca oggetto" value={filters.title} onChange={e=>updateFilter("title",e.target.value)} /></label>
        <label>CONTATTO<input style={field} placeholder="Nome o cognome" value={filters.contact} onChange={e=>updateFilter("contact",e.target.value)} /></label>
        <label>CORPO / DESCRIZIONE<input style={field} placeholder="Cerca nel testo" value={filters.body} onChange={e=>updateFilter("body",e.target.value)} /></label>
        <label>DATA DA<input type="date" style={field} value={filters.dateFrom} onChange={e=>updateFilter("dateFrom",e.target.value)} /></label>
        <label>DATA A<input type="date" style={field} value={filters.dateTo} onChange={e=>updateFilter("dateTo",e.target.value)} /></label>
        <label>ORA DA<input type="time" style={field} value={filters.timeFrom} onChange={e=>updateFilter("timeFrom",e.target.value)} /></label>
        <label>ORA A<input type="time" style={field} value={filters.timeTo} onChange={e=>updateFilter("timeTo",e.target.value)} /></label>
        <label>PRIORITÀ<select style={field} value={filters.priority} onChange={e=>updateFilter("priority",e.target.value)}>
          <option value="all">Tutte</option><option value="yes">Solo prioritarie</option><option value="no">Non prioritarie</option>
        </select></label>
        <label>STATO<select style={field} value={filters.status} onChange={e=>{ updateFilter("status",e.target.value); setShowCompleted(e.target.value!=="pending"); }}>
          <option value="pending">Da fare</option><option value="done">Fatte</option><option value="all">Tutte</option>
        </select></label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button style={action} onClick={()=>{setFilters({title:"",dateFrom:"",dateTo:"",timeFrom:"",timeTo:"",contact:"",body:"",priority:"all",status:"pending"});setShowCompleted(false);}}>AZZERA FILTRI</button>
        <span style={{ color: "#475569", fontSize: 13 }}>{sorted.length} attività trovate</span>
      </div>
    </div>}
    {calendarTodo && <div role="presentation" onClick={() => !calendarSaving && setCalendarTodo(null)}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,.62)", display: "grid", placeItems: "center", padding: 14 }}>
      <div role="dialog" aria-modal="true" aria-label="Aggiungi al calendario" onClick={event => event.stopPropagation()}
        style={{ width: "min(480px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.3)", display: "grid", gap: 14 }}>
        <strong style={{ fontSize: 19 }}>📅 AGGIUNGI AL CALENDARIO</strong>
        <div style={{ fontWeight: 700, color: "#334155" }}>{calendarTodo.title}</div>
        <label>TIPOLOGIA DI CALENDARIO
          <select style={field} value={calendarType} onChange={e => setCalendarType(e.target.value)}>
            <option value="COSE_DA_FARE_GENERICHE">COSE DA FARE GENERICHE</option>
            <option value="CHIAMARE">CHIAMARE</option>
            <option value="APPUNTAMENTO_ZONA">APPUNTAMENTO IN ZONA</option>
            <option value="APPUNTAMENTO_SEDE">APPUNTAMENTO IN SEDE</option>
            <option value="VIDEOCALL">VIDEOCALL</option>
            <option value="ALTRO">ALTRO</option>
          </select>
        </label>
        <label>GIORNO *<input type="date" required style={field} value={calendarDate} onChange={e => setCalendarDate(e.target.value)} /></label>
        <label>ORARIO *<input type="time" required style={field} value={calendarTime} onChange={e => setCalendarTime(e.target.value)} /></label>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={action} disabled={calendarSaving} onClick={() => setCalendarTodo(null)}>ANNULLA</button>
          <button style={{ ...action, background: "#2563eb", color: "#fff" }} disabled={calendarSaving || !calendarDate || !calendarTime} onClick={() => void confirmCalendarAppointment()}>
            {calendarSaving ? "SALVATAGGIO..." : "AGGIUNGI AL CALENDARIO"}
          </button>
        </div>
      </div>
    </div>}
    {formOpen && !editing && todoEditor}
    <div className="ge-todo-list" style={{ display: "grid", gap: 10, marginTop: 16 }}>
      <h3>☷ ATTIVITÀ INSERITE</h3>
      {sorted.length===0 && <p style={{ color: "#64748b" }}>Nessuna cosa da fare nell'elenco.</p>}
      {sorted.map(item=><div key={item.id} id={"ge-todo-edit-"+item.id} className="ge-todo-card" style={{ padding: 13, borderRadius: 11, border: "1px solid "+(item.priority&&!item.completed?"#f59e0b":"#cbd5e1"), borderLeft: "6px solid "+(item.completed?"#94a3b8":item.priority?"#f59e0b":"#2563eb"), background: item.completed?"#f1f5f9":item.priority?"#fffbeb":"#fff" }}>
        {formOpen && editing===item.id && <div style={{marginBottom:12,border:"2px solid #2563eb",borderRadius:14,padding:4}}>{todoEditor}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ textDecoration: item.completed?"line-through":"none" }}>{item.priority&&!item.completed?"★ ":""}{item.title}</strong>
          <span style={{ color: "#475569", fontSize: 12 }}>{item.due_date ? item.due_date.split("-").reverse().join("/") : "Senza data"} {item.due_time?.slice(0,5)||""}</span>
        </div>
        {item.linked_name && <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:7}}>
          <span style={{fontSize:13,color:"#475569"}}>👤 {item.linked_name}</span>
          {item.linked_kind==="candidate" && item.linked_id && onOpenLinkedContact && <button type="button" style={linkStyle} title={"Apri la scheda contatto di "+item.linked_name} onClick={()=>onOpenLinkedContact("candidate",item.linked_id!)}>↗ APRI SCHEDA CONTATTO</button>}
        </div>}
        {item.body && <div style={{ marginTop: 7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.body}</div>}
        {Array.isArray(item.attachments)&&item.attachments.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:10}}>
          {item.attachments.map((file,index)=><a key={index} href="#" onClick={e=>{e.preventDefault();void openAttachment(file);}} style={{...linkStyle,maxWidth:"100%",overflowWrap:"anywhere"}}>📎 {file.name}</a>)}
        </div>}
        <div className="ge-todo-actions" style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
          <button style={action} onClick={()=>void change(item,{completed:!item.completed})}>{item.completed?"↶ RIAPRI":"✓ FATTA"}</button>
          <button style={action} onClick={()=>startEdit(item)}>MODIFICA</button>
          <button style={action} onClick={()=>void change(item,{priority:!item.priority})}>{item.priority?"TOGLI PRIORITÀ":"★ PRIORITÀ"}</button>
          <button style={{...action,color:"#b91c1c"}} onClick={async()=>{if(!ctx || !await confirmAction("Eliminare questa cosa da fare?"))return;const {error}=await ctx.client.from("recruiting_todos").delete().eq("owner_key",ctx.ownerKey).eq("id",item.id);if(error)setMessage(error.message);else await load();}}>ELIMINA</button>
          {!item.source_key && <button type="button" style={{ ...action, background: "#dcfce7", color: "#166534", borderColor: "#86efac" }} onClick={() => startCalendarAppointment(item)}>📅 AGGIUNGI AL CALENDARIO</button>}
          {item.source_key && /^(hr|crm|google):/.test(item.source_key) && (
            <button type="button" title="Apri scheda originale nel Calendario" aria-label="Apri scheda originale nel Calendario"
              onClick={() => window.dispatchEvent(new CustomEvent("ge:open-recruiting-calendar", { detail: { date: item.due_date, sourceKey: item.source_key } }))}
              style={{ ...action, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}>
              📅 CALENDARIO
            </button>
          )}
        </div>
      </div>)}
    </div>
    </div>}
  </div>;
}
