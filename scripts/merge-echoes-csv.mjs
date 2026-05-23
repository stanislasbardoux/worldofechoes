import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const root = path.resolve(import.meta.dirname, '..');
const csvPath = path.join(root, 'src/assets/data/echoes.csv');
const jsonPath = path.join(root, 'src/assets/data/tomes.json');

/** Manual aliases when CSV and catalog names differ but mean the same tome. */
const NAME_ALIASES = {
  "Archmage's Mark": 'Archmage Mark',
  "Permafrost Aura": 'Permafrost',
  "Nature's Surge": 'Nature Surge',
};

function slug(name) {
  return (
    'tome-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  );
}

function norm(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.length) continue;
    const [
      echoName = '',
      npc = '',
      location = '',
      area = '',
      zone = '',
      rarity = '',
      description = '',
    ] = cols;
    const name = echoName.trim();
    if (!name) continue;
    rows.push({
      name,
      npc: npc.trim(),
      location: location.trim(),
      area: area.trim(),
      zone: zone.trim(),
      rarity: rarity.trim().toLowerCase(),
      description: description.trim(),
    });
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function canonicalName(name) {
  const trimmed = name.trim();
  return NAME_ALIASES[trimmed] ?? trimmed;
}

function normalizeDesc(s) {
  return s
    .replace(/\|c[a-fA-F0-9]{8}/g, '')
    .replace(/\|r/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function descSimilarity(a, b) {
  const na = normalizeDesc(a);
  const nb = normalizeDesc(b);
  if (!na || !nb) return 1;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }
  return shared / Math.max(wordsA.size, wordsB.size);
}

function qualityFromRarity(r) {
  return r === 'epic' ? 'epic' : 'rare';
}

function placeName(row) {
  if (row.location && row.zone) return `${row.location} - ${row.zone}`;
  if (row.location) return row.location;
  if (row.zone) return row.zone;
  return 'Unknown location';
}

function mobsFromNpc(npc) {
  if (!npc) return [];
  return npc
    .split('/')
    .map((m) => m.trim())
    .filter(Boolean);
}

const csvText = fs.readFileSync(csvPath, 'utf8');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const csvRows = parseCsv(csvText);

const tomesByNorm = new Map(data.tomes.map((t) => [norm(t.name), t]));
const tomesById = new Map(data.tomes.map((t) => [t.id, t]));

const addedTomes = [];
const filledDescriptions = [];
const descMismatches = [];
const warnings = [];

for (const row of csvRows) {
  const name = canonicalName(row.name);
  const key = norm(name);
  let tome = tomesByNorm.get(key);

  if (!tome) {
    tome = {
      id: slug(name),
      name,
      quality: qualityFromRarity(row.rarity),
      description: row.description,
    };
    data.tomes.push(tome);
    tomesByNorm.set(key, tome);
    tomesById.set(tome.id, tome);
    addedTomes.push(name);
    continue;
  }

  if (row.description) {
    if (!tome.description) {
      tome.description = row.description;
      filledDescriptions.push(name);
    } else {
      const sim = descSimilarity(tome.description, row.description);
      if (sim < 0.75) {
        descMismatches.push({
          name,
          existing: tome.description,
          csv: row.description,
          similarity: Math.round(sim * 100),
        });
      }
    }
  }

  if (row.rarity && tome.quality !== qualityFromRarity(row.rarity)) {
    warnings.push(
      `${name}: quality is ${tome.quality} in tomes.json but ${row.rarity} in CSV (kept existing).`,
    );
  }
}

data.tomes.sort((a, b) => a.name.localeCompare(b.name));

const existingEchoImportIds = new Set(
  data.locations
    .filter((l) => l.id.startsWith('echo-import-'))
    .map((l) => l.id),
);

const newPins = [];
for (const row of csvRows) {
  const name = canonicalName(row.name);
  const tome = tomesByNorm.get(norm(name));
  if (!tome) continue;

  const pinId = `echo-import-${tome.id}`;
  if (existingEchoImportIds.has(pinId)) continue;

  const pin = {
    id: pinId,
    tomeId: tome.id,
    zone: 'kalimdor',
    x: 10,
    y: 10,
    placeName: placeName(row),
    mobs: mobsFromNpc(row.npc),
    specs: [],
  };
  if (row.area) pin.notes = row.area;
  newPins.push(pin);
  data.locations.push(pin);
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');

const stillMissingDesc = data.tomes
  .filter((t) => !t.description?.trim())
  .map((t) => t.name)
  .sort();

const report = {
  csvRows: csvRows.length,
  totalTomes: data.tomes.length,
  totalLocations: data.locations.length,
  addedTomes,
  filledDescriptions,
  newPins: newPins.length,
  descMismatches,
  warnings,
  stillMissingDesc,
};

fs.writeFileSync(
  path.join(root, 'scripts/echoes-merge-report.json'),
  JSON.stringify(report, null, 2),
);

console.log(JSON.stringify(report, null, 2));
