// Nomi ufficiali delle province (incluse alcune sigle storiche ancora presenti nel CRM).
// Non sostituire mai il codice con la regione: il cognome deve contenere la provincia.
const PROVINCE_NAMES: Record<string, string> = {
  AQ: "L'Aquila", CH: "Chieti", PE: "Pescara", TE: "Teramo",
  MT: "Matera", PZ: "Potenza",
  CZ: "Catanzaro", CS: "Cosenza", KR: "Crotone", RC: "Reggio Calabria", VV: "Vibo Valentia",
  AV: "Avellino", BN: "Benevento", CE: "Caserta", NA: "Napoli", SA: "Salerno",
  BO: "Bologna", FC: "Forlì-Cesena", FE: "Ferrara", MO: "Modena", PR: "Parma",
  PC: "Piacenza", RA: "Ravenna", RE: "Reggio Emilia", RN: "Rimini",
  GO: "Gorizia", PN: "Pordenone", TS: "Trieste", UD: "Udine",
  FR: "Frosinone", LT: "Latina", RI: "Rieti", RM: "Roma", VT: "Viterbo",
  GE: "Genova", IM: "Imperia", SP: "La Spezia", SV: "Savona",
  BG: "Bergamo", BS: "Brescia", CO: "Como", CR: "Cremona", LC: "Lecco",
  LO: "Lodi", MN: "Mantova", MI: "Milano", MB: "Monza e Brianza", PV: "Pavia",
  SO: "Sondrio", VA: "Varese",
  AN: "Ancona", AP: "Ascoli Piceno", FM: "Fermo", MC: "Macerata",
  PU: "Pesaro e Urbino",
  CB: "Campobasso", IS: "Isernia",
  AL: "Alessandria", AT: "Asti", BI: "Biella", CN: "Cuneo", NO: "Novara",
  TO: "Torino", VB: "Verbano-Cusio-Ossola", VC: "Vercelli",
  BA: "Bari", BT: "Barletta-Andria-Trani", BR: "Brindisi", FG: "Foggia",
  LE: "Lecce", TA: "Taranto",
  CA: "Cagliari", CI: "Carbonia-Iglesias", NU: "Nuoro", OG: "Ogliastra",
  OR: "Oristano", OT: "Olbia-Tempio", SS: "Sassari", SU: "Sud Sardegna",
  VS: "Medio Campidano",
  AG: "Agrigento", CL: "Caltanissetta", CT: "Catania", EN: "Enna",
  ME: "Messina", PA: "Palermo", RG: "Ragusa", SR: "Siracusa", TP: "Trapani",
  AR: "Arezzo", FI: "Firenze", GR: "Grosseto", LI: "Livorno", LU: "Lucca",
  MS: "Massa-Carrara", PI: "Pisa", PO: "Prato", PT: "Pistoia", SI: "Siena",
  BZ: "Bolzano", TN: "Trento", PG: "Perugia", TR: "Terni",
  AO: "Aosta",
  BL: "Belluno", PD: "Padova", RO: "Rovigo", TV: "Treviso", VE: "Venezia",
  VI: "Vicenza", VR: "Verona",
};

export function italianProvinceFullName(value: string): string {
  const code = String(value || "").trim().toLocaleUpperCase("it-IT");
  return PROVINCE_NAMES[code] || "";
}
