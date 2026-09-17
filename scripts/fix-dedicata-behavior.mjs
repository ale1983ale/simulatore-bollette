import fs from 'node:fs';

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');

// 1) Restore DEDICATA as a separate offer alongside +SICURADEDICATA.
s = s.replace(
  /const INITIAL_ENERGY_OFFERS: EnergyOffer\[\] = \[\s*\{ nome: "\+SICURADEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0 \},/,
  'const INITIAL_ENERGY_OFFERS: EnergyOffer[] = [\n  { nome: "DEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0 },\n  { nome: "+SICURADEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0 },'
);

s = s.replace(
  /const INITIAL_GAS_OFFERS: GasOffer\[\] = \[\s*\{ nome: "\+SICURADEDICATA", canone: 0, spread: 0, quotaVariabile: 0 \},/,
  'const INITIAL_GAS_OFFERS: GasOffer[] = [\n  { nome: "DEDICATA", canone: 0, spread: 0, quotaVariabile: 0 },\n  { nome: "+SICURADEDICATA", canone: 0, spread: 0, quotaVariabile: 0 },'
);

// 2) Make dedicated detection robust and keep fixed-dedicated detection separate.
s = s.replace(
  /const isDedicatedOffer = \(offer: string\) =>\s*offer === "DEDICATA" \|\| offer === "\+SICURADEDICATA";/,
  `const normalizeOfferName = (offer: string) => String(offer || "").trim().toUpperCase();\n\nconst isFixedDedicatedOffer = (offer: string) =>\n  ["+SICURADEDICATA", "SICURADEDICATA", "+FISSO DEDICATA", "FISSO DEDICATA"].includes(normalizeOfferName(offer));\n\nconst isDedicatedOffer = (offer: string) =>\n  normalizeOfferName(offer) === "DEDICATA" || isFixedDedicatedOffer(offer);`
);

// 3) Fixed-dedicated gets PREZZO FISSO AD HOC labels; standard DEDICATA keeps Spread.
s = s.replaceAll('s.offerta === "+SICURADEDICATA"', 'isFixedDedicatedOffer(s.offerta)');

// 4) Do NOT merge DEDICATA into +SICURADEDICATA when loading saved settings.
s = s.replaceAll(
  '["+FISSO DEDICATA", "SICURADEDICATA", "DEDICATA"].includes(offer.nome)',
  '["+FISSO DEDICATA", "SICURADEDICATA"].includes(offer.nome)'
);

// Sanity checks.
const required = [
  '{ nome: "DEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0 }',
  '{ nome: "+SICURADEDICATA", canone: 0, spread: 0, maggiorazioneCapacityMarket: 0 }',
  '{ nome: "DEDICATA", canone: 0, spread: 0, quotaVariabile: 0 }',
  '{ nome: "+SICURADEDICATA", canone: 0, spread: 0, quotaVariabile: 0 }',
  'const isFixedDedicatedOffer = (offer: string) =>',
  'normalizeOfferName(offer) === "DEDICATA" || isFixedDedicatedOffer(offer)',
];
for (const needle of required) {
  if (!s.includes(needle)) throw new Error(`Patch incomplete, missing: ${needle}`);
}
if (s.includes('["+FISSO DEDICATA", "SICURADEDICATA", "DEDICATA"].includes(offer.nome)')) {
  throw new Error('DEDICATA is still being merged into +SICURADEDICATA');
}

fs.writeFileSync(path, s);
console.log('DEDICATA and +SICURADEDICATA behavior restored.');
