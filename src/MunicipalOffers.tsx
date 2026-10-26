import React,{useState} from "react";
import {jsPDF} from "jspdf";
type Mode="comparison-energy"|"comparison-gas"|"letter-energy"|"letter-gas";
const orange="#ff5200", sky="#008fbd", navy="#112448";
const number=(v:string)=>{const x=v.trim().replace(/\s/g,"");if(x.includes(",")&&x.includes("."))return Number(x.lastIndexOf(",")>x.lastIndexOf(".")?x.split(".").join("").replace(",","."):x.split(",").join(""))||0;return Number(x.replace(",","."))||0;};
const money=(v:number)=>v.toLocaleString("it-IT",{style:"currency",currency:"EUR"});
const inputStyle:React.CSSProperties={width:"100%",padding:"10px 12px",border:"1px solid #cbd5e1",borderRadius:7,boxSizing:"border-box",fontSize:15};
const fmt=(v:number,d=2)=>v.toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d});
const formatDateIT=(iso:string)=>{const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);return match?`${match[3]}/${match[2]}/${match[1]}`:"";};
const todayLocalISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const docText=(pdf:jsPDF,text:string,x:number,y:number,width=170)=>{const lines=pdf.splitTextToSize(text,width);pdf.text(lines,x,y);return y+lines.length*5.2+5};
async function savePdf(pdf:jsPDF,name:string){
 const nativeFiles=(window as any).AndroidFiles;
 if(nativeFiles&&typeof nativeFiles.savePdf==="function"){
   try{
     const data=pdf.output("datauristring");
     const base64=data.slice(data.indexOf(",")+1);
     nativeFiles.savePdf(base64,name);
     return;
   }catch(error){console.error("Salvataggio PDF nativo non riuscito",error);}
 }
 const android=/Android/i.test(navigator.userAgent);
 if(android){
   try{
     const file=new File([pdf.output("blob")],name,{type:"application/pdf"});
     if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
       await navigator.share({files:[file],title:name});
       return;
     }
   }catch(error){
     if(error instanceof DOMException&&error.name==="AbortError")return;
     console.warn("Condivisione PDF non disponibile",error);
   }
   const blob=pdf.output("blob");
   const url=URL.createObjectURL(blob);
   const link=document.createElement("a");
   link.href=url;link.download=name;link.style.display="none";
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),120000);
   alert("Se il PDF non viene salvato dall'APK, apri la webapp in Chrome per scaricarlo.");
   return;
 }
 pdf.save(name);
}
export default function MunicipalOffers(){
 const [mode,setMode]=useState<Mode>("comparison-energy");
 const [comune,setComune]=useState("");const [indirizzo,setIndirizzo]=useState("");
 const [supplier,setSupplier]=useState("");const [place,setPlace]=useState("");const [customPlace,setCustomPlace]=useState(false);
 const [date,setDate]=useState(todayLocalISO());
 const [values,setValues]=useState<Record<string,string>>({});
 const get=(key:string)=>values[key]||"";
 const put=(key:string,v:string)=>setValues(p=>({...p,[key]:v}));
 const gas=mode.endsWith("gas"),letter=mode.startsWith("letter"),kind=gas?"gas":"energy";
 const accent=gas?sky:orange;const accentRgb:[number,number,number]=gas?[0,143,189]:[255,82,0];
 const unit=gas?"€/Smc":"€/kWh",commodity=gas?"PSV":"PUN",quantity=gas?"Smc":"kWh",meter=gas?"PDR":"POD";
 const key=(field:string)=>kind+"-"+field;
 const v=(field:string)=>get(key(field));
 const n=(field:string)=>number(v(field));
 const costOld=n("consumption")*n("oldSpread")+n("meters")*12*n("oldFixed");
 const costNew=n("consumption")*n("newSpread")+n("meters")*12*n("newFixed");
 const diff=costOld-costNew,pct=costOld?diff/costOld*100:0;
 const field=(label:string,value:string,onChange:(v:string)=>void,extra?:string)=><label style={{display:"grid",gap:5,fontWeight:700,fontSize:13,color:navy,flex:"1 1 190px"}}>{label}<div style={{display:"flex",alignItems:"center",gap:6}}><input style={inputStyle} value={value} onChange={e=>onChange(e.target.value)} />{extra&&<span style={{whiteSpace:"nowrap",fontSize:12}}>{extra}</span>}</div></label>;
 const row=(title:string,old:string,current:string,highlight=false)=><tr><td style={{padding:10,borderBottom:"1px solid #e2e8f0"}}>{title}</td><td style={{padding:10,borderBottom:"1px solid #e2e8f0",textAlign:"right"}}>{old}</td><td style={{padding:10,borderBottom:"1px solid #e2e8f0",borderLeft:"2px solid "+accent,borderRight:"2px solid "+accent,background:gas?"#e8f8ff":"#fff2e8",textAlign:"right",fontWeight:highlight?900:600}}>{current}</td></tr>;
 const tableStyle:React.CSSProperties={width:"100%",borderCollapse:"collapse",fontSize:13};
 const comparisonRows=[["Costo spread",n("consumption")*n("oldSpread"),n("consumption")*n("newSpread")],["Commercializzazione",n("meters")*12*n("oldFixed"),n("meters")*12*n("newFixed")],["Totale annuo stimato",costOld,costNew]] as const;
 const comparisonPdf=()=>{const pdf=new jsPDF();let y=20;pdf.setTextColor(orange);pdf.setFontSize(27);pdf.setFont("helvetica","bold");pdf.text("+energia",15,y);pdf.setFontSize(10);pdf.text("S.p.A.",70,y);pdf.setTextColor(navy);pdf.setFontSize(9);pdf.text("Via Fedeli, 2/A - 06034 Foligno (PG)",15,27);pdf.setFontSize(15);pdf.text("COMPARAZIONE "+(gas?"GAS":"ENERGIA ELETTRICA"),195,20,{align:"right"});y=46;pdf.setFontSize(11);pdf.text("Comune: "+comune,15,y);pdf.text("Fornitore attuale: "+supplier,15,y+8);pdf.text("Consumo annuo: "+fmt(n("consumption"),0)+" "+quantity,15,y+18);pdf.text("Numero "+meter+": "+fmt(n("meters"),0),15,y+26);
 const grid=(heading:string,rows:[string,string,string][],start:number)=>{const left=15,width=180,headerHeight=10,top=start+10,rowTop=start+13,rowHeight=12,bodyBottom=rowTop+rows.length*rowHeight+8;const oldBg:[number,number,number]=gas?[221,241,250]:[255,233,213];const newBg:[number,number,number]=gas?[184,229,246]:[255,209,172];pdf.setFillColor(...accentRgb);pdf.rect(left,start,width,headerHeight,"F");pdf.setTextColor(255);pdf.setFontSize(10);pdf.setFont("helvetica","bold");pdf.text(heading,18,start+7);pdf.setFillColor(...oldBg);pdf.rect(87,top,45,bodyBottom-top,"F");pdf.setFillColor(...newBg);pdf.rect(132,top,63,bodyBottom-top,"F");pdf.setDrawColor(...accentRgb);pdf.setLineWidth(.45);pdf.rect(132,top,63,bodyBottom-top);pdf.setTextColor(navy);pdf.setFontSize(9);pdf.text("Voce",18,rowTop+4);pdf.text("Fornitore attuale",128,rowTop+4,{align:"right"});pdf.setTextColor(gas?"#006c94":"#b83c00");pdf.text("+Energia",190,rowTop+4,{align:"right"});pdf.setFont("helvetica","normal");pdf.setTextColor(navy);let z=rowTop+15;for(const [label,old,current] of rows){pdf.text(label,18,z);pdf.text(old,128,z,{align:"right"});pdf.setFont("helvetica","bold");pdf.text(current,190,z,{align:"right"});pdf.setFont("helvetica","normal");z+=rowHeight}return bodyBottom+12};
 y=grid("CONDIZIONI ECONOMICHE",[["Spread "+commodity+" ("+unit+")",v("oldSpread"),v("newSpread")],["Commercializzazione (€/utenza/mese)",v("oldFixed"),v("newFixed")]],88);
 y=grid("STIMA DEI COSTI ANNUI",comparisonRows.map(([l,a,b])=>[l,money(a),money(b)]),y);
 pdf.setFillColor(gas?231:255,gas?247:242,gas?253:232);pdf.roundedRect(15,y,180,30,3,3,"F");pdf.setTextColor(accent);pdf.setFontSize(11);pdf.text("Risparmio annuo stimato",22,y+10);pdf.text("Risparmio percentuale",112,y+10);pdf.setFontSize(18);pdf.text(money(diff),22,y+23);pdf.text(fmt(pct)+"%",112,y+23);
 pdf.setTextColor(navy);pdf.setFontSize(8);docText(pdf,"Confronto limitato a spread e commercializzazione. Sono esclusi oneri di rete, imposte e componenti regolamentate. La quota indice comune ai due fornitori non modifica la differenza calcolata.",15,y+40,180);
 pdf.text(formatDateIT(todayLocalISO()),15,275);void savePdf(pdf,"Comparazione-"+(gas?"Gas":"Energia")+"-"+comune.trim().replace(/\s+/g,"-")+".pdf");};
 const letterPdf=()=>{const pdf=new jsPDF();pdf.setFont("helvetica","bold");pdf.setFontSize(25);pdf.setTextColor(orange);pdf.text("+energia",18,20);pdf.setFontSize(10);pdf.text("S.p.A.",68,20);pdf.setTextColor(navy);pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.text(["Via Fedeli, 2/A","06034 - Foligno (PG)"],18,28);pdf.setFont("helvetica","bold");pdf.text("Spett.le COMUNE DI "+comune.toUpperCase(),192,40,{align:"right"});pdf.setFont("helvetica","normal");pdf.text(pdf.splitTextToSize(indirizzo,75),192,46,{align:"right"});let y=72;pdf.setFont("helvetica","bold");y=docText(pdf,"Oggetto: proposta per la fornitura di "+(gas?"gas metano":"energia elettrica")+" per le utenze del comune di "+comune+".",18,y);pdf.setFont("helvetica","normal");y=docText(pdf,"La presente per segnalare quanto segue: il comune attualmente fornito nel mercato libero e siamo a proporvi la nostra migliore offerta commerciale in relazione alle Vostre utenze.",18,y);y=docText(pdf,"Si precisa che le tariffe verranno rinnovate per ulteriori 12 mesi ("+commodity+" + Spread), dalla data di effettivo inizio di fornitura, questo per ciò che concerne il prezzo della materia "+(gas?"gas":"energia")+" fornita, poiché le restanti quote presenti in fattura restano immutate.",18,y);y=docText(pdf,"Nella tabella che segue vengono posti all'attenzione dell'Ente la differenza tra i prezzi offerti e quelli relativi a CONSIP.",18,y);pdf.setFillColor(gas?231:255,gas?247:241,gas?253:229);pdf.rect(18,y,174,22,"F");pdf.setTextColor(accent);pdf.setFont("helvetica","bold");pdf.text("+ENERGIA",62,y+8,{align:"center"});pdf.text("CONSIP",149,y+8,{align:"center"});pdf.setTextColor(navy);pdf.setFont("helvetica","normal");pdf.text(commodity+" + "+v("letterSpread")+" "+unit,62,y+16,{align:"center"});pdf.text(commodity+" + "+v("consipSpread")+" "+unit,149,y+16,{align:"center"});y+=34;
 y=docText(pdf,"- Le fatture verranno divise secondo i relativi capitoli di spesa così come indicato dall'ufficio competente, in modo tale da snellire il lavoro di gestione; infatti, ad oggi, l'Ente riceve una fattura per ogni utenza, come previsto dalla Salvaguardia.",18,y);
 pdf.setTextColor(accent);pdf.setFont("helvetica","bold");y=docText(pdf,"- L'azienda mette a disposizione il referente per l'eventuale gestione di pratiche tecniche quali SUBENTRI - PRIME ATTIVAZIONI - POSA CONTATORE - VOLTURE.",18,y);pdf.setTextColor(navy);pdf.setFont("helvetica","normal");
 pdf.setFont("helvetica","bold");y=docText(pdf,"Erogazione della fornitura:",18,y);pdf.setFont("helvetica","normal");y=docText(pdf,"Il distributore locale continuerà a garantire il servizio e l'assistenza tecnica necessaria, nel rispetto degli standard qualitativi fissati dall'Autorità del mercato elettrico (ARERA) a tutela del cliente finale.",18,y);
 const displayDate=formatDateIT(date);pdf.text((place||comune)+", "+displayDate,18,275);void savePdf(pdf,"Lettera-"+(gas?"Gas":"Energia")+"-"+comune.trim().replace(/\s+/g,"-")+".pdf");};
 const action=()=>{if(!comune.trim()){alert("Inserisci il nome del Comune.");return}if(letter){if(!indirizzo.trim()||!v("letterSpread")||!v("consipSpread")){alert("Completa indirizzo e spread prima di generare la lettera.");return}letterPdf()}else{if(!supplier.trim()||!v("consumption")||!v("meters")){alert("Completa fornitore e consumi.");return}comparisonPdf()}};
 const tabNames:[Mode,string][]=[["comparison-energy","COMPARAZIONE ENERGIA"],["comparison-gas","COMPARAZIONE GAS"],["letter-energy","LETTERA ENERGIA"],["letter-gas","LETTERA GAS"]];
 return <div style={{maxWidth:1250,margin:"0 auto",padding:16,color:navy}}>
 <div style={{background:"linear-gradient(105deg,#ff5200,#ff9a29)",color:"#fff",borderRadius:14,padding:"20px 24px",marginBottom:18}}><h1 style={{margin:0,fontSize:27}}>🏛 OFFERTE PER I COMUNI</h1><div>Comparazioni economiche e lettere commerciali</div></div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>{tabNames.map(([id,title])=><button key={id} onClick={()=>setMode(id)} style={{padding:"12px 16px",borderRadius:8,border:"1px solid #ffb78e",background:mode===id?orange:"#fff7f1",color:mode===id?"white":navy,fontWeight:800,cursor:"pointer"}}>{title}</button>)}</div>
 <div style={{background:"white",border:"1px solid #fbd3b9",borderRadius:13,padding:20,boxShadow:"0 3px 14px #1b2a4410"}}>
 <h2 style={{color:orange,marginTop:0}}>{gas?"🔥":"⚡"} {letter?"Lettera":"Comparazione"} {gas?"Gas":"Energia"}</h2>
 <div style={{display:"flex",flexWrap:"wrap",gap:15,marginBottom:20}}>{field("Nome del Comune",comune,x=>{setComune(x);if(!customPlace)setPlace(x)})}{!letter&&field("Fornitore attuale",supplier,setSupplier)}{letter&&<label style={{display:"grid",gap:5,flex:"1 1 250px",fontWeight:700,fontSize:13}}>Indirizzo completo del Comune<textarea value={indirizzo} onChange={e=>setIndirizzo(e.target.value)} rows={2} style={inputStyle}/></label>}</div>
 {letter?<><h3>Condizioni della proposta</h3><div style={{display:"flex",gap:15,flexWrap:"wrap",marginBottom:15}}>{field("Spread +Energia",v("letterSpread"),x=>put(key("letterSpread"),x),unit)}{field("Spread CONSIP (modificabile)",v("consipSpread"),x=>put(key("consipSpread"),x),unit)}</div><p style={{fontSize:12,color:"#64748b"}}>Inserisci o verifica lo spread CONSIP applicabile. Nessun valore viene presentato come ufficiale senza una fonte verificata.</p><div style={{display:"flex",gap:15,flexWrap:"wrap",marginBottom:20}}>{field("Luogo firma (modificabile)",place,x=>{setPlace(x);setCustomPlace(true)})}<label style={{display:"grid",gap:5,flex:"1 1 190px",fontWeight:700,fontSize:13}}>Data firma<input type="date" lang="it-IT" style={inputStyle} value={date} onChange={e=>setDate(e.target.value)}/></label></div>
 <div style={{border:"1px solid #fed7aa",borderRadius:10,padding:18,background:"#fffaf7"}}><h3 style={{color:orange}}>Anteprima condizioni lettera</h3><p>Spett.le COMUNE DI {comune.toUpperCase()}</p><p>{indirizzo}</p><p>Oggetto: proposta per la fornitura di {gas?"gas metano":"energia elettrica"}.</p><div style={{display:"flex",justifyContent:"space-around",gap:10,flexWrap:"wrap",padding:15,background:"#ffefe3"}}><strong>+ENERGIA: {commodity} + {v("letterSpread")||"—"} {unit}</strong><strong>CONSIP: {commodity} + {v("consipSpread")||"—"} {unit}</strong></div><p>{place||comune}, {formatDateIT(date)}</p></div></>:
 <><h3>Dati di consumo</h3><div style={{display:"flex",gap:15,flexWrap:"wrap",marginBottom:20}}>{field("Consumo annuo totale",v("consumption"),x=>put(key("consumption"),x),quantity)}{field("Numero "+meter,v("meters"),x=>put(key("meters"),x))}</div><h3>Condizioni economiche</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:14,marginBottom:22}}>{[["Fornitore attuale","old"],["+Energia","new"]].map(([name,prefix])=><div key={prefix} style={{border:prefix==="new"?"2px solid "+accent:"1px solid "+(gas?"#9bc9df":"#efc4a6"),borderRadius:10,padding:14,display:"grid",gap:14,background:prefix==="new"?(gas?"#e8f8ff":"#fff2e8"):(gas?"#f0f7fb":"#fff9f3")}}><strong style={{color:prefix==="new"?accent:navy}}>{name}</strong>{field("Spread "+commodity,v(prefix+"Spread"),x=>put(key(prefix+"Spread"),x),unit)}{field("Commercializzazione fissa",v(prefix+"Fixed"),x=>put(key(prefix+"Fixed"),x),"€/utenza/mese")}</div>)}</div>
 <h3>Risultato della comparazione</h3><div style={{overflowX:"auto"}}><table style={tableStyle}><thead><tr style={{background:accent,color:"white"}}><th style={{padding:10,textAlign:"left"}}>Voce</th><th style={{textAlign:"center",background:accent}}>Fornitore attuale</th><th style={{textAlign:"center",background:accent}}>+Energia</th><th style={{textAlign:"center"}}>Differenza</th><th style={{textAlign:"center"}}>Risparmio %</th></tr></thead><tbody>{comparisonRows.map(([label,old,curr])=><tr key={label}><td style={{padding:9}}>{label}</td><td style={{textAlign:"center"}}>{money(old)}</td><td style={{textAlign:"center",borderLeft:"2px solid "+orange,borderRight:"2px solid "+orange}}>{money(curr)}</td><td style={{textAlign:"center"}}>{money(old-curr)}</td><td style={{textAlign:"center"}}>{old?fmt((old-curr)/old*100)+"%":"—"}</td></tr>)}</tbody></table></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:20}}>{[["Risparmio annuo stimato",money(diff)],["Risparmio percentuale",fmt(pct)+"%"]].map(([l,v])=><div key={l} style={{background:"#fff0e6",padding:17,borderRadius:10,color:orange,textAlign:"center"}}><div style={{fontWeight:700}}>{l}</div><strong style={{fontSize:26}}>{v}</strong></div>)}</div><p style={{fontSize:12,color:"#64748b"}}>Confronto economico limitato a spread e commercializzazione. Non rappresenta il totale della bolletta.</p></>}
 <button onClick={action} style={{background:orange,color:"white",border:0,borderRadius:9,padding:"13px 20px",fontWeight:800,cursor:"pointer",marginTop:20}}>📄 {letter?"SCARICA PDF LETTERA":"GENERA PDF COMPARAZIONE"}</button>
 </div></div>
}