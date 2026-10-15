// Public webpage extraction is performed server-side to avoid browser CORS.
// The value is never inferred: if the source layout changes, the API fails closed.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=600");
  try {
    const response = await fetch("https://www.abbassalebollette.it/glossario/pun-prezzo-unico-nazionale/", {headers:{"User-Agent":"Mozilla/5.0 (compatible; EnergyMarketDashboard/1.0)"}});
    if (!response.ok) return res.status(502).json({error:"Fonte non disponibile"});
    const html = await response.text();
    const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ");
    const monthNames=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
    const date = new Date();
    const month=monthNames[date.getUTCMonth()];
    const year=date.getUTCFullYear();
    const expression=new RegExp("PUN\\s+"+month+"\\s+"+year+"\\s*\\[\\s*provv\\.?\\s*\\]\\s*([0-9]+,[0-9]{4,6})","i");
    const match=text.match(expression);
    if (!match) return res.status(503).json({error:"Media provvisoria non pubblicata per il mese corrente"});
    const value=Number(match[1].replace(",","."));
    if (!Number.isFinite(value)||value<=0||value>2) return res.status(503).json({error:"Valore non valido"});
    return res.status(200).json({value,asOf:month+" "+year,unit:"EUR/kWh",status:"provvisorio",source:"https://www.abbassalebollette.it/glossario/pun-prezzo-unico-nazionale/"});
  } catch { return res.status(502).json({error:"Impossibile leggere la fonte"}); }
}
