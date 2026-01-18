import fs from 'fs';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

/* =========================
   ⚙️ CONFIG
========================= */

const BASE_URL = 'http://www.kraland.org/monde/evenements';

//WEBHOOKS

const DISCORD_EVENTS_WEBHOOK = process.env.DISCORD_EVENTS_WEBHOOK;
const DISCORD_STATS_WEBHOOK  = process.env.DISCORD_STATS_WEBHOOK;
const DISCORD_TUNNEL_WEBHOOK = process.env.DISCORD_TUNNEL_WEBHOOK;
const DISCORD_CRIME_WEBHOOK = process.env.DISCORD_CRIME_WEBHOOK;
const DISCORD_DISCOURS_WEBHOOK  = process.env.DISCORD_DISCOURS_WEBHOOK;
const DISCORD_POL_WEBHOOK = process.env.DISCORD_POL_WEBHOOK;
const DISCORD_RECHERCHE_WEBHOOK = process.env.DISCORD_RECHERCHE_WEBHOOK;
const DISCORD_RUMEURS_WEBHOOK  = process.env.DISCORD_RUMEURS_WEBHOOK;
const DISCORD_WAR_WEBHOOK = process.env.DISCORD_WAR_WEBHOOK;
const DISCORD_FINANCE_WEBHOOK = process.env.DISCORD_FINANCE_WEBHOOK;

//REST

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

    const EVENT_ROUTES = [
  {
    name: 'Tunnel',
    match: text =>
      [
        'tunnel termondique de magnitude'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_TUNNEL_WEBHOOK
  },
  {
    name: 'War',
    match: text =>
      [
        'declare la guerre'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_WAR_WEBHOOK
  },
  {
    name: 'Crime',
    match: text =>
      [
        'a tente de voler',
        'vient d\'achever sa peine',
        'vient de se livrer aux autorites',
        'vient de livrer',
        'a ecrit des graffitis sur le mur',
        'a tente de commettre un attentat',
        'a annule les poursuites contre',
        'a aide les policiers',
        'a lance un avis de recherche contre',
        'vient de se faire assassiner',
        'a conduit dans la prison',
        'des policiers interviennent',
        'un groupe de policiers tente',
        'a impose une amende',
        'a tente de detourner de l\'argent'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_CRIME_WEBHOOK
  },
  {
    name: 'Recherche',
    match: text =>
      [
        'a brule par erreur des notes scientifiques',
        'a fixe le salaire pour la recherche technologique',
        'a lance la recherche de la technologie',
        'a donne des informations concernant la technologie',
        'a decouvert la technologie',
        'a fait perdre des fichiers precieux a la recherche scientifique',
        'en tentant d\'organiser une manifestation pro-science',
        'a organise une manifestation pro-science',
        'en tentant d\'organiser une manifestation anti-science',
        'a organise une manifestation anti-science'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_RECHERCHE_WEBHOOK
  },
  {
    name: 'Discours',
    match: text =>
      [
        'a adresse un discours',
        'a prononce un discours',
        'a fait la declaration officielle'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_DISCOURS_WEBHOOK
  },
  {
    name: 'Rumeur',
    match: text =>
      [
        'une rumeur court',
        'une rumeur concernant',
        'il se murmure'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_RUMEURS_WEBHOOK
  },
{
  name: 'Politique',
  priority: 60,
  match: text =>
    /a nomme .+ au poste de/.test(text) ||
    /coup d'etat .+ a usurpe/.test(text) ||
    /les services .+ sont debordes par/.test(text) ||

    [
      'a perdu son poste',
      'a demissionne',
      'a effectue un sondage',
      's\'est verse une prime',
      'a organise une manifestation contre',
      'a organise une manifestation en soutien',
      'a retire sa candidature',
      'a bafouille un discours',
      'a accorde la recompense',
      'a use de ses prerogatives de',
      'n\'a pas reussi a utiliser ses prerogatives',
      'a approuve les actions du gouvernement',
      'a prete allegeance envers',
      's\'est presente aux elections',
      's\'est presentee aux elections',
      'resultat de l\'election au poste'
    ].some(k => text.includes(k)),
  webhook: DISCORD_POL_WEBHOOK
},
{
  name: 'Finance',
  priority: 60,
  match: text =>
    /a verse .+ au/.test(text) ||

    [
      'vient de modifier la taxe fonciere',
      'vient de modifier le taux d\'imposition',
      'vient de modifier l\'impot',
      'a defini une nouvelle repartition budgetaire',
      'a pris la decision d\'appliquer une prime',
      'a pris la decision d\'appliquer une taxe',
      'a impose une taxe',
      'a verse une prime de'
    ].some(k => text.includes(k)),
  webhook: DISCORD_FINANCE_WEBHOOK
}
];

const SILENT_WEBHOOKS = new Set([
  DISCORD_TUNNEL_WEBHOOK,
  DISCORD_EVENTS_WEBHOOK 
]);

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
const CURRENCY_REGEX = '(Co|Éf|ÐE|¢¢|MØ|FK|PO)';

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

const EMPIRE_ROLE_MAP = {
  'Mondial' : '<@&1460876246345842770>',
  'République de Kraland': '<@&1460876539066323099>',
  'Empire Brun': '<@&1460876568367730841>',
  'Palladium Corporation': '<@&1460876585912504411>',
  'Théocratie Seelienne': '<@&1460876615075500385>',
  'Paradigme Vert': '<@&1460876641306939392>',
  'Khanat Elmérien': '<@&1460876669555572757>',
  'Confédération Libre': '<@&1460876682553720887>',
  'Royaume de Ruthvénie': '<@&1460876710248710311>',
  'Provinces indépendantes': '<@&1460876734093328416>',
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

function resolveEmpireRoleMention(empire) {
  return EMPIRE_ROLE_MAP[empire] || null;
}

function shouldPingForWebhook(webhook) {
  return webhook && !SILENT_WEBHOOKS.has(webhook);
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

function paginateFieldsWithEmpireHeaders(fields, maxFields = 25) {
  const pages = [];
  let current = [];
  let lastEmpireHeader = null;

  for (const field of fields) {
    const isEmpireHeader =
      field.inline === false && field.name.startsWith('🏰');

    if (isEmpireHeader) {
      lastEmpireHeader = field;
    }

    // ⚠️ Si on dépasse la limite
    if (current.length >= maxFields) {
      pages.push(current);
      current = [];

      // 🔁 Répéter l'empire UNIQUEMENT si le prochain champ
      // n'est PAS déjà un header d'empire
      if (
        lastEmpireHeader &&
        !isEmpireHeader
      ) {
        current.push(lastEmpireHeader);
      }
    }

    current.push(field);
  }

  if (current.length) {
    pages.push(current);
  }

  return pages;
}


// FONCTION DE TRI DES WEBHOOK (hors finances)
function resolveEventWebhook(event) {

    const text = normalizeForHash(event.text);

    for (const route of EVENT_ROUTES){
        try{
            if(route.match(text)){
                return route.webhook;
            }
        } catch (err){
            console.warn('⚠️ Erreur dans une règle EVENT_ROUTES', err);
        }
    }

   return DISCORD_EVENTS_WEBHOOK;
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
function isFinancialEvent(event) {
  return extractMoneyFlows(event.text) !== null;
}

function extractMoneyFlows(text) {
  if (!text) return null;

  let income = 0;
  let expense = 0;
  let currency = null;

  // 💰 récolte
  const incomeMatch = text.match(
    new RegExp(`récolte\\s+([\\d\\s]+)\\s*${CURRENCY_REGEX}`, 'i')
  );
  if (incomeMatch) {
    income = Number(incomeMatch[1].replace(/\s/g, ''));
    currency = incomeMatch[2];
  }

  // 💸 paie
  const payMatch = text.match(
    new RegExp(`paie\\s+([\\d\\s]+)\\s*${CURRENCY_REGEX}`, 'i')
  );
  if (payMatch) {
    expense += Number(payMatch[1].replace(/\s/g, ''));
    currency ??= payMatch[2];
  }

  // 🏛️ ministères (Empire)
  const ministryExpense = extractMinistryExpense(text);
  expense += ministryExpense;

  if (!income && !expense) return null;

  return {
    income,
    expense,
    currency,
    ministryExpense
  };
}

function buildDailyFinanceTables(events) {
  const days = {};

  for (const e of events) {
    const finance = extractMoneyFlows(e.text);
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
      name: `${rank}. 🏰 ${name}`,
      value:
        `${label} : **${v[type].toLocaleString()}${v.currency ? ` ${v.currency}` : ''}**\n` +
        `${progressBar(v[type], max)} ${medalIcon}`,
      inline: true
    };
  });
}

function rankingFieldsByEmpireFromRows(rows, type, label, level) {
  const flat = rows
    .map(r => ({
      empire: r.empire,
      name: level === 'city' ? r.city : r.province,
      value: r[type] || 0,
      currency: r.currency
    }))
    .filter(r => r.empire && r.name && r.value > 0);

  if (!flat.length) return null;

  // Classement global
  flat.sort((a, b) => b.value - a.value);
  const globalMax = flat[0].value;

  flat.forEach((r, i) => {
    r.rank = i + 1;
  });

  // Regroupement par empire
  const grouped = {};
  for (const r of flat) {
    grouped[r.empire] ??= [];
    grouped[r.empire].push(r);
  }

  const fields = [];

  for (const [empire, items] of Object.entries(grouped)) {
    // 🏰 Header empire
    fields.push({
      name: `🏰 ${empire}`,
      value: '\u200B',
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

function extractMinistryExpense(text) {
  if (!text) return 0;
  if (!/les impôts ont été distribués aux différents ministères/i.test(text)) {
    return 0;
  }

  let total = 0;

  // Tout ce qui suit le ":" contient les ministères
  const parts = text.split(':');
  if (parts.length < 2) return 0;

  const ministryText = parts[1];

  // "Nom du ministère XXX Co"
  const regex = new RegExp(`([^,]+?)\\s+(\\d+)\\s*${CURRENCY_REGEX}`, 'g');
  let match;

  while ((match = regex.exec(ministryText)) !== null) {
    total += Number(match[2]);
  }

  return total;
}

// REST FONCTION SUPABASE

async function sendEventToSupabase(event) {
    if(!SUPABASE_URL || !SUPABASE_KEY) return;

    const payload = {
        date: event.date,
        time: event.time,
        empire: event.empire,
        province: event.province || null,
        city: event.city || null,
        text: event.text,
        key: event.key,
        first_seen: event.firstSeen
    };

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/journal_events`,{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=ignore-duplicates'                
            },
            body: JSON.stringify(payload)
        }
    );

    if (!res.ok && res.status !== 409){
        console.warn(
            '⚠️ Supabase error:',
            res.status,
            await res.text()
        );
    }
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

    if (flow.isMinistryDistribution) {
        E.expense += flow.income; // redistribution des impôts
        }
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
  let skippedFinance = 0;

for (const e of events) {

  // 🚫 IGNORER LES ÉVÉNEMENTS FINANCIERS
    if (isFinancialEvent(e)) {
    skippedFinance++;
    console.log(`💸 Événements financiers ignorés (Discord) : ${skippedFinance}`);
    continue;
    }

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
    timeline[e.date][e.empire] ??= {};
    const webhook = resolveEventWebhook(e);
    timeline[e.date][e.empire][webhook] ??= [];
    timeline[e.date][e.empire][webhook].push(e);
  }

for (const [date, empires] of Object.entries(timeline)) {
  for (const [empire, evtsByWebhook] of Object.entries(empires)) {
    for (const [webhook, evts] of Object.entries(evtsByWebhook)) {

    const roleMention =
        shouldPingForWebhook(webhook)
        ? resolveEmpireRoleMention(empire)
        : null;

    const lines = evts.map(
        e => `**${e.time || '--:--'}** — ${e.text}`
    );

    const chunks = chunkEmbedLines(lines);

    for (let i = 0; i < chunks.length; i++) {
        await sendWebhookGuaranteed(webhook, {
        content: roleMention || undefined,
        embeds: [{
            title: `📅 ${date} — ${empire}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`,
            color: empireColor(empire),
            description: chunks[i],
            footer: {
            text: `CROWS ScrapeYard • ${evts.length} événements`
            }
        }]
        });

        await new Promise(r => setTimeout(r, 200));
    }
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

    // =========================
    // 🏆 BUILD SECTIONS
    // =========================
    const empireAgg = aggregateRows(data.empire, 'empire');
    const sections = [
        {
        title: `🏆 Empires — ${day} • Revenus`,
        color: 0x2ecc71,
        fields: rankingFields(empireAgg, 'income', '💰 Revenus')
        },
        {
        title: `💸 Empires — ${day} • Dépenses`,
        color: 0xe74c3c,
        fields: rankingFields(empireAgg, 'expense', '💸 Dépenses')
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

    await sendWebhookGuaranteed(DISCORD_STATS_WEBHOOK, {
        content: `📅 **Rapport financier — ${day}**`
    });

    for (const section of sections) {
      if (!section.fields || section.fields.length === 0) {
        console.log(`⏭️ Section ignorée (vide) : ${section.title}`);
        continue;
      }

        const chunks = paginateFieldsWithEmpireHeaders(section.fields, 25);

        for (let i = 0; i < chunks.length; i++) {
        await sendWebhookGuaranteed(DISCORD_STATS_WEBHOOK, {
            embeds: [{
            title: `${section.title}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`,
            color: section.color,
            fields: chunks[i]
            }]
        });

        await new Promise(r => setTimeout(r, 300));
        }

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

        await sendEventToSupabase({
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