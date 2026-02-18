import fs from 'fs';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

/* =========================
CONFIG
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
const DISCORD_TECH_WEBHOOK = process.env.DISCORD_TECH_WEBHOOK;

//REST

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

    const EVENT_ROUTES = [
  {
    name: 'War',
    match: text =>
      [
        'declare la guerre'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_WAR_WEBHOOK
  },
  {
    name: 'Discours',
    match: text =>
      [
        'a adresse un discours',
        'a prononce un discours',
        'a fait la declaration officielle',
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_DISCOURS_WEBHOOK
  },
  {
    name: 'Crime',
    match: text =>
        /a lance .+ avis de recherche/.test(text) ||
        /un groupe de creature .+ attaque/.test(text) ||
        /depuis sa prison .+ a reussi a faire passer/.test(text) ||
        /a tente d'entrainer .+ dans une bagarre/.test(text) ||
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
        'a tente de detourner de l\'argent',
        's\'est fait agresser par',
        'un groupe de creatures mene',
        'a entame un combat contre',
        'a tente d\'assassiner',
        'a tente de fabriquer une fausse clef',
        'a fixe le montant de la caution a',
        'a tente de chasser dans',
        'a tranche la gorge de',
        'une bagarre a eclate entre',
        'lance dans une plaidoirie si penible',
        'a obtenu la liberation anticipee',
        'transmettre a la presse une fausse declaration',
        'vient de marquer sur le mur',
        'a tente de fabriquer une fausse clef',
        'a reussi a faire passer le message suivant a l\'exterieur',
        'a fait reparer les barreaux de la prison',
        'a convaincu les autorites judiciaires que',
        'un attentat vient de frapper'
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
        'a organise une manifestation anti-science',
        's\'est introduit dans le reseau',
        'est tombee dans le domaine public'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_RECHERCHE_WEBHOOK
  },
  {
    name: 'Rumeur',
    match: text =>
      [
        'une rumeur court',
        'une rumeur concernant',
        'il se murmure',
        'viennent de se marier',
        'est desormais domicilie dans',
        'a cede la direction de',
        'a fonde l\'organisation',
        'loterie :',
        'suite a la desactivation de',
        'a pris sa retraite'
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
    /le Ministre .+ a autorise/.test(text) ||
    /la Ministre .+ a autorise/.test(text) ||
    /a accepte .+ au sein/.test(text) ||
    /a retire .+ le poste/.test(text) ||
    /a fait adherer .+ a l'institution/.test(text) ||
    /du parti politique .+ a appuye/.test(text) ||
    /a refuse .+ a au sein/.test(text) ||
    /a recommande .+ permettant la domiciliation/.test(text) ||
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
      'resultat de l\'election au poste',
      'a diffuse une emission',
      'a accepte l\'organisation',
      'a la vindicte populaire',
      'a organise une manifestation soutenant',
      'a repousse les elections',
      'a lance une tarte a la creme',
      'a tenu un meeting en faveur de',
      's\'est fait huer par la foule en tentant',
      'a perquisitionne le batiment',
      'est desormais domicilie'
    ].some(k => text.includes(k)),
  webhook: DISCORD_POL_WEBHOOK
},
{
  name: 'Finance',
  priority: 60,
  match: text =>
    /a verse .+ au/.test(text) ||
    /a transfere .+ du batiment/.test(text) ||

    [
      'vient de modifier la taxe fonciere',
      'vient de modifier le taux d\'imposition',
      'vient de modifier l\'impot',
      'a defini une nouvelle repartition budgetaire',
      'a pris la decision d\'appliquer une prime',
      'a pris la decision d\'appliquer une taxe',
      'a impose une taxe',
      'a verse une prime de',
      'a modifie le taux d\'imposition',
      'a leve un impot exceptionnel',
      'a distribue les richesses',
      'a exproprie le batiment',
      'a contraint le patronat a signer une convention'
    ].some(k => text.includes(k)),
  webhook: DISCORD_FINANCE_WEBHOOK
},
{
    name: 'Tunnel',
    match: text =>
      [
        'tunnel termondique de magnitude'
      ].some(keyword => text.includes(keyword)),
    webhook: DISCORD_TUNNEL_WEBHOOK
},
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
//STATS Techs
const TECH_FILE = `${DATA_DIR}/technologies.json`;
const TECH_PROCESSED_FILE = `${DATA_DIR}/tech_processed_keys.json`;

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
EMPIRES
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
UTILITAIRES
========================= */

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveEmpireRoleMention(empire) {
  return EMPIRE_ROLE_MAP[empire] || null;
}

function shouldPingForWebhook(webhook) {
  return null;//webhook && !SILENT_WEBHOOKS.has(webhook);
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

function loadSet(file) {
  return new Set(loadJSON(file, []));
}

function saveSet(file, set) {
  saveJSON(file, [...set]);
}

function formatLocation(e) {
  const parts = [];

  if (e.province) parts.push(e.province);
  if (e.city) parts.push(e.city);

  if (!parts.length) return '';
  return `📍 ${parts.join(' • ')} — `;
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

    // Si on dépasse la limite
    if (current.length >= maxFields) {
      pages.push(current);
      current = [];

      // Répéter l'empire UNIQUEMENT si le prochain champ
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

// SUPABASE REQUEST

async function loadEventsFromSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return [];

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/journal_events?order=date.desc&limit=1000`,
        {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Accept: 'application/json'
        }
        }
    );

    if (!res.ok) {
        const text = await res.text();
        console.warn('⚠️ Supabase loadEvents error', res.status, text);
        return [];
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.warn('⚠️ Réponse non JSON Supabase', text);
        return [];
    }

    return await res.json();
}

// UTILITAIRE STATS Techs Owned
function extractTechnologyEvent(event) {
  const raw = event.text;
  const text = normalizeForHash(raw);

  // ======================
  // GAIN
  // ======================
    const gainMatch = raw.match(
    /^(.+?)\s+a découvert la technologie\s+(.+?)\s+en faveur d[eu']\s+.+?\s*:/i
    );

  if (gainMatch) {

    // description entre « »
    const descMatch = raw.match(/«([^»]+)»/);

    return {
    type: 'gain',
    tech: gainMatch[2].trim(),
    empire: event.empire,
    discoveredBy: gainMatch[1].trim(),
    description: descMatch ? descMatch[1].trim() : null
    };
  }

  // ======================
  // LOSS
  // ======================
  const lossMatch = text.match(
    /perte de la technologie\s+(.+?)\.?$/
  );

  if (lossMatch) {
    return {
      type: 'loss',
      tech: lossMatch[1].trim(),
      empire: event.empire
    };
  }

  // ======================
  // PUBLIC DOMAIN
  // ======================
  const publicMatch = text.match(
    /la technologie\s+(.+?)\s+est tombee dans le domaine public/
  );

  if (publicMatch) {
    return {
      type: 'public',
      tech: publicMatch[1].trim()
    };
  }

  return null;
}

function updateTechnologyRegistry(events) {

  const techs = loadJSON(TECH_FILE, {});
  const processed = loadSet(TECH_PROCESSED_FILE);

  const changes = {};
  const publicAnnouncements = [];

  let modified = false;

  for (const e of events) {

    if (!e.key) continue;

    // ⛔ déjà traité dans un run précédent
    if (processed.has(e.key)) continue;

    const result = extractTechnologyEvent(e);
    if (!result) continue;

    processed.add(e.key);

    const { type, tech, empire } = result;

    if (!tech) continue;

    // ======================
    // GAIN
    // ======================
    if (type === 'gain' && empire) {

      techs[empire] ??= {};
      const prev = techs[empire][tech];

      if (!prev || prev.status !== 'owned') {

        techs[empire][tech] = {
            status: 'owned',
            description: result.description || prev?.description || null,
            updatedAt: e.firstSeen || new Date().toISOString(),
            discoveredBy: result.discoveredBy || prev?.discoveredBy || null,
            lossCount: prev?.lossCount || 0
        };

        changes[empire] ??= { gained: [], lost: [] };

        if (!changes[empire].gained.includes(tech)) {
          changes[empire].gained.push(tech);
        }

        modified = true;
      }
    }

    // ======================
    // LOSS
    // ======================
    if (type === 'loss' && empire) {

      techs[empire] ??= {};
      const prev = techs[empire][tech];

      if (!prev || prev.status !== 'lost') {

        techs[empire][tech] = {
            status: 'lost',
            updatedAt: e.firstSeen || new Date().toISOString(),
            discoveredBy: prev?.discoveredBy || null,
            lossCount: (prev?.lossCount || 0) + 1
        };

        changes[empire] ??= { gained: [], lost: [] };

        if (!changes[empire].lost.includes(tech)) {
          changes[empire].lost.push(tech);
        }

        modified = true;
      }
    }

    // ======================
    // PUBLIC
    // ======================
    if (type === 'public') {

    // uniquement annonce globale
    publicAnnouncements.push({
        tech,
        date: e.date,
        time: e.time
    });

    // ❌ aucune modification dans technologies.json
    }
  }

  if (modified) {
    saveJSON(TECH_FILE, techs);
    saveSet(TECH_PROCESSED_FILE, processed);
  }

  return { techs, changes, publicAnnouncements };
}

function computeCommonTechnologies(techs){
    const empires = Object.keys(techs);
    if (!empires.length) return [];

    const counts = {};

    for(const empire of empires){
        for(const [tech, info] of Object.entries(techs[empire])){
            if (info.status !== 'owned') continue;
            counts[tech] = (counts[tech] || 0) + 1;
        }
    }

    return Object.entries(counts)
        .filter(([_, c]) => c === empires.length)
        .map(([tech]) => tech);

}

// REST FONCTION SUPABASE

async function sendEventToSupabase(event) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

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
        `${SUPABASE_URL}/rest/v1/journal_events`,
        {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'resolution=ignore-duplicates'
        },
        body: JSON.stringify(payload)
        }
    );

    if (!res.ok && res.status !== 409) {
        console.warn('⚠️ Supabase error:', res.status, await res.text());
    }
}

function resolveFinanceLevel(row) {
  if (row.city) return 'city';
  if (row.province) return 'province';
  return 'empire';
}

async function sendFinanceToSupabase(day, _levelIgnored, row) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  const level = resolveFinanceLevel(row);

  const payload = {
    day,
    level,
    empire: row.empire,
    province: row.province || null,
    city: row.city || null,
    income: row.income || 0,
    expense: row.expense || 0,
    currency: row.currency || null
  };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/finance_daily`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'resolution=ignore-duplicates'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok && res.status !== 409) {
    console.warn('⚠️ Finance insert error', res.status, await res.text());
  }
}

async function loadFinanceFromSupabase(day) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/finance_daily?day=eq.${day}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const rows = await res.json();

  const result = { empire: [], province: [], city: [] };

  for (const r of rows) {
    result[r.level].push(r);
  }

  return result;
}

async function sendTechnologiesToSupabase(techs) {

  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  const rows = [];

  for (const [empire, techList] of Object.entries(techs)) {
    for (const [tech, info] of Object.entries(techList)) {
      rows.push({
        empire,
        tech,
        status: info.status,
        description: info.description || null,
        discovered_by: info.discoveredBy || null,
        loss_count: info.lossCount || 0,
        updated_at: info.updatedAt
      });
    }
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/technologies`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    }
  );

  if (!res.ok) {
    console.warn(
      '⚠️ Supabase tech sync error:',
      res.status,
      await res.text()
    );
  } else {
    console.log(`📤 Supabase sync technologies : ${rows.length}`);
  }
}

/* =========================
EMPIRE RANKING IMPOTS
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
DISCORD
========================= */

async function sendToDiscord(events) {
  if (!DISCORD_EVENTS_WEBHOOK) return;

  const fresh = [];

  for (const e of events) {
    const key = eventKey(e);

    // ⛔ déjà envoyé avec succès
    if (await wasAlreadySentToDiscord(key)) continue;

    // ⛔ événements financiers (loggés)
    if (isFinancialEvent(e)) {
      await markDiscordDispatch(key, null, 'skipped_finance');
      continue;
    }

    fresh.push(e);
  }

  if (!fresh.length) {
    console.log('📭 Aucun événement Discord à envoyer');
    return;
  }

  sortEvents(fresh);

  const timeline = {};

  for (const e of fresh) {
    const webhook = resolveEventWebhook(e);

    if (!webhook) {
      console.warn(`❌ Aucun webhook pour ${e.key}`);
      await markDiscordDispatch(e.key, null, 'no_webhook');
      continue;
    }

    timeline[e.date] ??= {};
    timeline[e.date][e.empire] ??= {};
    timeline[e.date][e.empire][webhook] ??= [];
    timeline[e.date][e.empire][webhook].push(e);
  }

  for (const [date, empires] of Object.entries(timeline)) {
    for (const [empire, byWebhook] of Object.entries(empires)) {
      for (const [webhook, evts] of Object.entries(byWebhook)) {

        const lines = evts.map(
          e => `**${e.time || '--:--'}** — ${formatLocation(e)}${e.text}`
        );

        const chunks = chunkEmbedLines(lines);

        for (let i = 0; i < chunks.length; i++) {
          try {
            await sendWebhookGuaranteed(webhook, {
              embeds: [{
                title: `📅 ${date} — ${empire}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`,
                color: empireColor(empire),
                description: chunks[i],
                footer: {
                  text: `CROWS ScrapeYard • ${evts.length} événements`
                }
              }]
            });

            // ✅ MARQUAGE UNIQUEMENT APRÈS SUCCÈS
            for (const e of evts) {
              await markDiscordDispatch(e.key, webhook, 'sent');
            }

          } catch (err) {
            console.error('❌ Discord error:', err.message);

            for (const e of evts) {
              await markDiscordDispatch(e.key, webhook, 'error', err.message);
            }

            // ⛔ on n’avance PAS → retry au prochain run
            return;
          }

          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
  }
}

async function markDiscordDispatch(eventKey, webhook, status, error = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  await fetch(`${SUPABASE_URL}/rest/v1/discord_dispatch_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      event_key: eventKey,
      webhook,
      status,
      error
    })
  });
}

async function wasAlreadySentToDiscord(eventKey) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return false;

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/discord_dispatch_log?event_key=eq.${eventKey}&status=eq.sent`,
        {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Accept: 'application/json'
        }
        }
    );

    if (!res.ok) {
        const text = await res.text();
        console.warn('⚠️ Supabase wasAlreadySentToDiscord error', res.status, text);
        return false;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.warn('⚠️ Réponse non JSON Supabase', text);
        return false;
    }

    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
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
    // BUILD SECTIONS
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

// SEND Tech resume

async function sendTechnologyResume(changes, techs) {
  if (!DISCORD_TECH_WEBHOOK) return;
  if (!Object.keys(changes).length) {
    console.log('🧬 Aucun changement technologique');
    return;
  }

  const common = computeCommonTechnologies(techs);

  for (const [empire, diff] of Object.entries(changes)) {
    const gained = diff.gained || [];
    const lost = diff.lost || [];
    if (!gained.length && !lost.length) continue;

    const fields = [];

    if (gained.length) {

    const blocks = gained.map(t => {
        const desc = techs[empire]?.[t]?.description;
        const by = techs[empire]?.[t]?.discoveredBy;

        return desc
        ? `• **${t}**${by ? ` _(par ${by})_` : ''}\n> ${desc}`
        : `• ${t}${by ? ` _(par ${by})_` : ''}`;
    });

    const chunks = chunkEmbedLines(blocks, 1000); // <- sécurité Discord

    for (let i = 0; i < chunks.length; i++) {
        fields.push({
        name: i === 0
            ? '🧪 Découvertes'
            : '🧪 Découvertes (suite)',
        value: chunks[i],
        inline: false
        });
    }
    }

    if (lost.length) {
      fields.push({
        name: '💥 Technologies perdues',
        value: lost.map(t => `• ${t}`).join('\n'),
        inline: false
      });
    }

    if (!fields.length) {
        console.log(`⚠️ Aucun field valide pour ${empire}, skip`);
        continue;
    }

    await sendWebhookGuaranteed(DISCORD_TECH_WEBHOOK, {
      embeds: [{
        title: `🔬 Mise à jour technologique — ${empire}`,
        color: empireColor(empire),
        fields
      }]
    });

    await new Promise(r => setTimeout(r, 300));
  }
}

async function sendPublicTechAnnouncements(list) {
  if (!DISCORD_TECH_WEBHOOK) return;
  if (!list.length) return;

  for (const item of list) {

    await sendWebhookGuaranteed(DISCORD_TECH_WEBHOOK, {
      embeds: [{
        title: '🌍 Technologie tombée dans le domaine public',
        color: 0x95a5a6,
        fields: [{
          name: 'Technologie',
          value: `**${item.tech}**`,
          inline: false
        }],
        footer: {
          text: `${item.date} ${item.time}`
        }
      }]
    });

    await new Promise(r => setTimeout(r, 300));
  }
}
/* =========================
SCRAPER
========================= */

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let events = loadJSON(EVENTS_FILE, []);
  let index = new Map(
    loadJSON(INDEX_FILE, []).map(e => [e.key, e])
  );

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[name="n[1]"]');

  // 🔽 récupérer toutes les options du select
const empires = await page.evaluate(() => {
  const select = document.querySelector('select[name="n[1]"]');
  if (!select) return [];

  return [...select.options]
    .map(o => ({
      value: o.value,
      label: o.label.trim()
    }))
    // on ignore "Tous les empires"
    .filter(o => o.value !== 'f0' && o.label.toLowerCase() !== 'tous les empires');
});

  console.log(`🌍 ${empires.length} empires à explorer`);

  // ================================
  // BOUCLE EMPIRE PAR EMPIRE
  // ================================
  for (const empire of empires) {

    console.log(`\n🏰 Empire: ${empire.label}`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    await page.selectOption('select[name="n[1]"]', empire.value);
    await page.waitForTimeout(1200);

    let nextUrl = page.url();
    let pageCount = 0;
    let emptyPages = 0;

    while (nextUrl && pageCount < MAX_PAGES) {
      pageCount++;

      await page.goto(nextUrl, { waitUntil: 'domcontentloaded' });

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

          if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            currentDate = text;
            return;
          }

          const tds = [...tr.querySelectorAll('td')];
          if (!tds.length || !currentDate) return;

          const img = tds[0].querySelector('img');
          if (img?.src) {
            currentEmpire = img.src.split('/').pop().replace('.png', '');
          }

          const provinceText = tds[0].cloneNode(true);
          provinceText.querySelector('p')?.remove();
          provinceText.querySelector('img')?.remove();
          const province = provinceText.textContent.replace(/\u00a0/g, ' ').trim();

          const cityText = tds[0]?.querySelector('p')?.innerText?.trim();

          currentProvince = province || "";
          currentCity = cityText || "";

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
        if (!raw.id) continue;

        const e = {
            key: raw.id, // 🔥 clé = ajax id
            date: normalizeText(raw.date),
            time: normalizeText(raw.time),
            empire: normalizeText(resolveEmpire(raw.empire)),
            province: normalizeText(raw.province),
            city: normalizeText(raw.city),
            text: normalizeText(raw.text),
            firstSeen: new Date().toISOString()
        };

        await sendEventToSupabase(e);
    }

      console.log(`📄 Page ${pageCount} → +${newCount}`);

      if (newCount === 0) {
        emptyPages++;
        if (emptyPages >= MAX_EMPTY_PAGES) break;
      } else {
        emptyPages = 0;
      }

      nextUrl = next;
    }
  }

  // ================================
  // FIN — pipeline normal
  // ================================
  sortEvents(events);
  saveJSON(EVENTS_FILE, events);
  saveJSON(INDEX_FILE, [...index.values()]);

  const dailyLogs = buildDailyFinanceLogs(events, WORLD);
  saveDailyLogs(dailyLogs);


  const { techs, changes, publicAnnouncements } =
    updateTechnologyRegistry(events);

    const dailyStats = buildDailyFinanceTables(events);

    for (const [day, data] of Object.entries(dailyStats)) {

    for (const r of data.empire || []) {
        await sendFinanceToSupabase(day, 'empire', r);
    }

    for (const r of data.province || []) {
        await sendFinanceToSupabase(day, 'province', r);
    }

    for (const r of data.city || []) {
        await sendFinanceToSupabase(day, 'city', r);
    }

        await loadFinanceFromSupabase(day);
    }

    await sendTechnologiesToSupabase(techs);
/*
  await sendTechnologyResume(changes, techs);
  
  await sendPublicTechAnnouncements(publicAnnouncements);
*/
    const events_list = await loadEventsFromSupabase();
    await sendToDiscord(events_list);

  await browser.close();

  console.log(`✅ Terminé — total événements : ${events.length}`);
})();