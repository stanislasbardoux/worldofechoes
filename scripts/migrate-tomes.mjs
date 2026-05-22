import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const mdPath = path.join(root, 'src/assets/data/tomes_forum.md');
const jsonPath = path.join(root, 'src/assets/data/tomes.json');

/** Manual fixes for pin names that don't exactly match the forum catalog. */
const PIN_NAME_ALIASES = {
  "Arcchmage's Mark": 'Archmage Mark',
  "Broodmother'S Webbing": "Broodmother's Webbing",
  'Permafrost Aura': 'Permafrost',
  'Veerdant Ward': 'Verdant Ward',
  "Storm of the Spellweaver": 'Storm of the Spellweaver',
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

function norm(s) {
  return s
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseForum(md) {
  const tomes = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith('|') || line.includes('Tome|') || line.startsWith('|-')) {
      continue;
    }
    const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const [name, qualityRaw, ...descParts] = parts;
    const qualityLower = qualityRaw.toLowerCase();
    tomes.push({
      name,
      qualityRaw,
      quality: qualityLower === 'epic' || qualityLower === 'rare' ? qualityLower : 'rare',
      description: descParts.join('|'),
      wasNonStandardQuality: qualityLower !== 'epic' && qualityLower !== 'rare',
    });
  }
  return tomes;
}

const md = fs.readFileSync(mdPath, 'utf8');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const forumTomes = parseForum(md);

const forumByNorm = new Map(forumTomes.map((t) => [norm(t.name), t]));
const catalog = new Map();

for (const t of forumTomes) {
  catalog.set(t.name, {
    id: slug(t.name),
    name: t.name,
    quality: t.quality,
    description: t.description,
  });
}

const pinRenames = [];
const orphanPins = [];
const warnings = [];

for (const t of forumTomes.filter((x) => x.wasNonStandardQuality)) {
  warnings.push(
    `Forum tome "${t.name}" has quality "${t.qualityRaw}" — stored as rare.`,
  );
}

const pinTomeNames = new Set();
for (const loc of data.locations) {
  let canonical = PIN_NAME_ALIASES[loc.tomeName] ?? loc.tomeName;
  const forum = forumByNorm.get(norm(canonical));

  if (forum) {
    canonical = forum.name;
  } else {
    orphanPins.push(loc.tomeName);
    if (!catalog.has(canonical)) {
      catalog.set(canonical, {
        id: slug(canonical),
        name: canonical,
        quality: 'rare',
        description: '',
      });
      warnings.push(
        `Pin tome "${loc.tomeName}" has no forum entry — added as rare with empty description.`,
      );
    }
  }

  if (canonical !== loc.tomeName) {
    pinRenames.push({ from: loc.tomeName, to: canonical });
  }
  pinTomeNames.add(canonical);
}

const locations = data.locations.map((loc) => {
  let canonical = PIN_NAME_ALIASES[loc.tomeName] ?? loc.tomeName;
  const forum = forumByNorm.get(norm(canonical));
  if (forum) canonical = forum.name;
  const tome = catalog.get(canonical);
  const { rarity, tomeName, ...rest } = loc;
  return {
    ...rest,
    tomeId: tome?.id ?? slug(canonical),
  };
});

const tomes = [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name));

const output = {
  zones: data.zones,
  tomes,
  locations,
};

fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');

console.log('Migration complete.');
console.log('Tomes:', tomes.length);
console.log('Locations:', locations.length);
console.log('Pin renames:', pinRenames.length);
pinRenames.forEach((r) => console.log(`  ${r.from} -> ${r.to}`));
console.log('Warnings:');
warnings.forEach((w) => console.log(`  ${w}`));
