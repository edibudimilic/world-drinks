import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { artSvg } from './lib/generated-art.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapIdFor(featureItem) {
  if (featureItem.id === undefined || featureItem.id === null) return `name:${slugify(featureItem.properties.name)}`;
  return String(featureItem.id).padStart(3, '0');
}

function fallbackIso2(name) {
  const special = {
    'Kosovo': 'XK',
    'N. Cyprus': 'NC',
    'Northern Cyprus': 'NC',
    'Somaliland': 'SL'
  };
  return special[name] ?? name.replace(/[^A-Z]/g, '').slice(0, 2).padEnd(2, 'X');
}

function fallbackIso3(name, mapId) {
  const special = {
    'Kosovo': 'XKX',
    'N. Cyprus': 'NCY',
    'Northern Cyprus': 'NCY',
    'Somaliland': 'SOL'
  };
  return special[name] ?? (mapId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 3).padEnd(3, 'X'));
}

function flagFromIso2(iso2) {
  if (!/^[A-Z]{2}$/.test(iso2) || ['NC', 'SL'].includes(iso2)) return '🏳️';
  return [...iso2].map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397)).join('');
}

const topo = JSON.parse(readFileSync(join(root, 'public', 'maps', 'countries-110m.json'), 'utf8'));
const mapFeatures = feature(topo, topo.objects.countries).features
  .map((featureItem) => ({ mapId: mapIdFor(featureItem), isoNumeric: featureItem.id === undefined ? '000' : String(featureItem.id).padStart(3, '0'), mapName: featureItem.properties.name }))
  .sort((a, b) => a.mapName.localeCompare(b.mapName));

writeFileSync(join(root, 'src', 'data', 'map-countries.json'), `${JSON.stringify(mapFeatures, null, 2)}\n`);

const seeds = new Map(
  readFileSync(join(root, 'src', 'data', 'drink-seeds.tsv'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [mapName, displayName, drink, drinkType, description, confidence, searchQuery] = line.split('\t');
      return [mapName, { displayName, drink, drinkType, description, confidence, searchQuery }];
    })
);

const existing = new Map();
try {
  for (const record of JSON.parse(readFileSync(join(root, 'src', 'data', 'drinks.json'), 'utf8'))) {
    existing.set(record.name, record);
  }
} catch {
  // First generation has no previous data to preserve.
}

const generatedDir = join(root, 'public', 'drinks', 'generated');
mkdirSync(generatedDir, { recursive: true });

let restByNumeric = new Map();
try {
  const response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,cca3,ccn3,flag,region');
  if (response.ok) {
    const restCountries = await response.json();
    restByNumeric = new Map(restCountries.filter((country) => country.ccn3).map((country) => [country.ccn3, country]));
  }
} catch {
  console.warn('REST Countries metadata fetch failed; falling back to existing/local metadata.');
}

const records = mapFeatures.map((mapCountry) => {
  const seed = seeds.get(mapCountry.mapName);
  if (!seed) throw new Error(`Missing seed row for ${mapCountry.mapName}`);

  const previous = existing.get(seed.displayName) ?? existing.get(mapCountry.mapName);
  const rest = restByNumeric.get(mapCountry.isoNumeric);
  const slug = slugify(seed.displayName);
  const generatedIso2 = fallbackIso2(seed.displayName);
  const generatedIso3 = fallbackIso3(seed.displayName, mapCountry.mapId);
  const iso2 = rest?.cca2 ?? (mapCountry.mapId.startsWith('name:') ? generatedIso2 : previous?.iso2 ?? generatedIso2);
  const iso3 = rest?.cca3 ?? (mapCountry.mapId.startsWith('name:') ? generatedIso3 : previous?.iso3 ?? generatedIso3);
  const base = {
    mapId: mapCountry.mapId,
    iso2,
    iso3,
    isoNumeric: mapCountry.isoNumeric,
    slug,
    name: seed.displayName,
    flag: rest?.flag ?? previous?.flag ?? flagFromIso2(iso2),
    region: rest?.region ?? previous?.region ?? 'World',
    drink: seed.drink,
    drinkType: seed.drinkType,
    description: seed.description,
    confidence: seed.confidence,
    rationale: `${seed.drink} is included as a culturally representative ${seed.drinkType} for ${seed.displayName}.`,
    sources: previous?.sources ?? [
      {
        label: `${seed.drink} research query`,
        url: `https://www.openverse.org/search/image?q=${encodeURIComponent(seed.searchQuery)}`
      }
    ]
  };

  const drinkToken = seed.drink.toLowerCase().split(/\s+/)[0];
  const previousImageText = `${previous?.image?.fileTitle ?? ''} ${previous?.image?.sourceUrl ?? ''}`.toLowerCase();
  if (previous?.image?.localPath && previous.image.status === 'photo-metadata-verified') {
    return { ...base, image: previous.image };
  }

  if (previous?.image?.localPath && previous.image.status === 'local-verified' && previousImageText.includes(drinkToken)) {
    return { ...base, image: previous.image };
  }

  const artPath = `/drinks/generated/${slug}.svg`;
  const record = {
    ...base,
    image: {
      localPath: artPath,
      status: 'generated-local',
      sourceUrl: `https://world-drinks.local/generated/${slug}`,
      fileTitle: `${seed.drink} generated artwork`,
      author: 'World Drinks app',
      license: 'Site-generated',
      attribution: 'Generated locally by the World Drinks app'
    }
  };
  writeFileSync(join(generatedDir, `${slug}.svg`), artSvg(record));
  return record;
});

writeFileSync(join(root, 'src', 'data', 'drinks.json'), `${JSON.stringify(records, null, 2)}\n`);
console.log(`Generated ${records.length} drink records for ${mapFeatures.length} map features.`);