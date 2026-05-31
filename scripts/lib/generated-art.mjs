function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(list, seed, offset = 0) {
  return list[(seed + offset) % list.length];
}

function paletteFor(country, seed) {
  const name = `${country.drink} ${country.drinkType}`.toLowerCase();
  if (/karkade|sobolo|bissap|hibiscus|zobo/.test(name)) return { bg: '#f7efe7', a: '#7a0f20', b: '#c62839', c: '#f3b46b', ink: '#251916' };
  if (/mint|tea|kahwa|chai|ataya|shaah|coffee/.test(name)) return { bg: '#f4ead7', a: '#375b45', b: '#9fbf7b', c: '#d6a14d', ink: '#1e1f1a' };
  if (/sake|airag|milk|doogh|tan|chiya/.test(name)) return { bg: '#eef2ef', a: '#6b7d8b', b: '#d9e0e5', c: '#d7b176', ink: '#20242a' };
  if (/beer|maheu|mahewu|urwarwa|tchoukoutou|umcombotsi|palm wine/.test(name)) return { bg: '#f5eadb', a: '#7b4a1f', b: '#d69a38', c: '#f2d28a', ink: '#23170f' };
  if (/arak|rakia|rakija|tequila|jenever|waragi|aguardiente|borovicka|brennivin|brannvin/.test(name)) return { bg: '#f2eee8', a: '#56406c', b: '#d7c1a0', c: '#e6b467', ink: '#211926' };
  const palettes = [
    { bg: '#f6efe4', a: '#305f72', b: '#f2a766', c: '#d96c5f', ink: '#1d2328' },
    { bg: '#f7f1e8', a: '#40513b', b: '#d8a25e', c: '#b85c38', ink: '#1d201d' },
    { bg: '#f5ede2', a: '#4b3854', b: '#f0b45b', c: '#d86f52', ink: '#221d28' },
    { bg: '#f3efe8', a: '#355c7d', b: '#6c9a8b', c: '#e7a35c', ink: '#1f232a' }
  ];
  return pick(palettes, seed);
}

function liquidColors(country, palette, seed) {
  const name = `${country.drink} ${country.drinkType}`.toLowerCase();
  if (/karkade|sobolo|hibiscus|bissap|zobo/.test(name)) return { top: '#b2182b', mid: '#8e1020', glow: '#e45b62' };
  if (/tea|mint|kahwa|shaah|ataya/.test(name)) return { top: '#b57b2d', mid: '#85561d', glow: '#e0bf7c' };
  if (/coffee/.test(name)) return { top: '#7f5435', mid: '#54311f', glow: '#c69a63' };
  if (/beer|urwarwa|tchoukoutou|umcombotsi|mahewu|maheu/.test(name)) return { top: '#deab41', mid: '#b87422', glow: '#f6d77f' };
  if (/milk|doogh|tan|airag/.test(name)) return { top: '#eef2f0', mid: '#d3dbdf', glow: '#ffffff' };
  if (/arak|rakia|rakija|jenever|brennivin|brannvin|borovicka|waragi|tequila|aguardiente/.test(name)) return { top: '#eadab7', mid: '#c8a66c', glow: '#fff2cf' };
  const options = [
    { top: '#d66a46', mid: '#ab3f2f', glow: '#f0b082' },
    { top: '#d9ad45', mid: '#b77727', glow: '#f3da8f' },
    { top: '#b46071', mid: '#84394c', glow: '#e1a1ad' },
    { top: '#8fb56a', mid: '#608142', glow: '#d6e8a8' }
  ];
  return pick(options, seed, 1);
}

function vesselStyle(country, seed) {
  const name = `${country.drink} ${country.drinkType}`.toLowerCase();
  if (/tea|kahwa|shaah|ataya|mint/.test(name)) return 'tea-glass';
  if (/coffee/.test(name)) return 'mug';
  if (/beer|urwarwa|tchoukoutou|umcombotsi|maheu|mahewu/.test(name)) return 'tall-glass';
  if (/arak|rakia|rakija|jenever|brennivin|brannvin|waragi|tequila|aguardiente/.test(name)) return 'shot-glass';
  if (/airag|doogh|tan|chiya|ranon'ampango/.test(name)) return 'bowl';
  return pick(['stem-glass', 'tall-glass', 'tea-glass'], seed, 2);
}

function vesselMarkup(style, palette, liquid) {
  if (style === 'shot-glass') {
    return `
  <path d="M465 220h270l-35 430H500Z" fill="#ffffff" opacity="0.9"/>
  <path d="M505 255h190l-28 324H533Z" fill="url(#liquidGradient)" opacity="0.94"/>
  <path d="M470 220h260" stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.95"/>
  <path d="M534 286h152" stroke="${liquid.glow}" stroke-width="7" stroke-linecap="round" opacity="0.45"/>`;
  }

  if (style === 'tea-glass') {
    return `
  <path d="M510 205c-18 150-28 272-32 366 4 92 89 145 122 145s118-53 122-145c-4-94-14-216-32-366Z" fill="#ffffff" opacity="0.93"/>
  <path d="M536 238c-12 113-18 214-20 302 2 70 52 114 84 114s82-44 84-114c-2-88-8-189-20-302Z" fill="url(#liquidGradient)" opacity="0.95"/>
  <ellipse cx="600" cy="220" rx="100" ry="26" fill="#ffffff" opacity="0.8"/>
  <ellipse cx="600" cy="249" rx="76" ry="18" fill="${liquid.glow}" opacity="0.36"/>`;
  }

  if (style === 'mug') {
    return `
  <rect x="390" y="244" width="360" height="322" rx="42" fill="#ffffff" opacity="0.9"/>
  <rect x="426" y="278" width="288" height="242" rx="28" fill="url(#liquidGradient)" opacity="0.95"/>
  <path d="M748 302c68 0 122 44 122 111s-54 111-122 111" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" opacity="0.92"/>
  <ellipse cx="570" cy="300" rx="110" ry="20" fill="${liquid.glow}" opacity="0.35"/>`;
  }

  if (style === 'bowl') {
    return `
  <path d="M378 388c0 183 95 270 222 270s222-87 222-270Z" fill="#ffffff" opacity="0.9"/>
  <path d="M420 408c16 128 81 206 180 206s164-78 180-206Z" fill="url(#liquidGradient)" opacity="0.94"/>
  <path d="M502 658h196l-34 88H536Z" fill="#e5d8c1" opacity="0.9"/>
  <ellipse cx="600" cy="390" rx="224" ry="42" fill="#ffffff" opacity="0.82"/>`;
  }

  if (style === 'tall-glass') {
    return `
  <path d="M456 168h288l-32 542H488Z" fill="#ffffff" opacity="0.92"/>
  <path d="M495 206h210l-24 452H519Z" fill="url(#liquidGradient)" opacity="0.95"/>
  <path d="M468 168h264" stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.94"/>
  <path d="M520 244h160" stroke="${liquid.glow}" stroke-width="8" stroke-linecap="round" opacity="0.4"/>`;
  }

  return `
  <path d="M498 196h204l54 364c7 46-25 97-72 114-24 9-51 14-84 14s-60-5-84-14c-47-17-79-68-72-114Z" fill="#ffffff" opacity="0.93"/>
  <path d="M525 226h150l44 302c6 39-20 82-60 96-18 6-38 10-59 10s-41-4-59-10c-40-14-66-57-60-96Z" fill="url(#liquidGradient)" opacity="0.95"/>
  <ellipse cx="600" cy="206" rx="108" ry="28" fill="#ffffff" opacity="0.82"/>`;
}

function garnishMarkup(country, palette, seed) {
  const name = `${country.drink} ${country.drinkType}`.toLowerCase();
  if (/mint|tea|kahwa|shaah|ataya/.test(name)) {
    return `
  <path d="M360 632c42-82 106-120 194-90-72 8-122 34-150 78 62-18 120-6 176 34-91 13-165 8-220-22Z" fill="#5d8351"/>
  <path d="M725 232c35-47 82-65 142-41-48 8-79 24-95 48 38-6 74 4 108 31-58 12-110 3-155-38Z" fill="#5d8351" opacity="0.88"/>`;
  }
  if (/karkade|sobolo|hibiscus|bissap|zobo/.test(name)) {
    return `
  <path d="M362 636c52-79 130-111 235-95-83 16-139 54-169 115 70-29 144-24 223 17-97 30-193 19-289-37Z" fill="#cf3048"/>
  <circle cx="397" cy="650" r="34" fill="#7a0f20" opacity="0.3"/>
  <path d="M702 196c34-28 70-34 110-20-34 9-56 25-67 48 28-7 56-1 83 19-42 17-84 6-126-27Z" fill="#cf3048" opacity="0.9"/>`;
  }
  if (/coffee/.test(name)) {
    return `
  <ellipse cx="378" cy="672" rx="88" ry="38" fill="#6f4b32" opacity="0.34"/>
  <ellipse cx="338" cy="655" rx="22" ry="34" fill="#6f4b32"/>
  <ellipse cx="392" cy="690" rx="22" ry="34" fill="#6f4b32"/>
  <ellipse cx="432" cy="648" rx="22" ry="34" fill="#6f4b32"/>`;
  }
  if (/beer|urwarwa|tchoukoutou|umcombotsi|maheu|mahewu/.test(name)) {
    return `
  <ellipse cx="595" cy="226" rx="90" ry="19" fill="#fff6df" opacity="0.95"/>
  <ellipse cx="575" cy="205" rx="48" ry="13" fill="#fff6df" opacity="0.82"/>
  <ellipse cx="632" cy="198" rx="38" ry="11" fill="#fff6df" opacity="0.88"/>`;
  }
  const accents = [
    `<circle cx="355" cy="650" r="26" fill="${palette.c}" opacity="0.52"/><circle cx="418" cy="628" r="18" fill="${palette.a}" opacity="0.26"/>`,
    `<path d="M730 225c31-22 66-24 105-7-33 8-55 22-66 43 26-2 50 8 73 29-41 13-82 1-112-35Z" fill="${palette.c}" opacity="0.78"/>`,
    `<ellipse cx="835" cy="684" rx="104" ry="32" fill="${palette.a}" opacity="0.08"/>`
  ];
  return pick(accents, seed, 3);
}

function countryPattern(seed, palette) {
  const motifs = [
    `<circle cx="196" cy="172" r="118" fill="${palette.a}" opacity="0.08"/><circle cx="196" cy="172" r="72" fill="none" stroke="${palette.c}" stroke-width="16" opacity="0.18"/>`,
    `<path d="M86 214c94-108 196-143 306-105-86 24-146 70-179 139 72-32 150-34 232-4-98 46-218 36-359-30Z" fill="${palette.b}" opacity="0.14"/>`,
    `<path d="M898 132c70 21 121 65 155 133-72-24-124-73-155-133Z" fill="${palette.c}" opacity="0.14"/><path d="M939 155c48 12 82 42 104 89-49-15-84-44-104-89Z" fill="${palette.a}" opacity="0.12"/>`,
    `<ellipse cx="950" cy="718" rx="176" ry="126" fill="${palette.c}" opacity="0.12"/><ellipse cx="914" cy="678" rx="106" ry="74" fill="${palette.a}" opacity="0.08"/>`
  ];
  return `${pick(motifs, seed, 4)}${pick(motifs, seed, 5)}`;
}

export function artPrompt(country) {
  return `Draw me a drink ${country.drink} from ${country.name}`;
}

export function artSvg(country) {
  const prompt = artPrompt(country);
  const seed = hashString(prompt);
  const palette = paletteFor(country, seed);
  const liquid = liquidColors(country, palette, seed);
  const style = vesselStyle(country, seed);
  const textSize = country.drink.length > 20 ? 58 : country.drink.length > 14 ? 66 : 74;
  const subtitleSize = country.name.length > 20 ? 36 : 42;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="${escapeXml(country.drink)} artwork for ${escapeXml(country.name)}">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="#fffaf1"/>
    </linearGradient>
    <linearGradient id="liquidGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${liquid.top}"/>
      <stop offset="52%" stop-color="${liquid.mid}"/>
      <stop offset="100%" stop-color="#3a2318"/>
    </linearGradient>
    <radialGradient id="surfaceGlow" cx="50%" cy="30%" r="62%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#bgGradient)"/>
  <rect x="0" y="0" width="1200" height="900" fill="url(#surfaceGlow)" opacity="0.55"/>
  ${countryPattern(seed, palette)}
  <ellipse cx="600" cy="758" rx="340" ry="72" fill="#583821" opacity="0.12"/>
  <ellipse cx="600" cy="744" rx="312" ry="46" fill="#ffffff" opacity="0.34"/>
  ${vesselMarkup(style, palette, liquid)}
  ${garnishMarkup(country, palette, seed)}
  <text x="84" y="114" fill="${palette.ink}" font-family="Georgia, 'Times New Roman', serif" font-size="${subtitleSize}" font-weight="700">${escapeXml(country.name)}</text>
  <text x="84" y="804" fill="${palette.ink}" font-family="Georgia, 'Times New Roman', serif" font-size="${textSize}" font-weight="800">${escapeXml(country.drink)}</text>
</svg>`;
}