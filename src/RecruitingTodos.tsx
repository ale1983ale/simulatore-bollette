import React, { useCallback, useEffect, useState } from "react";
import type { RecruitingContext } from "./recruitingClient";

export type TodoDraft = {
  title: string; dueDate?: string; dueTime?: string; body?: string;
  linkedKind?: "candidate" | "agent"; linkedId?: string; linkedName?: string; sourceKey?: string;
};
type Todo = {
  id: string; title: string; due_date: string | null; due_time: string | null;
  linked_kind: "candidate" | "agent" | null; linked_id: string | null;
  linked_name: string; body: string; priority: boolean; completed: boolean;
  created_at: string; source_key: string | null;
};
type ContactOption = { id: string; name: string; kind: "candidate" | "agent" };
const empty: TodoDraft = { title: "", dueDate: "", dueTime: "", body: "" };
const field: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 9, boxSizing: "border-box", font: "inherit" };
const action: React.CSSProperties = { padding: "9px 13px", borderRadius: 9, border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 800, background: "white" };

export default function RecruitingTodos({ ctx, contacts, draft, onDraftConsumed, visible }: {
  ctx: RecruitingContext | null; contacts: ContactOption[]; draft: TodoDraft | null;
  onDraftConsumed: () => void; visible: boolean;
}) {
  const [items, setItems] = useState<Todo[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<TodoDraft>(empty);
  const [priority, setPriority] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
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
    setForm(draft); setContactSearch(""); setPriority(false); setEditing(null); setFormOpen(true); onDraftConsumed();
  }, [draft, onDraftConsumed]);
  const save = async () => {
    if (!ctx || !form.title?.trim()) { setMessage("L'OGGETTO è obbligatorio."); return; }
    setSaving(true); setMessage("");
    const payload = {
      owner_key: ctx.ownerKey, title: form.title.trim(), due_date: form.dueDate || null,
      due_time: form.dueTime || null, body: form.body || "", priority,
      linked_kind: form.linkedKind || null, linked_id: form.linkedId || null,
      linked_name: form.linkedName || "", source_key: form.sourceKey || null,
      updated_at: new Date().toISOString()
    };
    const result = editing
      ? await ctx.client.from("recruiting_todos").update(payload).eq("owner_key", ctx.ownerKey).eq("id", editing)
      : await ctx.client.from("recruiting_todos").insert(payload);
    if (result.error) {
      if (result.error.code === "23505" && form.sourceKey) setMessage("Questo evento è già presente nelle cose da fare.");
      else setMessage(result.error.message);
    } else { setFormOpen(false); setEditing(null); setForm(empty); await load(); }
    setSaving(false);
  };
  const change = async (item: Todo, values: Partial<Todo>) => {
    if (!ctx) return;
    const { error } = await ctx.client.from("recruiting_todos").update({ ...values, updated_at: new Date().toISOString() }).eq("owner_key", ctx.ownerKey).eq("id", item.id);
    if (error) setMessage(error.message); else await load();
  };
  const startEdit = (item: Todo) => {
    setEditing(item.id); setContactSearch(""); setPriority(item.priority);
    setForm({ title: item.title, dueDate: item.due_date || "", dueTime: item.due_time?.slice(0,5) || "",
      body: item.body, linkedKind: item.linked_kind || undefined, linkedId: item.linked_id || undefined,
      linkedName: item.linked_name, sourceKey: item.source_key || undefined });
    setFormOpen(true);
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
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return <div style={{ background: "white", border: "1px solid #cbd5e1", borderRadius: 14, padding: 16, marginTop: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <h2 style={{ margin: 0 }}>☑ COSE DA FARE</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={action} onClick={() => setFiltersOpen(v => !v)}>{filtersOpen ? "NASCONDI FILTRI" : "⌕ FILTRI E RICERCA"}</button>
        <button style={action} onClick={() => { const next = !showCompleted; setShowCompleted(next); updateFilter("status", next ? "all" : "pending"); }}>{showCompleted ? "NASCONDI FATTE" : "MOSTRA FATTE"}</button>
        <button style={{ ...action, background: "#2563eb", color: "white" }} onClick={() => { setForm(empty); setContactSearch(""); setPriority(false); setEditing(null); setFormOpen(true); }}>＋ NUOVA COSA DA FARE</button>
      </div>
    </div>
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
    {formOpen && <div style={{ background: "#f8fafc", padding: 15, borderRadius: 12, marginTop: 14, display: "grid", gap: 10 }}>
      <label>OGGETTO *<input style={field} value={form.title} onChange={e => setForm(v => ({...v,title:e.target.value}))} required /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 170px" }}>DATA (opzionale)<input type="date" style={field} value={form.dueDate || ""} onChange={e => setForm(v => ({...v,dueDate:e.target.value}))} /></label>
        <label style={{ flex: "1 1 130px" }}>ORA (opzionale)<input type="time" style={field} value={form.dueTime || ""} onChange={e => setForm(v => ({...v,dueTime:e.target.value}))} /></label>
      </div>
      <label>CONTATTO COLLEGATO (opzionale)
        <input style={{ ...field, marginTop: 5, marginBottom: 7 }} placeholder="⌕ Cerca per nome o cognome..." value={contactSearch} onChange={e=>setContactSearch(e.target.value)} />
        <select style={field} value={form.linkedKind && form.linkedId ? form.linkedKind+":"+form.linkedId : ""} onChange={e => {
          const found=contacts.find(x=>x.kind+":"+x.id===e.target.value);
          setForm(v=>({...v,linkedKind:found?.kind,linkedId:found?.id,linkedName:found?.name || ""}));
        }}>
          <option value="">Nessun collegamento</option>
          {form.linkedId && !contacts.some(x=>x.id===form.linkedId && x.kind===form.linkedKind) && <option value={form.linkedKind+":"+form.linkedId}>{form.linkedName}</option>}
          {filteredContacts.map(x=><option key={x.kind+":"+x.id} value={x.kind+":"+x.id}>{x.name}</option>)}
        </select>
      </label>
      <label>CORPO DELLA COSA DA FARE<textarea rows={4} style={field} value={form.body || ""} onChange={e=>setForm(v=>({...v,body:e.target.value}))} /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={priority} onChange={e=>setPriority(e.target.checked)} /> PRIORITÀ — mantieni in alto finché non è fatta</label>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...action, background: "#16a34a", color: "white" }} disabled={saving || !form.title.trim()} onClick={()=>void save()}>{saving?"SALVATAGGIO...":"SALVA"}</button>
        <button style={action} onClick={()=>setFormOpen(false)}>ANNULLA</button>
      </div>
    </div>}
    <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
      {sorted.length===0 && <p style={{ color: "#64748b" }}>Nessuna cosa da fare nell'elenco.</p>}
      {sorted.map(item=><div key={item.id} style={{ padding: 13, borderRadius: 11, border: "1px solid "+(item.priority&&!item.completed?"#f59e0b":"#cbd5e1"), borderLeft: "6px solid "+(item.completed?"#94a3b8":item.priority?"#f59e0b":"#2563eb"), background: item.completed?"#f1f5f9":item.priority?"#fffbeb":"#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ textDecoration: item.completed?"line-through":"none" }}>{item.priority&&!item.completed?"★ ":""}{item.title}</strong>
          <span style={{ color: "#475569", fontSize: 12 }}>{item.due_date ? item.due_date.split("-").reverse().join("/") : "Senza data"} {item.due_time?.slice(0,5)||""}</span>
        </div>
        {item.linked_name && <div style={{ fontSize: 13, marginTop: 5 }}>👤 {item.linked_name}</div>}
        {item.body && <div style={{ marginTop: 7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.body}</div>}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
          <button style={action} onClick={()=>void change(item,{completed:!item.completed})}>{item.completed?"↶ RIAPRI":"✓ FATTA"}</button>
          <button style={action} onClick={()=>startEdit(item)}>MODIFICA</button>
          <button style={action} onClick={()=>void change(item,{priority:!item.priority})}>{item.priority?"TOGLI PRIORITÀ":"★ PRIORITÀ"}</button>
          <button style={{...action,color:"#b91c1c"}} onClick={async()=>{if(!ctx || !window.confirm("Eliminare questa cosa da fare?"))return;const {error}=await ctx.client.from("recruiting_todos").delete().eq("owner_key",ctx.ownerKey).eq("id",item.id);if(error)setMessage(error.message);else await load();}}>ELIMINA</button>
        </div>
      </div>)}
    </div>
  </div>;
}
