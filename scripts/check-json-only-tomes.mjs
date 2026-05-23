import fs from 'fs';

const data = JSON.parse(fs.readFileSync('src/assets/data/tomes.json', 'utf8'));
const csv = fs.readFileSync('src/assets/data/echoes.csv', 'utf8');

const aliases = {
  "archmage's mark": 'archmage mark',
  'permafrost aura': 'permafrost',
  "nature's surge": 'nature surge',
};

function norm(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const csvNames = new Set();
for (const line of csv.split(/\r?\n/).slice(1)) {
  const name = line.split(',')[0]?.trim();
  if (!name) continue;
  csvNames.add(norm(aliases[norm(name)] ?? name));
}

const inJsonNotCsv = data.tomes.filter((t) => !csvNames.has(norm(t.name)));
console.log('In json but not csv:', inJsonNotCsv.map((t) => t.name).join('\n'));
