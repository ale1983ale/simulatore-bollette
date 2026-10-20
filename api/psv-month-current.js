// Read the source's published monthly PSV value; do not infer missing or stale prices.
export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=1800, stale-while-revalidate=300");
  try{
    const source="https://www.abbassalebollette.it/glossario/psv/";
    const response=await fetch(source,{headers:{"User-Agent":"Mozilla/5.0 (compatible; EnergyMarketDashboard/1.0)","Accept":"text/html"}});
    if(!response.ok)return res.status(502).json({error:"Fonte PSV non disponibile (HTTP "+response.status+")"});
    const html=await response.text();
    const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ");
    const parts=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",month:"long",year:"numeric"}).formatToParts(new Date());
    const month=parts.find(p=>p.type==="month")?.value||"";
    const year=parts.find(p=>p.type==="year")?.value||"";
    const expression=new RegExp("PSV\\s+"+month+"\\s+"+year+"\\s*(\\[\\s*Provv\\s*\\])?\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(?:\\[\\s*stima\\s*\\])?\\s*([0-9]+[.,][0-9]+)\\s*(\\[\\s*stima\\s*\\])?","i");
    const match=text.match(expression);
    if(!match)return res.status(503).json({error:"PSV mensile del mese corrente non pubblicato dalla fonte"});
    const value=Number(match[3].replace(",","."));
    if(!Number.isFinite(value)||value<=0||value>5)return res.status(503).json({error:"Valore PSV mensile non valido"});
    const updated=text.match(/Aggiornato\s+al\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    const provisional=Boolean(match[1]||match[4]);
    return res.status(200).json({value,month,year,asOf:updated?.[1]||null,status:provisional?"provvisorio":"definitivo",source,unit:"EUR/Smc"});
  }catch(e){return res.status(502).json({error:"Impossibile leggere la fonte PSV",detail:String(e?.message||e)});}
}
