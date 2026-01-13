import fs from 'fs';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const BASE_URL = 'http://www.kraland.org/monde/evenements';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

const DATA_DIR = './data';
const EVENTS_FILE = `${DATA_DIR}/events.json`;
const INDEX_FILE = `${DATA_DIR}/event_index.json`;
const SENT_FILE = `${DATA_DIR}/sent_hashes.json`;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/* =========================
   🧠 UTILITAIRES
========================= */

function loadJSON(file, fallback = []) {
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file))
    : fallback;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
   🌐 FETCH PAGE
========================= */

async function fetchPage(page = 1) {
  const url = page === 1
    ? BASE_URL
    : `${BASE_URL}?page=${page}`;

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
   🔍 SCRAPE
========================= */

let events = loadJSON(EVENTS_FILE, []);
let index = new Set(loadJSON(INDEX_FILE, []));
let sent = new Set(loadJSON(SENT_FILE, []));

let pageCount = 0;
let totalNew = 0;

while (pageCount < 500) {
  pageCount++;

  const html = await fetchPage(pageCount);
  const $ = cheerio.load(html);

  let currentDate = null;
  let scraped = [];

  $('table.table tbody tr').each((_, tr) => {
    const text = $(tr).text().trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      currentDate = text;
      return;
    }

    const tds = $(tr).find('td');
    if (tds.length < 3 || !currentDate) return;

    const locationTd = tds.eq(0);
    const img = locationTd.find('img');
    const p = locationTd.find('p');

    scraped.push({
      date: currentDate,
      time: tds.eq(1).text().trim(),
      empire: img.attr('src')?.split('/').pop().replace('.png', ''),
      province: locationTd
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim(),
      city: p.text().trim(),
      text: tds.find('td[id^="ajax-"]').text().trim()
    });
  });

  scraped = scraped.filter(e => e.text && e.date);

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