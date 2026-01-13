import fs from 'fs';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

/* =========================
   ⚙️ CONFIG
========================= */

const BASE_URL = 'http://www.kraland.org/monde/evenements';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

const DATA_DIR = './data';
const EVENTS_FILE = `${DATA_DIR}/events.json`;
const INDEX_FILE = `${DATA_DIR}/event_index.json`;
const SENT_FILE = `${DATA_DIR}/sent_hashes.json`;

const MAX_PAGES = 500;
const MAX_EMPTY_PAGES = 5;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/* =========================
   🏰 EMPIRES
========================= */

const EMPIRE_MAP = {
  f0: 'Mondial',
  f1: 'République de Kraland',
  f2: 'Empire Brun',
  f3: 'Palladium Corporation',
  f4: 'Théocratie Seelienne',
  f5: 'Paradigme Vert',
  f6: 'Khanat Elmérien',
  f7: 'Confédération Libre',
  f8: 'Royaume de Ruthvénie',
  f9: 'Provinces indépendantes',
  f10: 'ADMIN'
};

const EMPIRE_COLOR = {
  'Mondial': 0xBDC3C7,
  'République de Kraland': 0xFF6B6B,
  'Empire Brun': 0xA97100,
  'Palladium Corporation': 0xFFFF99,
  'Théocratie Seelienne': 0xE6F58F,
  'Paradigme Vert': 0x7CFF7C,
  'Khanat Elmérien': 0xD18CFF,
  'Confédération Libre': 0xBDBDBD,
  'Royaume de Ruthvénie': 0x7FA36A,
  'Provinces indépendantes': 0xB5B34A,
  'ADMIN': 0x2C2C2C
};

const resolveEmpire = code => EMPIRE_MAP[code] || code || 'Inconnu';
const empireColor = empire => EMPIRE_COLOR[empire] ?? 0x34495e;

/* =========================
   🧠 UTILITAIRES
========================= */

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadJSON(file, fallback = []) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function eventHash(e){
  return e.id || Buffer.from(
    [
      e.date,
      e.time,
      e.empire,
      e.province,
      e.city,
      e.text
    ].map(normalizeForHash).join('|')
  ).toString('base64').slice(0,100);
}

function sortEvents(events) {
  return events.sort((a, b) =>
    new Date(`${a.date} ${a.time || '00:00'}`) -
    new Date(`${b.date} ${b.time || '00:00'}`)
  );

}
function normalizeForHash(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFKD')                 // Décompose Unicode (é → e + ́)
    .replace(/[\u0300-\u036f]/g, '')   // Supprime les accents
    .replace(/[’‘]/g, "'")             // Apostrophes typographiques
    .replace(/[“”«»]/g, '"')           // Guillemets typographiques
    .replace(/\u00a0/g, ' ')            // Espaces insécables
    .replace(/\s+/g, ' ')               // Espaces multiples
    .toLowerCase()
    .trim();
}

function splitLongLine(line, max = 4096) {
  const parts = [];
  let rest = line;

  while (rest.length > max) {
    parts.push(rest.slice(0, max));
    rest = rest.slice(max);
  }

  if (rest) parts.push(rest);
  return parts;
}

function chunkEmbedLines(lines, maxLength = 4096) {
  const chunks = [];
  let current = '';

  for (let line of lines) {

    // Sécurité : une ligne seule trop longue
    if (line.length > maxLength) {
      console.warn('⚠️ Ligne trop longue, découpage forcé');
      const parts = splitLongLine(line, maxLength);

      if (current) {
        chunks.push(current);
        current = '';
      }

      for (const part of parts) {
        chunks.push(part);
      }
      continue;
    }

    if ((current + '\n' + line).length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

async function sendWebhookWithRetry(payload, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await sendWebhookWithRetry({
    embeds: [{
        title: `📅 ${date} — ${empire}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`,
        color: empireColor(empire),
        description: chunks[i],
        footer: {
        text: `CROWS ScrapeYard • ${evts.length} événements`
        }
    }]
    });

    if (res.ok) return;

    if (res.status === 429) {
      const data = await res.json();
      const wait = Math.ceil((data.retry_after || 1) * 1000);

      console.warn(
        `⏳ Rate limit Discord, retry dans ${wait}ms (tentative ${attempt}/${maxRetries})`
      );

      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    // Autre erreur = abandon
    console.error(
      `❌ Discord error ${res.status}`,
      await res.text()
    );
    return;
  }

  console.error('💥 Abandon : trop de retries Discord');
}

async function sendWebhookGuaranteed(payload) {
  while (true) {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return; // envoyé
    }

    if (res.status === 429) {
      const data = await res.json();
      const waitMs = Math.ceil((data.retry_after || 1) * 1000);

      console.warn(`⏳ Rate limit, attente ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      continue; // on réessaie TOUJOURS
    }

    // Autre erreur (rare)
    const text = await res.text();
    throw new Error(`Discord error ${res.status}: ${text}`);
  }
}

/* =========================
   📨 DISCORD
========================= */

async function sendToDiscord(events) {
  if (!DISCORD_WEBHOOK_URL) return;

  const sent = new Set(loadJSON(SENT_FILE, []));
  const fresh = [];

  for (const e of events) {
    const h = eventHash(e);
    if (!sent.has(h)) {
      sent.add(h);
      fresh.push(e);
    }
  }

  if (!fresh.length) return;

  sortEvents(fresh);

  const timeline = {};
  for (const e of fresh) {
    timeline[e.date] ??= {};
    timeline[e.date][e.empire] ??= [];
    timeline[e.date][e.empire].push(e);
  }

  for (const [date, empires] of Object.entries(timeline)) {
    for (const [empire, evts] of Object.entries(empires)) {

      const lines = evts.map(
        e => `**${e.time || '--:--'}** — ${e.text}`
      );

      const chunks = chunkEmbedLines(lines);

        for (let i = 0; i < chunks.length; i++) {
        await sendWebhookGuaranteed({
            embeds: [{
            title: `📅 ${date} — ${empire}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`,
            color: empireColor(empire),
            description: chunks[i],
            footer: {
                text: `CROWS ScrapeYard • ${evts.length} événements`
            }
            }]
        });

        // petit confort, pas obligatoire mais aide
        await new Promise(r => setTimeout(r, 200));
        }
    }
  }

  saveJSON(SENT_FILE, [...sent]);
}

/* =========================
   🚀 SCRAPER
========================= */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let events = loadJSON(EVENTS_FILE, []);
  let index = new Set(loadJSON(INDEX_FILE, []));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('table.table tbody tr', { timeout: 15000 });
  await page.selectOption('select', { label: 'Tous les empires' });
  await page.waitForTimeout(1000);

  let nextUrl = page.url();
  let pageCount = 0;
  let emptyPages = 0;

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount++;
    await page.goto(nextUrl, { waitUntil: 'networkidle' });

const { scrapedEvents, next } = await page.evaluate(() => {
  const rows = document.querySelectorAll('table.table tbody tr');

  let currentDate = null;
  let currentEmpire = null;
  let currentProvince = "";
  let currentCity = "";

  const events = [];
  const timeRegex = /^\d{2}:\d{2}$/;

  rows.forEach(tr => {
    const text = tr.innerText.trim();

    // --- DATE ---
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      currentDate = text;
      return;
    }

    const tds = [...tr.querySelectorAll('td')];
    if (!tds.length || !currentDate) return;

    // --- EMPIRE ---
    const img = tds[0].querySelector('img');
    if (img?.src) {
      currentEmpire = img.src.split('/').pop().replace('.png', '');
    }

    // --- PROVINCE / VILLE ---
    const provinceText = tds[0].cloneNode(true);
        provinceText.querySelector('p')?.remove();
        provinceText.querySelector('img')?.remove();
    const province = provinceText.textContent.replace(/\u00a0/g, ' ').trim();
    const cityText = tds[0]?.querySelector('p')?.innerText?.trim();

    if (province) currentProvince = province;
    if (cityText) currentCity = cityText;

    // --- EVENT ---
    const time = tds[1]?.innerText?.trim();

    const textCell = tr.querySelector('td[id^="ajax-"]');
    const eventText = textCell?.innerText?.trim();
    const id = textCell?.id;


if (timeRegex.test(time) && eventText) {
      events.push({
        id,
        date: currentDate,
        time,
        empire: currentEmpire,
        province: currentProvince,
        city: currentCity,
        text: eventText
      });
    }
  });

  const active = document.querySelector('.pagination li.active');
  const next =
    active?.nextElementSibling?.querySelector('a')?.href || null;

  return { scrapedEvents: events, next };
});

    let newCount = 0;

    for (const raw of scrapedEvents) {
      const e = {
        date: normalizeText(raw.date),
        time: normalizeText(raw.time),
        empire: normalizeText(resolveEmpire(raw.empire)),
        province: normalizeText(raw.province),
        city: normalizeText(raw.city),
        text: normalizeText(raw.text)
      };

      if (!e.date || !e.text) continue;

      const h = eventHash(e);
      if (!index.has(h)) {
        index.add(h);
        events.push(e);
        newCount++;
      }
    }

    console.log(`📄 Page ${pageCount} → +${newCount}`);

    if (newCount === 0) {
      emptyPages++;
      if (emptyPages >= MAX_EMPTY_PAGES) {
        console.log(`⛔ ${MAX_EMPTY_PAGES} pages sans nouveautés, arrêt`);
        break;
      }
    } else {
      emptyPages = 0;
    }

    nextUrl = next;
  }

  sortEvents(events);
  saveJSON(EVENTS_FILE, events);
  saveJSON(INDEX_FILE, [...index]);

  await sendToDiscord(events);
  await browser.close();

  console.log(`✅ Terminé — total événements : ${events.length}`);
})();