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
const empireColor = e => EMPIRE_COLOR[e] ?? 0x34495e;

/* =========================
   🧠 UTILITAIRES
========================= */

const loadJSON = (file, fallback = []) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : fallback;

const saveJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

const eventHash = e =>
  Buffer.from(
    `${e.date}|${e.time}|${e.empire}|${e.province}|${e.city}|${e.text}`
  ).toString('base64').slice(0, 100);

const sortEvents = e =>
  e.sort((a, b) =>
    new Date(`${a.date} ${a.time || '00:00'}`) -
    new Date(`${b.date} ${b.time || '00:00'}`)
  );

/* =========================
   📨 DISCORD
========================= */

async function sendToDiscord(events) {
  if (!DISCORD_WEBHOOK_URL) return;

  const sent = new Set(loadJSON(SENT_FILE, []));
  const fresh = events.filter(e => {
    const h = eventHash(e);
    if (sent.has(h)) return false;
    sent.add(h);
    return true;
  });

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
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `📅 ${date} — ${empire}`,
            color: empireColor(empire),
            description: evts
              .map(e => `**${e.time || '--:--'}** — ${e.text}`)
              .join('\n')
              .slice(0, 4096),
            footer: { text: `CROWS ScrapeYard • ${evts.length}` }
          }]
        })
      });

      await new Promise(r => setTimeout(r, 900));
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

  let pageCount = 0;
  let nextUrl = BASE_URL;

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount++;

    await page.goto(nextUrl, { waitUntil: 'networkidle' });

    const scraped = await page.evaluate(() => {
      const rows = document.querySelectorAll('table.table tbody tr');
      let currentDate = null;
      const events = [];

      rows.forEach(tr => {
        const dateMatch = tr.innerText.trim().match(/^\d{4}-\d{2}-\d{2}$/);
        if (dateMatch) {
          currentDate = dateMatch[0];
          return;
        }

        const tds = tr.querySelectorAll('td');
        if (tds.length < 3) return;

        const img = tds[0].querySelector('img');
        const p = tds[0].querySelector('p');

        events.push({
          date: currentDate,
          time: tds[1].innerText.trim(),
          empire: img?.src.split('/').pop().replace('.png', ''),
          province: tds[0].childNodes[1]?.textContent.trim(),
          city: p?.innerText.trim(),
          text: tr.querySelector('td[id^="ajax-"]')?.innerText.trim()
        });
      });

      const active = document.querySelector('.pagination li.active');
      const next =
        active?.nextElementSibling?.querySelector('a')?.href || null;

      return { events, next };
    });

    let newCount = 0;
    for (const raw of scraped.events) {
      const e = { ...raw, empire: resolveEmpire(raw.empire) };
      const h = eventHash(e);
      if (!index.has(h)) {
        index.add(h);
        events.push(e);
        newCount++;
      }
    }

    console.log(`📄 Page ${pageCount} → +${newCount}`);

    if (newCount === 0) {
      console.log('⛔ Page complète détectée');
      break;
    }

    nextUrl = scraped.next;
  }

  sortEvents(events);
  saveJSON(EVENTS_FILE, events);
  saveJSON(INDEX_FILE, [...index]);

  await sendToDiscord(events);
  await browser.close();

  console.log(`✅ Terminé — total : ${events.length}`);
})();