import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);
const ORIGIN = "https://simulatore-bollette.vercel.app";
const SOURCES = {
  disp_capacity: "/api/disp-capacity",
  electric_network: "/api/network-tariffs",
  gas_network: "/api/gas-network-tariffs",
} as const;
type Category = keyof typeof SOURCES;
const categories = Object.keys(SOURCES) as Category[];
const respond = (value: unknown, code=200) =>
  new Response(JSON.stringify(value), {
    status: code, headers: { "Content-Type": "application/json" },
  });

async function authorize(body: Record<string, unknown>): Promise<boolean> {
  const token = String(body?.cron_token || "");
  if (!token) return false;
  const { data, error } = await db.rpc("claim_tariff_sync_token", { p_token: token });
  if (error) throw error;
  return data === true;
}
function valid(value: unknown) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" &&
    Number.isFinite(number) && number >= 0 && number <= 0.2;
}
function safelyVerifiedRate(value: unknown, source: unknown, provenance: unknown) {
  if (!valid(value)) return null;
  if (provenance !== "AGGIORNATO DA FONTE UFFICIALE") return null;
  if (!["ARERA", "ARERA/TERNA", "TERNA"].includes(String(source))) return null;
  return Number(Number(value).toFixed(6));
}
function withinVariation(next: number, old: number | null, cap: number) {
  return old == null || Math.abs(next-old) <= cap;
}

async function fetchSnapshot(category: Category) {
  const url=ORIGIN+SOURCES[category]+"?force=1&sync="+Date.now();
  const timeout=AbortSignal.timeout(category==="disp_capacity" ? 60000 : 16000);
  const res=await fetch(url,{
    cache:"no-store",headers: { "Accept": "application/json" },signal:timeout,
  });
  if (!res.ok) throw new Error("Il servizio tariffario ha risposto HTTP "+res.status);
  const body=await res.json();
  if (!body || !Array.isArray(body.rows) || !body.rows.length)
    throw new Error("Nessun dato strutturato restituito dal servizio tariffario");
  return { body, url };
}
async function priorSync(category: Category) {
  const { data, error } = await db.from("tariff_sync_runs")
    .select("status,checked_at").eq("category",category)
    .order("checked_at",{ascending:false}).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function handleDispatch(body: any) {
  const warnings: string[] = Array.isArray(body.warnings) ?
    body.warnings.map(String) : [];
  const currentYear = new Date().getUTCFullYear();
  const rows = body.rows;
  if (rows.length < 15 || rows.length > 180)
    throw new Error("Numero di mesi non plausibile: dati bloccati");
  const keys=new Set<string>();
  for (const item of rows) {
    const yr=Number(item.anno), mon=Number(item.meseNumero);
    if (!Number.isSafeInteger(yr) || yr<2025 || yr>currentYear+1 ||
      !Number.isSafeInteger(mon) || mon<1 || mon>12)
      throw new Error("Periodo tariffario errato");
    const k=yr+"-"+mon;
    if (keys.has(k)) throw new Error("Mese duplicato nel prospetto: "+k);
    keys.add(k);
  }
  const { data: previous, error: priorError }=await db.from("disp_capacity_auto_rates").select("*");
  if (priorError) throw priorError;
  const existing=new Map((previous||[]).map((row: any)=>[row.anno+"-"+row.mese_numero,row]));
  let changed=0,verified=0,quarantined=0;
  const upserts: any[]=[];
  for (const item of rows) {
    if (item.status !== "AGGIORNATO DA FONTE UFFICIALE") continue;
    const key=Number(item.anno)+"-"+Number(item.meseNumero);
    const prior: any=existing.get(key) || null;
    const tide = safelyVerifiedRate(item.tide,item.sourceTide,item.status);
    const capacity = safelyVerifiedRate(item.cpMarket,item.sourceCapacity,item.status);
    const domestic = safelyVerifiedRate(item.cdispDomestico,item.sourceDomestic,item.status);
    if (tide === null && capacity === null && domestic === null) continue;
    verified++;
    if (tide !== null && capacity !== null &&
      valid(item.businessTotale) &&
      Math.abs(tide+capacity-Number(item.businessTotale))>0.000002) {
      quarantined++;
      warnings.push(key+": totale TIDE/Capacity incoerente; dati non applicati");
      continue;
    }
    const selected: any={
      anno:Number(item.anno),mese_numero:Number(item.meseNumero),
      tide:prior?.tide ?? null,
      cp_market:prior?.cp_market ?? null,
      cdisp_domestico:prior?.cdisp_domestico ?? null,
      tide_source:prior?.tide_source??null,
      cp_source:prior?.cp_source??null,
      cdisp_source:prior?.cdisp_source??null,
      checked_at:new Date().toISOString(),
    };
    const apply=(value:number|null,field:string,sourceField:string,source:string,maxDelta:number)=>{
      if(value===null)return;
      const old=selected[field] === null ? null : Number(selected[field]);
      if (!withinVariation(value,old,maxDelta)) {
        warnings.push(key+": variazione "+field+" anomala; lasciato il precedente valore");
        quarantined++;
        return;
      }
      if(old===null || Math.abs(old-value)>0.0000005)changed++;
      selected[field]=value;selected[sourceField]=source;
    };
    apply(tide,"tide","tide_source",String(item.sourceTide),0.05);
    apply(capacity,"cp_market","cp_source",String(item.sourceCapacity),0.05);
    apply(domestic,"cdisp_domestico","cdisp_source",String(item.sourceDomestic),0.05);
    if ([selected.tide,selected.cp_market,selected.cdisp_domestico].some((v)=>v!==null)) upserts.push(selected);
  }
  if (upserts.length){
    const {error}=await db.from("disp_capacity_auto_rates")
      .upsert(upserts,{onConflict:"anno,mese_numero"});
    if(error)throw error;
  }
  if(quarantined)warnings.push(quarantined+" componenti non applicate perché non superano la validazione");
  if(!upserts.length)warnings.push("Nessun nuovo dato numerico ARERA/TERNA estratto e verificato: conservati i valori storici");
  const status = upserts.length
    ? warnings.length ? "partial" : changed ? "updated" : "no_change"
    : "blocked";
  return {status,changed_rows:changed,verified_rows:verified,warnings};
}

async function syncCategory(category:Category) {
  const started=new Date().toISOString();
  try {
    const {body,url}=await fetchSnapshot(category);
    const warnings=Array.isArray(body.warnings)?body.warnings.map(String):[];
    let outcome:{
      status:string;
      changed_rows:number;
      verified_rows:number;
      warnings:string[];
    };
    if(category==="disp_capacity"){
      outcome=await handleDispatch(body);
    }else{
      // I servizi Rete Energia e Gas restituiscono oggi tariffe di base
      // precaricate. Non usare mai la sola raggiungibilità della pagina
      // ufficiale come prova che i valori numerici siano stati aggiornati.
      // Il controllo è automatico, l'applicazione resta bloccata finché
      // non esiste un prospetto completo verificato.
      outcome={
        status:"blocked",changed_rows:0,verified_rows:0,
        warnings:[...warnings,
          "Controllo automatico effettuato: i valori del servizio sono ancora precaricati. Nessuna sostituzione non verificata."],
      };
    }
    const {error}=await db.from("tariff_sync_runs").insert({
      category,checked_at:started,
      status:outcome.status,
      source_status:String(body.sourceStatus||""),
      changed_rows:outcome.changed_rows,
      verified_rows:outcome.verified_rows,
      warnings:outcome.warnings,
      source_urls:[url],
    });
    if(error)throw error;
    return {category,...outcome,checked_at:started};
  }catch(e){
    const warning=String((e as Error)?.message||e).slice(0,600);
    const {error}=await db.from("tariff_sync_runs").insert({
      category,checked_at:started,status:"error",source_status:"",
      changed_rows:0,verified_rows:0,warnings:[warning],
      source_urls:[ORIGIN+SOURCES[category]],
    });
    if(error)console.error("SYNC LOG INSERT ERROR",error);
    return {category,status:"error",checked_at:started,
      changed_rows:0,verified_rows:0,warnings:[warning]};
  }
}
Deno.serve(async (req)=>{
  if(req.method!=="POST")return respond({ok:false,error:"Metodo non consentito"},405);
  try{
    const body=await req.json();
    if(!await authorize(body))return respond({ok:false,error:"Non autorizzato"},403);
    // Independent failures never prevent checks of the other two sources.
    const outcomes=await Promise.all(categories.map(syncCategory));
    return respond({ok:true,results:outcomes});
  }catch(e){
    console.error("TARIFF AUTO SYNC",e);
    return respond({ok:false,error:"Controllo non riuscito"},500);
  }
});