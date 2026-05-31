import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artPrompt, artSvg } from './lib/generated-art.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataPath = join(root, 'src', 'data', 'drinks.json');
const generatedDir = join(root, 'public', 'drinks', 'generated');

mkdirSync(generatedDir, { recursive: true });

const countries = JSON.parse(readFileSync(dataPath, 'utf8'));
let count = 0;

for (const country of countries) {
  if (country.image?.status !== 'generated-local') continue;
  const fileName = `${country.slug}.svg`;
  writeFileSync(join(generatedDir, fileName), artSvg(country));
  count += 1;
  console.log(`Generated ${fileName}: ${artPrompt(country)}`);
}

console.log(`Regenerated ${count} generated drink images.`);