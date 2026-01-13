import fs from 'fs';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/* =========================
   🧠 UTILITAIRES
========================= */

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

function loadSet(file) {
  const data = loadJSON(file, []);
  if (Array.isArray(data)) return new Set(data);
  if (data && typeof data === 'object') return new Set(Object.keys(data));
  return new Set();
}

function eventHash(e) {
  return Buffer.from(
    `${e.date}|${e.time}|${e.empire}|${e.province}|${e.city}|${e.text}`
  ).toString('base64').slice(0, 100);
}

function sortEvents(events) {
  return events.sort((a, b) =>
    new Date(`${a.date} ${a.time || '00:00'}`) -
    new Date(`${b.date} ${b.time || '00:00'}`)
  );
}

/* =========================
   🌐 FETCH
========================= */

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }

  return res.text();
}

/* =========================
   🔎 PARSING
========================= */

function getNextPageUrl($) {
  const active = $('.pagination li.active');
  const next = active.next('li').find('a');
  return next.length ? next.attr('href') : null;
}

function scrapePage(html) {
  const $ = cheerio.load(html);
  const scraped = [];
  let currentDate = null;

  $('table.table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');

    // Ligne date
    if (tds.length === 1) {
      const dateText = tds.eq(0).text().trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        currentDate = dateText;
      }
      return;
    }

    if (tds.length < 3 || !currentDate) return;

    const locationTd = tds.eq(0);
    const img = locationTd.find('img');
    const p = locationTd.find('p');

    scraped.push({
      date: currentDate,
      time: tds.eq(1).text().trim(),
      empire: img.attr('src')?.split('/').pop().replace('.png', ''),
      province: locationTd.clone().children().remove().end().text().trim(),
      city: p.text().trim(),
      text: tds.eq(2).text().trim()
    });
  });

  return {
    events: scraped.filter(e => e.text && e.date),
    next: getNextPageUrl($)
  };
}

/* =========================
   🚀 EXECUTION
========================= */

let events = loadJSON(EVENTS_FILE, []);
let index = loadSet(INDEX_FILE);
let sent = loadSet(SENT_FILE);

let pageCount = 0;
let totalNew = 0;

let nextUrl = BASE_URL;

while (nextUrl && pageCount < MAX_PAGES) {
  pageCount++;

  const html = await fetchPage(nextUrl);
  const { events: scraped, next } = scrapePage(html);

  let newCount = 0;

  for (const e of scraped) {
    const h = eventHash(e);
    if (!index.has(h)) {
      index.add(h);
      events.push(e);
      newCount++;
      totalNew++;
    }
  }

  console.log(`📄 Page ${pageCount} → +${newCount}`);

  if (newCount === 0) {
    console.log('⛔ Page complète détectée');
    break;
  }

  nextUrl = next ? new URL(next, BASE_URL).href : null;
}

/* =========================
   📦 SAUVEGARDE
========================= */

sortEvents(events);
saveJSON(EVENTS_FILE, events);
saveJSON(INDEX_FILE, [...index]);

/* =========================
   📨 DISCORD
========================= */

const fresh = events.filter(e => {
  const h = eventHash(e);
  if (sent.has(h)) return false;
  sent.add(h);
  return true;
});

if (fresh.length && DISCORD_WEBHOOK_URL) {
  const content = `📡 **${fresh.length} nouveaux événements détectés**`;
  await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}

saveJSON(SENT_FILE, [...sent]);

console.log(`✅ Terminé — nouveaux événements : ${totalNew}`);