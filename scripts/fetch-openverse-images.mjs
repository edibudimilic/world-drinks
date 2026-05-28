import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataPath = join(root, 'src', 'data', 'drinks.json');
const seedsPath = join(root, 'src', 'data', 'drink-seeds.tsv');
const drinksDir = join(root, 'public', 'drinks', 'openverse');
const max = Number.parseInt(process.env.OPENVERSE_MAX ?? '999', 10);

await mkdir(drinksDir, { recursive: true });

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function licenseName(item) {
  const license = String(item.license ?? '').toLowerCase();
  const version = item.license_version ? ` ${item.license_version}` : ' 2.0';
  if (license === 'cc0') return 'CC0';
  if (license === 'pdm' || license === 'publicdomain') return 'Public domain';
  if (license === 'by') return `CC BY${version}`;
  if (license === 'by-sa') return `CC BY-SA${version}`;
  return null;
}

function scoreCandidate(item, country) {
  const text = `${item.title ?? ''} ${item.tags?.map((tag) => tag.name).join(' ') ?? ''}`.toLowerCase();
  const drinkTokens = country.drink.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const typeTokens = country.drinkType.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  let score = 0;
  for (const token of drinkTokens) if (text.includes(token)) score += 3;
  for (const token of typeTokens) if (text.includes(token)) score += 1;
  if (String(item.url ?? '').includes('staticflickr')) score += 1;
  return score;
}

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': 'WorldDrinksMap/0.1 local implementation' } });
  if (!response.ok || !response.body) throw new Error(`download failed ${response.status}`);
  await pipeline(response.body, createWriteStream(destination));
}

const countries = JSON.parse(readFileSync(dataPath, 'utf8'));
const seedQueries = new Map(
  readFileSync(seedsPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [mapName, displayName, , , , , searchQuery] = line.split('\t');
      return [displayName || mapName, searchQuery];
    })
);
let changed = 0;
let attempted = 0;

for (const country of countries) {
  if (changed >= max) break;
  if (country.image.status !== 'generated-local') continue;

  attempted += 1;
  const queries = [
    seedQueries.get(country.name),
    `${country.drink} ${country.name}`,
    `${country.drink} ${country.drinkType}`,
    `${country.drink} drink`,
    country.drink
  ].filter(Boolean);

  try {
    const candidates = [];

    for (const query of queries) {
      const apiUrl = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&license_type=commercial,modification&extension=jpg,jpeg,png&page_size=8`;
      const response = await fetch(apiUrl, { headers: { 'User-Agent': 'WorldDrinksMap/0.1 local implementation' } });
      if (!response.ok) throw new Error(`Openverse ${response.status}`);
      const data = await response.json();
      candidates.push(...[...(data.results ?? [])]
        .map((item) => ({ item, score: scoreCandidate(item, country), license: licenseName(item) }))
        .filter((entry) => entry.license && entry.item.url && entry.score > 0)
      );
    }

    const rankedCandidates = candidates
      .sort((a, b) => b.score - a.score)
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.item.url === entry.item.url) === index)
      .slice(0, 12);

    if (rankedCandidates.length === 0) {
      console.warn(`No matched photo candidate for ${country.name}: ${country.drink}`);
      continue;
    }

    let selected = null;
    let fileName = null;
    for (const candidate of rankedCandidates) {
      try {
        const extension = candidate.item.url.match(/\.(png|jpe?g)(?:$|[?#])/i)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg';
        fileName = `${country.slug}.${extension}`;
        const localFile = join(drinksDir, fileName);
        await download(candidate.item.url, localFile);
        selected = candidate;
        break;
      } catch {
        selected = null;
      }
    }

    if (!selected || !fileName) {
      throw new Error('all matched candidate downloads failed');
    }

    country.image = {
      localPath: `/drinks/openverse/${fileName}`,
      status: 'photo-metadata-verified',
      sourceUrl: selected.item.foreign_landing_url ?? selected.item.url,
      fileTitle: selected.item.title || `${country.drink} photo`,
      author: selected.item.creator || selected.item.provider || 'Openverse contributor',
      license: selected.license,
      attribution: `${selected.item.creator || 'Openverse contributor'}, ${selected.license}, via ${selected.item.provider ?? 'Openverse'}`
    };
    changed += 1;
    console.log(`Downloaded ${country.name}: ${country.drink}`);
  } catch (error) {
    console.warn(`Image fetch failed for ${country.name}: ${error.message}`);
  }
}

writeFileSync(dataPath, `${JSON.stringify(countries, null, 2)}\n`);
console.log(`Attempted ${attempted}; downloaded ${changed} licensed photo candidates.`);