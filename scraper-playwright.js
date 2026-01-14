import fs from 'fs';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

/* =========================
   ⚙️ CONFIG
========================= */

const BASE_URL = 'http://www.kraland.org/monde/evenements';

const DISCORD_EVENTS_WEBHOOK = process.env.DISCORD_EVENTS_WEBHOOK;
const DISCORD_STATS_WEBHOOK  = process.env.DISCORD_STATS_WEBHOOK;

//DATA Logs
const DATA_DIR = './data';
const EVENTS_FILE = `${DATA_DIR}/events.json`;
const INDEX_FILE = `${DATA_DIR}/event_index.json`;
const SENT_FILE = `${DATA_DIR}/sent_keys.json`;
const EVENT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours de récursion

//STATS Bourse
const WORLD = JSON.parse(
  fs.readFileSync('./kraland_territories.json', 'utf8')
);
// Index inverse : ville → province
const CITY_TO_REGION = {};
const REGION_TO_EMPIRE = {};
const STATS_FILE = `${DATA_DIR}/daily_tax_stats.json`;
const STATS_SENT_FILE = `${DATA_DIR}/stats_sent_days.json`;

for (const [empire, data] of Object.entries(WORLD)) {
  for (const [region, cities] of Object.entries(data.regions)) {
    REGION_TO_EMPIRE[region] = empire;
    for (const city of cities) {
      CITY_TO_REGION[city] = region;
    }
  }
}

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

function eventKey(e) {
  return [
    e.date,
    e.time,
    e.empire,
    e.province,
    e.city,
    e.text
  ].map(normalizeForHash).join('|');
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

function chunkEmbedDescription(lines, maxLength = 4000) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n\n' + line).length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n\n' : '') + line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sendWebhookGuaranteed(webhookUrl, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    console.warn('⚠️ Webhook invalide, envoi ignoré');
    return;
  }

  while (true) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) return;

    if (res.status === 429) {
      const data = await res.json();
      const waitMs = Math.ceil((data.retry_after || 1) * 1000);
      console.warn(`⏳ Rate limit, attente ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    throw new Error(`Discord error ${res.status}: ${await res.text()}`);
  }
}


// UTILITAIRES DE STATISTIQUE

function extractFinance(text) {
  const income = text.match(/récolte\s+([\d\s]+)\s*([A-ZØÐÉ¢$]+)/i);
  const expense = text.match(/paie\s+([\d\s]+)\s*([A-ZØÐÉ¢$]+)/i);

  if (!income && !expense) return null;

  return {
    income: income ? Number(income[1].replace(/\s/g, '')) : null,
    expense: expense ? Number(expense[1].replace(/\s/g, '')) : null,
    currency: income?.[2] || expense?.[2] || null
  };
}

function extractMoneyFlows(text) {
  if (!text) return null;

  const incomeMatch = text.match(/récolte\s+([\d\s]+)\s*([A-ZÐÉØ¢$]+)/i);
  const expenseMatch = text.match(/paie\s+([\d\s]+)\s*([A-ZÐÉØ¢$]+)/i);

  if (!incomeMatch && !expenseMatch) return null;

  return {
    income: incomeMatch
      ? Number(incomeMatch[1].replace(/\s/g, ''))
      : 0,
    expense: expenseMatch
      ? Number(expenseMatch[1].replace(/\s/g, ''))
      : 0,
    currency: incomeMatch?.[2] || expenseMatch?.[2]
  };
}

function buildDailyFinanceTables(events) {
  const days = {};

  for (const e of events) {
    const finance = extractFinance(e.text);
    if (!finance) continue;

    const level = getLevel(e);
    if (!level) continue;

    const day = e.date;
    days[day] ??= { empire: [], province: [], city: [] };

    const row = {
      empire: e.empire,
      province: e.province || null,
      city: e.city || null,
      income: finance.income,
      expense: finance.expense,
      currency: finance.currency
    };

    days[day][level].push(row);
  }

  return days;
}

function rankingLines(entries = {}, type) {
  return Object.entries(entries)
    .sort((a, b) => (b[1][type] || 0) - (a[1][type] || 0))
    .map(
      ([label, v], i) =>
        `**${i + 1}. ${label}** — ${(v[type] || 0).toLocaleString()}`
    );
}

function aggregateRows(rows, labelKey) {
  const result = {};

  for (const r of rows || []) {
    const label =
      labelKey === 'empire' ? r.empire :
      labelKey === 'province' ? `${r.empire} :: ${r.province}` :
      `${r.empire} :: ${r.province} :: ${r.city}`;

    result[label] ??= {
    income: 0,
    expense: 0,
    currency: r.currency || null
    };

    result[label].income += r.income || 0;
    result[label].expense += r.expense || 0;
  }

  return result;
}

function progressBar(value, max, size = 10) {
  if (max <= 0) return '░'.repeat(size);

  const ratio = value / max;
  const filled = Math.round(ratio * size);

  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function medal(rank) {
  return rank === 1 ? '🥇'
       : rank === 2 ? '🥈'
       : rank === 3 ? '🥉'
       : '';
}

function rankingFields(entries, type, label) {
  const sorted = Object.entries(entries)
    .filter(([, v]) => (v[type] || 0) > 0)
    .sort((a, b) => (b[1][type] || 0) - (a[1][type] || 0))
    .slice(0, 9);

  if (!sorted.length) return null;

  const max = sorted[0][1][type];

  return sorted.map(([name, v], i) => {
    const rank = i + 1;
    const medalIcon = medal(rank);

    return {
      name: `${rank}. ${name}`,
      value:
        `${label} : **${v[type].toLocaleString()}${v.currency ? ` ${v.currency}` : ''}**\n` +
        `${progressBar(v[type], max)} ${medalIcon}`,
      inline: true
    };
  });
}
function rankingFieldsByEmpireFromRows(rows, type, label, level) {
  // 1️⃣ Flatten & filtrage (> 0)
  const flat = rows
    .map(r => ({
      empire: r.empire,
      name: level === 'city' ? r.city : r.province,
      value: r[type] || 0,
      currency: r.currency
    }))
    .filter(r => r.empire && r.name && r.value > 0);

  if (!flat.length) return null;

  // 2️⃣ Classement GLOBAL
  flat.sort((a, b) => b.value - a.value);

  const globalMax = flat[0].value;

  // 3️⃣ Attribution du rang global
  flat.forEach((r, i) => {
    r.rank = i + 1;
  });

  // 4️⃣ Regroupement par empire (ordre conservé)
  const grouped = {};
  for (const r of flat) {
    grouped[r.empire] ??= [];
    grouped[r.empire].push(r);
  }

  const fields = [];

  // 5️⃣ Construction des fields Discord
  for (const [empire, items] of Object.entries(grouped)) {
    fields.push({
      name: `🏰 ${empire}`,
      value: '‎',
      inline: false
    });

    for (const item of items) {
      fields.push({
        name: `${item.rank}. ${item.name}`,
        value:
          `${label} : **${item.value.toLocaleString()}${item.currency ? ` ${item.currency}` : ''}**\n` +
          `${progressBar(item.value, globalMax)} ${item.rank <= 3 ? medal(item.rank) : ''}`,
        inline: true
      });
    }
  }

  return fields;
}
/* =========================
   🏬 EMPIRE RANKING IMPOTS
========================= */


//Rapport - Extract

function buildDailyFinanceLogs(events, WORLD) {
  const logs = {};

  for (const e of events) {
    const flow = extractMoneyFlows(e.text);
    if (!flow) continue;

    const day = e.date;
    const empire = e.empire;
    if (!WORLD[empire]) continue;

    logs[day] ??= { date: day, empires: {} };
    const D = logs[day];

    // ===== EMPIRE (TOUJOURS) =====
    D.empires[empire] ??= {
      currency: WORLD[empire].currency,
      income: 0,
      expense: 0,
      provinces: {}
    };

    const E = D.empires[empire];
    E.income += flow.income;
    E.expense += flow.expense;

    // ===== PROVINCE (SI PRÉSENTE) =====
    if (e.province) {
      E.provinces[e.province] ??= {
        income: 0,
        expense: 0,
        cities: {}
      };

      const P = E.provinces[e.province];
      P.income += flow.income;
      P.expense += flow.expense;

      // ===== VILLE (SI PRÉSENTE) =====
      if (e.city) {
        P.cities[e.city] ??= { income: 0, expense: 0 };
        P.cities[e.city].income += flow.income;
        P.cities[e.city].expense += flow.expense;
      }
    }
  }

  return logs;
}

function saveDailyLogs(dailyLogs) {
  const DIR = './data/daily_finances';
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

  for (const [day, log] of Object.entries(dailyLogs)) {
    const file = `${DIR}/${day}.json`;
    if (fs.existsSync(file)) continue; // ⛔ déjà écrit
    fs.writeFileSync(file, JSON.stringify(log, null, 2));
  }
}
/* =========================
   📨 DISCORD
========================= */

async function sendToDiscord(events) {
  if (!DISCORD_EVENTS_WEBHOOK) return;

  const sent = new Set(loadJSON(SENT_FILE, []));
  const fresh = [];

  for (const e of events) {
    const key = eventKey(e);
    const now = Date.now();
    const expired =
        e.firstSeen &&
        now - new Date(e.firstSeen).getTime() > EVENT_TTL_MS;

    if (!sent.has(key) || expired) {
        sent.add(key);
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
        await sendWebhookGuaranteed(DISCORD_EVENTS_WEBHOOK, {
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

// Render DISCORD Stats Finances

function getLevel(e) {
  if (!e.province && !e.city) return 'empire';
  if (e.province && !e.city) return 'province';
  if (e.province && e.city) return 'city';
  return null;
}

async function sendDailyRanking(dailyTables) {
  const sentDays = new Set(loadJSON(STATS_SENT_FILE, []));

  for (const [day, data] of Object.entries(dailyTables)) {
    // ⛔ déjà envoyé
    if (sentDays.has(day)) continue;

    // ⛔ on ignore le jour courant
    if (day === new Date().toISOString().slice(0, 10)) continue;

    // =========================
    // 🏆 BUILD SECTIONS
    // =========================

    const sections = [
      {
        title: `🏆 Empires — ${day} • Revenus`,
        color: 0x2ecc71,
        fields: rankingFields(data.empire, 'income', '💰 Revenus')
      },
      {
        title: `💸 Empires — ${day} • Dépenses`,
        color: 0xe74c3c,
        fields: rankingFields(data.empire, 'expense', '💸 Dépenses')
      },
      {
        title: `🏆 Provinces — ${day} • Revenus`,
        color: 0x2ecc71,
        fields: rankingFieldsByEmpireFromRows(
          data.province,
          'income',
          '💰 Revenus',
          'province'
        )
      },
      {
        title: `💸 Provinces — ${day} • Dépenses`,
        color: 0xe74c3c,
        fields: rankingFieldsByEmpireFromRows(
          data.province,
          'expense',
          '💸 Dépenses',
          'province'
        )
      },
      {
        title: `🏆 Villes — ${day} • Revenus`,
        color: 0x2ecc71,
        fields: rankingFieldsByEmpireFromRows(
          data.city,
          'income',
          '💰 Revenus',
          'city'
        )
      },
      {
        title: `💸 Villes — ${day} • Dépenses`,
        color: 0xe74c3c,
        fields: rankingFieldsByEmpireFromRows(
          data.city,
          'expense',
          '💸 Dépenses',
          'city'
        )
      }
    ];

    // =========================
    // 📨 DISCORD SEND
    // =========================

    for (const section of sections) {
      if (!section.fields || section.fields.length === 0) {
        console.log(`⏭️ Section ignorée (vide) : ${section.title}`);
        continue;
      }

      await sendWebhookGuaranteed(DISCORD_STATS_WEBHOOK, {
        embeds: [{
          title: section.title,
          color: section.color,
          fields: section.fields
        }]
      });

      // confort anti-rate-limit
      await new Promise(r => setTimeout(r, 300));
    }

    sentDays.add(day);
    saveJSON(STATS_SENT_FILE, [...sentDays]);
  }
}

/* =========================
   🚀 SCRAPER
========================= */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let events = loadJSON(EVENTS_FILE, []);
    let index = new Map(
    loadJSON(INDEX_FILE, []).map(e => [e.key, e])
    );

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

        if (province) {
        currentProvince = province;
        } else {
        currentProvince = "";
        }

        if (cityText) {
        currentCity = cityText;
        } else {
        currentCity = "";
        }

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

        const key = eventKey(e);
        const now = Date.now();

        const existing = index.get(key);

        const isExpired =
        existing &&
        now - new Date(existing.firstSeen).getTime() > EVENT_TTL_MS;

        if (!existing || isExpired) {
        const firstSeen = existing?.firstSeen ?? new Date().toISOString();

        index.set(key, {
            ...e,
            key,
            firstSeen
        });

        events.push({
            ...e,
            key,
            firstSeen
        });

            newCount++;

            if (isExpired) {
                console.log(`♻️ Événement réautorisé après expiration (${e.date} ${e.time})`);
            }
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

  //Gestion des event
  sortEvents(events);
  saveJSON(EVENTS_FILE, events);
  saveJSON(INDEX_FILE, [...index.values()]);

  //Gestion des stats impôts
  const dailyLogs = buildDailyFinanceLogs(events, WORLD);
  saveDailyLogs(dailyLogs);


  //Stats to Discord
  const dailyStats = buildDailyFinanceTables(events);
  saveJSON(STATS_FILE, dailyStats);
  await sendDailyRanking(dailyStats);

  await sendToDiscord(events);
  await browser.close();

  console.log(`✅ Terminé — total événements : ${events.length}`);
})();