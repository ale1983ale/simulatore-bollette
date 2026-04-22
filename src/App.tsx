<div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 12,
                alignItems: isMobile ? "stretch" : "center",
                flexWrap: "wrap",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <div
 style={{
   background:"#fffbea",
   border:"2px solid #e8d98a",
   borderRadius:8,
   padding:8
 }}
>
{field(
 "DISP + CP. Mrk da Calcolare",
 s.dispacciamentoCapacityMarket,
 (v)=>set("dispacciamentoCapacityMarket",v),
 "number"
)}
</div>

              <div style={{ minWidth: isMobile ? 0 : 220, width: isMobile ? "100%" : undefined }}>
  <div
    style={{
      border:"1px solid #cbd5e1",
      borderRadius:8,
      padding:10,
      background:"#ffffff"
    }}
  >
    <div
 style={{
   fontSize:12,
   fontWeight:700,
   lineHeight:1.2,
   marginBottom:8
 }}
>
DISP + CP.Mrk<br />
Base suggerito
</div>

    <div
  style={{
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    gap:10
  }}
>
  <div
    style={{
      fontSize:18,
      fontWeight:700
    }}
  >
    {numFormat(r.dispCpBase,6)}
  </div>

  <button
 type="button"
 onClick={() =>
   set(
     "dispacciamentoCapacityMarket",
     String(r.dispCpBase)
   )
 }
 style={{
   padding:"6px 10px",
   borderRadius:20,
   border:"1px solid #d97706",
   background:"#fff7ed",
   color:"#c96a00",
   fontWeight:700,
   fontSize:12,
   cursor:"pointer",
   whiteSpace:"nowrap"
 }}
>
↺ Applica
</button>
</div>
  </div>
</div>
