import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const dataPath = path.join(root, 'src/data/drinks.json');
const outputDir = path.join(root, 'reports/image-audit');
const tileWidth = 260;
const imageHeight = 170;
const labelHeight = 72;
const gap = 14;
const columns = 4;
const pageSize = 24;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrapText(value, maxLength = 25) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function labelSvg(country) {
  const nameLines = wrapText(`${country.name}: ${country.drink}`, 28);
  const pathLines = wrapText(country.image.localPath.replace('/drinks/', ''), 35);
  const text = [...nameLines, ...pathLines.slice(0, 1)];
  const lines = text.map((line, index) => {
    const size = index === 0 ? 16 : 13;
    const weight = index === 0 ? 700 : 500;
    return `<text x="12" y="${24 + index * 20}" font-size="${size}" font-weight="${weight}" fill="#1d2722">${escapeHtml(line)}</text>`;
  }).join('');

  return Buffer.from(`
    <svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f7f2e8"/>
      ${lines}
    </svg>
  `);
}

async function makeTile(country) {
  const imagePath = path.join(root, 'public', country.image.localPath.replace(/^\//, ''));
  const isArt = imagePath.endsWith('.svg');
  const resized = await sharp(imagePath)
    .resize(tileWidth, imageHeight, { fit: isArt ? 'contain' : 'cover', position: 'attention', background: '#fff7ea' })
    .jpeg({ quality: 86 })
    .toBuffer();
  const label = await sharp(labelSvg(country)).png().toBuffer();
  return sharp({
    create: {
      width: tileWidth,
      height: imageHeight + labelHeight,
      channels: 3,
      background: '#f7f2e8'
    }
  })
    .composite([
      { input: resized, left: 0, top: 0 },
      { input: label, left: 0, top: imageHeight }
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

const countries = JSON.parse(await fs.readFile(dataPath, 'utf8'));
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const manifest = [];
for (let pageIndex = 0; pageIndex < Math.ceil(countries.length / pageSize); pageIndex += 1) {
  const pageCountries = countries.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const rows = Math.ceil(pageCountries.length / columns);
  const sheetWidth = columns * tileWidth + (columns + 1) * gap;
  const sheetHeight = rows * (imageHeight + labelHeight) + (rows + 1) * gap;
  const composites = [];

  for (let index = 0; index < pageCountries.length; index += 1) {
    const country = pageCountries[index];
    const row = Math.floor(index / columns);
    const column = index % columns;
    composites.push({
      input: await makeTile(country),
      left: gap + column * (tileWidth + gap),
      top: gap + row * (imageHeight + labelHeight + gap)
    });
    manifest.push({
      page: pageIndex + 1,
      country: country.name,
      drink: country.drink,
      image: country.image.localPath,
      title: country.image.fileTitle ?? ''
    });
  }

  const outputPath = path.join(outputDir, `sheet-${String(pageIndex + 1).padStart(2, '0')}.jpg`);
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: '#e9dfcf'
    }
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Math.ceil(countries.length / pageSize)} contact sheets to ${path.relative(root, outputDir)}`);