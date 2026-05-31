import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataPath = join(root, 'src', 'data', 'drinks.json');
const strictLocalImages = process.env.STRICT_LOCAL_IMAGES === 'true';

const sourceSchema = z.object({ label: z.string().min(2), url: z.string().url() });
const imageSchema = z.object({
  localPath: z.string().nullable(),
  status: z.enum(['local-verified', 'photo-metadata-verified', 'download-pending', 'generated-local']),
  sourceUrl: z.string().url(),
  fileTitle: z.string().min(2),
  author: z.string().min(2),
  license: z.enum(['CC0', 'Public domain', 'CC BY 1.0', 'CC BY 2.0', 'CC BY 2.5', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 1.0', 'CC BY-SA 2.0', 'CC BY-SA 2.5', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'Site-generated']),
  attribution: z.string().min(2)
});
const countrySchema = z.object({
  mapId: z.string().min(2),
  iso2: z.string().length(2),
  iso3: z.string().length(3),
  isoNumeric: z.string().length(3),
  slug: z.string().min(2),
  name: z.string().min(2),
  flag: z.string().min(1),
  region: z.string().min(2),
  drink: z.string().min(2),
  drinkType: z.string().min(2),
  description: z.string().min(40),
  madeOf: z.string().min(40),
  confidence: z.enum(['official', 'high', 'medium', 'territory']),
  rationale: z.string().min(24),
  sources: z.array(sourceSchema).min(1),
  image: imageSchema
});

const countries = z.array(countrySchema).min(1).parse(JSON.parse(readFileSync(dataPath, 'utf8')));
const seen = new Set();
const errors = [];
const warnings = [];

for (const country of countries) {
  for (const key of [country.mapId, country.iso3, country.slug]) {
    if (seen.has(key)) errors.push(`Duplicate key detected: ${key}`);
    seen.add(key);
  }

  const flagFile = join(root, 'public', 'flags', `${country.iso2.toLowerCase()}.png`);
  if (!existsSync(flagFile)) errors.push(`${country.name} local flag is missing: /flags/${country.iso2.toLowerCase()}.png`);

  if (country.image.status === 'local-verified' || country.image.status === 'photo-metadata-verified' || country.image.status === 'generated-local') {
    if (!country.image.localPath) {
      errors.push(`${country.name} is marked local-verified without a localPath.`);
      continue;
    }
    const localFile = join(root, 'public', country.image.localPath.replace(/^\//, ''));
    if (!existsSync(localFile)) errors.push(`${country.name} local image is missing: ${country.image.localPath}`);
  }

  if (country.image.status === 'download-pending') {
    warnings.push(`${country.name}: ${country.image.fileTitle} is metadata-verified but not downloaded locally yet.`);
    if (strictLocalImages) errors.push(`${country.name} has no downloaded local image in STRICT_LOCAL_IMAGES mode.`);
  }
}

if (!existsSync(join(root, 'public', 'maps', 'countries-110m.json'))) errors.push('Missing public/maps/countries-110m.json map data.');

const mapCountriesPath = join(root, 'src', 'data', 'map-countries.json');
if (existsSync(mapCountriesPath)) {
  const mapCountries = JSON.parse(readFileSync(mapCountriesPath, 'utf8'));
  const dataMapIds = new Set(countries.map((country) => country.mapId));
  for (const mapCountry of mapCountries) {
    if (!dataMapIds.has(mapCountry.mapId)) errors.push(`Missing drink record for map feature: ${mapCountry.mapName} (${mapCountry.mapId})`);
  }
  if (mapCountries.length !== countries.length) errors.push(`Map coverage mismatch: ${mapCountries.length} map features, ${countries.length} drink records.`);
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`Error: ${error}`);
  process.exit(1);
}

console.log(`Data validation passed for ${countries.length} map countries.`);
if (!strictLocalImages) console.log('Set STRICT_LOCAL_IMAGES=true to fail on queued image downloads. Generated local artwork is allowed when no reusable photo is available.');