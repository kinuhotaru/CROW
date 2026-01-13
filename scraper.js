import puppeteer from 'puppeteer';
import fs from 'fs';
import fetch from 'node-fetch';

const URL = 'http://www.kraland.org/monde/evenements';
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
   🚀 SCRAPER
========================= */

const browser = await puppeteer.launch({
    headless: 'true',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

const page = await browser.newPage();
await page.setUserAgent(
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
);

await page.setExtraHTTPHeaders({
  'Accept-Language': 'fr-FR,fr;q=0.9'
});
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
  });
});
await page.goto(URL, {
    waitUntil: 'networkidle2',
    timeout: 60_000
});

let events = loadJSON(EVENTS_FILE, []);
let index = new Set(loadJSON(INDEX_FILE, []));
let sent = new Set(loadJSON(SENT_FILE, []));

let pageCount = 0;
let totalNew = 0;

while (pageCount < 500) {
    pageCount++;

    const scraped = await page.evaluate(() => {
        const rows = document.querySelectorAll('table.table tbody tr');
        let currentDate = null;
        const out = [];

        rows.forEach(tr => {
            const dateMatch = tr.innerText.trim().match(/^\d{4}-\d{2}-\d{2}$/);
            if (dateMatch) {
                currentDate = dateMatch[0];
                return;
            }

            const tds = tr.querySelectorAll('td');
            if (tds.length < 3) return;

            const locationTd = tds[0];
            const img = locationTd.querySelector('img');
            const p = locationTd.querySelector('p');

            out.push({
                date: currentDate,
                time: tds[1].innerText.trim(),
                empire: img?.src.split('/').pop().replace('.png', ''),
                province: locationTd.childNodes[1]?.textContent.trim(),
                city: p?.innerText.trim(),
                text: tr.querySelector('td[id^="ajax-"]')?.innerText.trim()
            });
        });

        return out.filter(e => e.text && e.date);
    });

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

    const next = await page.$('.pagination li.active + li a');
    if (!next) break;

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        next.click()
    ]);
}

await browser.close();

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