import fs from 'node:fs';

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');

const before = 'PREZZO FISSO AD HOC';
const after = 'PREZZO FISSO AD HOC SENZA PERDITE';

const count = s.split(before).length - 1;
if (count < 2) {
  throw new Error(`Expected at least 2 occurrences of ${before}, found ${count}`);
}

s = s.replaceAll(before, after);
fs.writeFileSync(path, s);

console.log(`Updated ${count} labels to ${after}`);
