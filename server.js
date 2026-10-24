/*
 * GroupVerse — a futuristic group-link directory (WhatsApp / Telegram / Discord / Signal)
 * Zero dependencies. Runs anywhere Node 18+ runs (Railway, VPS, localhost).
 *
 * Environment variables (all optional):
 *   PORT             — port to listen on (Railway sets this automatically)
 *   DATA_DIR         — where the JSON database lives (use a Railway volume, e.g. /data)
 *   ADMIN_PASSWORD   — password for the admin panel at /admin (CHANGE THIS!)
 *   SITE_NAME        — display name of the site (default: GroupVerse)
 *   ADSENSE_CLIENT   — your Google AdSense publisher id (ca-pub-XXXXXXXX). Once set,
 *                      real ad slots render; otherwise you see styled placeholder ads.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const ADMIN_PATH = (process.env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, ''); // her secret link: /<ADMIN_PATH>
const SITE_NAME = process.env.SITE_NAME || 'GroupVerse';
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || '';
// Optional second domain used ONLY for the admin panel (e.g. admin-xxx.up.railway.app).
// When set, that host serves the admin panel on every path; the public host keeps the secret path.
const ADMIN_HOST = (process.env.ADMIN_HOST || '').toLowerCase();
// On the admin-only host, the panel must control the PUBLIC site's database,
// not this service's own copy. This env tells the panel where the public API lives.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
// WhatsApp LinkPeek session (pair-code linked): real name + DP for any invite link.
const LINKPEEK_URL = (process.env.LINKPEEK_URL || '').replace(/\/$/, '');
const LINKPEEK_TOKEN = process.env.LINKPEEK_TOKEN || '';
const TG_BOT_TOKEN = process.env.GV_TG_BOT_TOKEN || '';
const TG_CHAT_ID = process.env.GV_TG_CHAT_ID || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------------------------------------------------------------- database */

let db = { groups: [] };
let saveTimer = null;

function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(db.groups)) db.groups = [];
  } catch {
    db = { groups: [] };
    seed();
    saveNow();
  }
}

function saveNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function slugify(title, id) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'group';
  return `${base}-${id.slice(0, 6)}`;
}

function seed() {
  const demo = [
    ['Tech Talks Daily', 'whatsapp', 'Technology', 'Global', 'English', ['tech', 'ai', 'coding'], 'Daily discussions on AI, coding and gadgets. Be kind, no spam, beginners welcome.'],
    ['Music Vibes Lounge', 'whatsapp', 'Music', 'Global', 'English', ['music', 'chill', 'share'], 'Share your favorite tracks and discover new artists. Any genre welcome, no spam.'],
    ['Crypto Signals Hub', 'telegram', 'Crypto', 'Global', 'English', ['crypto', 'trading', 'bitcoin'], 'Market updates and learning resources for crypto enthusiasts. Not financial advice.'],
    ['Football Fans Zone', 'telegram', 'Sports', 'Global', 'English', ['football', 'soccer', 'fans'], 'Match day chat, transfer news and banter. Respect everyone, no abuse.'],
    ['Study Together', 'whatsapp', 'Education', 'Global', 'English', ['study', 'students', 'exams'], 'A quiet accountability group for students. Share notes, timers and motivation.'],
    ['Memes Central', 'discord', 'Memes & Fun', 'Global', 'English', ['memes', 'funny', 'fun'], 'The dankest memes every hour. No politics, no NSFW, just laughs.'],
  ];
  const now = Date.now();
  db.groups = demo.map((d, i) => ({
    id: uid(),
    slug: slugify(d[0], 'demo' + i),
    title: d[0],
    url: 'https://chat.whatsapp.com/demo-link-replace-me',
    type: d[1],
    category: d[2],
    country: d[3],
    language: d[4],
    tags: d[5],
    description: d[6],
    status: 'approved',
    isDemo: true,
    clicks: Math.floor(Math.random() * 400) + 40,
    views: Math.floor(Math.random() * 900) + 100,
    reports: 0,
    createdAt: now - (i + 1) * 86400000,
  }));
}

loadDb();

/* ------------------------------------------------------------- taxonomies */

const CATEGORIES = ['Friends & Chat', 'Entertainment', 'Music', 'Education', 'Sports', 'Games', 'Technology', 'Business', 'Crypto', 'News & Politics', 'Health & Fitness', 'Movies & TV', 'Jobs & Careers', 'Love & Romance', 'Food & Cooking', 'Travel', 'Buy & Sell', 'Religion', 'Memes & Fun', 'Other'];

const COUNTRIES = ['Global', 'United States', 'United Kingdom', 'India', 'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Tanzania', 'Uganda', 'Ethiopia', 'Egypt', 'Morocco', 'Cameroon', "Côte d'Ivoire", 'Senegal', 'Zambia', 'Zimbabwe', 'Brazil', 'Mexico', 'Argentina', 'Colombia', 'Peru', 'Chile', 'Indonesia', 'Malaysia', 'Philippines', 'Vietnam', 'Thailand', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'China', 'Japan', 'South Korea', 'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Turkey', 'Iran', 'Iraq', 'Israel', 'Jordan', 'Lebanon', 'Germany', 'France', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Poland', 'Romania', 'Greece', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Russia', 'Ukraine', 'Canada', 'Australia', 'New Zealand', 'Other'];

const LANGUAGES = ['English', 'Spanish', 'Portuguese', 'French', 'Arabic', 'Hindi', 'Urdu', 'Bengali', 'Indonesian', 'Malay', 'Swahili', 'Hausa', 'Yoruba', 'Igbo', 'Amharic', 'Russian', 'German', 'Italian', 'Turkish', 'Chinese', 'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Filipino', 'Persian', 'Dutch', 'Polish', 'Romanian', 'Other'];

const TYPES = ['whatsapp', 'telegram', 'discord', 'signal'];

/* ---------------------------------------------------------------- helpers */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 50_000) req.destroy();
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function safeStr(v, max = 300) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validLink(type, url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (type === 'whatsapp') return /(^|\.)whatsapp\.com$/.test(u.hostname) || u.hostname === 'wa.me';
    if (type === 'telegram') return u.hostname === 't.me' || u.hostname === 'telegram.me';
    if (type === 'discord') return u.hostname.endsWith('discord.gg') || u.hostname === 'discord.com';
    if (type === 'signal') return u.hostname === 'signal.group';
    return false;
  } catch {
    return false;
  }
}

/* simple per-IP rate limiting for writes */
const hits = new Map();
function rateLimited(ip, limit, windowMs) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > limit;
}

function publicGroup(g) {
  const { id, slug, title, url, imageUrl, type, category, country, language, tags, description, clicks, views, createdAt } = g;
  return { id, slug, title, url, imageUrl, type, category, country, language, tags, description, clicks, views, createdAt };
}

/* -------- group photo storage: download images locally so links never expire -------- */
const IMG_DIR = path.join(DATA_DIR, 'imgs');
const IMG_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

function downloadImage(urlStr) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const req = https.get(urlStr, { timeout: 10000, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return done(downloadImage(new URL(res.headers.location, urlStr).href));
        }
        if (res.statusCode !== 200) { res.resume(); return done(null); }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => { size += c.length; if (size > 3_000_000) { req.destroy(); done(null); } else chunks.push(c); });
        res.on('end', () => done(Buffer.concat(chunks)));
        res.on('error', () => done(null));
      });
      req.on('timeout', () => { req.destroy(); done(null); });
      req.on('error', () => done(null));
    } catch { done(null); }
  });
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  if (buf[0] === 0x47 && buf[1] === 0x49) return '.gif';
  return null;
}

async function storeImage(urlStr) {
  if (!urlStr || !/^https?:\/\//.test(urlStr)) return '';
  const buf = await downloadImage(urlStr);
  const ext = sniffImage(buf);
  if (!ext || !buf) return '';
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const name = crypto.createHash('sha256').update(urlStr).digest('hex').slice(0, 20) + ext;
  const file = path.join(IMG_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
  return '/i/' + name;
}

/* -------- link metadata (group photo / name) -------- */
const GENERIC_WA_IMG = 'static.whatsapp.net';

function fetchPage(urlStr) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const req = https.get(urlStr, { timeout: 6000, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', accept: 'text/html' } }, (res) => {
        // follow one redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, urlStr).href;
          return done(fetchPage(next));
        }
        if (res.statusCode !== 200) { res.resume(); return done(null); }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; if (data.length > 300_000) req.destroy(); });
        res.on('end', () => done(data));
        res.on('error', () => done(null));
      });
      req.on('timeout', () => { req.destroy(); done(null); });
      req.on('error', () => done(null));
    } catch { done(null); }
  });
}

function metaTag(html, prop) {
  const re = new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = (html.match(re) || [''])[0];
  const m = tag.match(/content=["']([\s\S]*?)["']/i);
  return m ? m[1].trim() : '';
}

async function peekLink(url, type) {
  if (!validLink(type, url)) return {};
  // Preferred: the pair-code linked WhatsApp session knows the REAL name + DP.
  if (type === 'whatsapp' && LINKPEEK_URL && LINKPEEK_TOKEN) {
    try {
      const r = await fetch(`${LINKPEEK_URL}/peek?url=${encodeURIComponent(url)}`, { headers: { 'x-lp-key': LINKPEEK_TOKEN }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const m = await r.json();
        if (m.ok) {
          const out = {};
          if (m.name) out.title = m.name;
          if (m.description) out.description = m.description;
          if (m.imageUrl) out.imageUrl = new URL(m.imageUrl, LINKPEEK_URL).href;
          return out;
        }
      }
    } catch { /* fall through to page scrape */ }
  }
  const html = await fetchPage(url);
  if (!html) return {};
  let image = metaTag(html, 'og:image');
  if (image && image.includes(GENERIC_WA_IMG)) image = ''; // WhatsApp serves its own logo, not the group's DP
  let title = metaTag(html, 'og:title');
  if (title === 'WhatsApp Group Invite') title = '';
  const desc = metaTag(html, 'og:description');
  const out = {};
  if (image && /^https?:\/\//.test(image)) out.imageUrl = image.slice(0, 1000);
  if (title && title.length >= 3) out.title = title.slice(0, 80);
  if (desc && desc.length > 10 && !/come chat|group invite/i.test(desc)) out.description = desc.slice(0, 1000);
  return out;
}

function notifyTelegram(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  const payload = JSON.stringify({ chat_id: TG_CHAT_ID, text, disable_web_page_preview: true });
  const req = https.request({ hostname: 'api.telegram.org', path: `/bot${TG_BOT_TOKEN}/sendMessage`, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }, timeout: 8000 }, () => {});
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.end(payload);
}

/* ------------------------------------------------------------------- api */

async function handleApi(req, res, pathname, query, ip) {
  /* ---- config for the frontend ---- */
  if (req.method === 'GET' && pathname === '/api/config') {
    const host = (req.headers.host || '').toLowerCase().split(':')[0];
    const onAdminHost = !!(ADMIN_HOST && host === ADMIN_HOST);
    return json(res, 200, { siteName: SITE_NAME, adsenseClient: ADSENSE_CLIENT, categories: CATEGORIES, countries: COUNTRIES, languages: LANGUAGES, types: TYPES, publicApiBase: onAdminHost ? PUBLIC_URL : '' });
  }

  /* ---- list groups ---- */
  if (req.method === 'GET' && pathname === '/api/groups') {
    const search = safeStr(query.get('search') || '', 100).toLowerCase();
    const category = query.get('category') || '';
    const country = query.get('country') || '';
    const language = query.get('language') || '';
    const type = query.get('type') || '';
    const sort = query.get('sort') || 'new';
    const page = Math.max(1, parseInt(query.get('page') || '1', 10) || 1);
    const perPage = 12;

    let list = db.groups.filter((g) => g.status === 'approved');
    if (search) {
      const words = search.split(/\s+/).filter(Boolean);
      list = list.filter((g) => {
        const hay = `${g.title} ${g.description} ${g.tags.join(' ')} ${g.category} ${g.country} ${g.language}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (category) list = list.filter((g) => g.category === category);
    if (country) list = list.filter((g) => g.country === country);
    if (language) list = list.filter((g) => g.language === language);
    if (type) list = list.filter((g) => g.type === type);

    if (sort === 'popular') list.sort((a, b) => b.clicks - a.clicks);
    else if (sort === 'views') list.sort((a, b) => b.views - a.views);
    else list.sort((a, b) => b.createdAt - a.createdAt);

    const total = list.length;
    const items = list.slice((page - 1) * perPage, page * perPage).map(publicGroup);
    return json(res, 200, { items, total, page, perPage });
  }

  /* ---- group detail ---- */
  const detailMatch = pathname.match(/^\/api\/groups\/([a-z0-9-]+)$/);
  if (req.method === 'GET' && detailMatch) {
    const g = db.groups.find((x) => x.slug === detailMatch[1] && x.status === 'approved');
    if (!g) return json(res, 404, { error: 'Group not found' });
    g.views = (g.views || 0) + 1;
    save();
    const related = db.groups
      .filter((x) => x.status === 'approved' && x.id !== g.id && (x.category === g.category || x.country === g.country))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 6)
      .map(publicGroup);
    return json(res, 200, { group: publicGroup(g), related });
  }

  /* ---- WhatsApp session status + pairing (admin panel controls this) ---- */
  if (pathname.startsWith('/api/wa/') && LINKPEEK_URL && LINKPEEK_TOKEN) {
    const key = req.headers['x-admin-key'] || '';
    if (key !== ADMIN_PASSWORD) return json(res, 401, { error: 'Wrong admin password' });
    try {
      if (req.method === 'GET' && pathname === '/api/wa/status') {
        const r = await fetch(`${LINKPEEK_URL}/status`, { headers: { 'x-lp-key': LINKPEEK_TOKEN }, signal: AbortSignal.timeout(8000) });
        return json(res, r.status, await r.json());
      }
      if (req.method === 'POST' && pathname === '/api/wa/pair') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const r = await fetch(`${LINKPEEK_URL}/pair`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lp-key': LINKPEEK_TOKEN }, body: JSON.stringify({ phone: body.phone || '' }), signal: AbortSignal.timeout(15000) });
        return json(res, r.status, await r.json());
      }
    } catch (e) {
      return json(res, 502, { error: 'LinkPeek service unreachable' });
    }
  }

  /* ---- peek at an invite link for auto-fill (photo, name, info) ---- */
  if (req.method === 'GET' && pathname === '/api/peek') {
    const url = safeStr(query.get('url') || '', 300);
    const type = TYPES.includes(query.get('type')) ? query.get('type') : 'whatsapp';
    if (rateLimited(ip, 30, 3600_000)) return json(res, 429, { error: 'Slow down a little.' });
    const meta = await peekLink(url, type);
    return json(res, 200, meta);
  }

  /* ---- submit a group ---- */
  if (req.method === 'POST' && pathname === '/api/submit') {
    if (rateLimited(ip, 5, 3600_000)) return json(res, 429, { error: 'Too many submissions. Try again later.' });
    const body = JSON.parse((await readBody(req)) || '{}');
    if (body.website) return json(res, 200, { ok: true }); // honeypot: bots fill this
    const title = safeStr(body.title, 80);
    const url = safeStr(body.url, 300);
    const type = TYPES.includes(body.type) ? body.type : 'whatsapp';
    const category = CATEGORIES.includes(body.category) ? body.category : 'Other';
    const country = COUNTRIES.includes(body.country) ? body.country : 'Global';
    const language = LANGUAGES.includes(body.language) ? body.language : 'English';
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => safeStr(t, 30).toLowerCase()).filter(Boolean).slice(0, 6)
      : safeStr(body.tags, 200).split(/[,#]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6);
    const description = safeStr(body.description, 1000);

    if (title.length < 3) return json(res, 400, { error: 'Group name is too short.' });
    if (!validLink(type, url)) return json(res, 400, { error: `That doesn't look like a valid ${type} invite link.` });
    if (db.groups.some((g) => g.url === url && g.status !== 'rejected')) return json(res, 400, { error: 'This group link was already submitted.' });

    const id = uid();
    // Prefer a pasted photo link; otherwise use what the link auto-fetch found. Always store locally.
    const userImage = safeStr(body.imageUrl, 1000);
    const fetchedImage = safeStr(body.fetchedImageUrl || '', 1000);
    const stored = await storeImage(userImage) || await storeImage(fetchedImage);
    const group = { id, slug: slugify(title, id), title, url, type, category, country, language, tags, description, imageUrl: stored, status: 'pending', clicks: 0, views: 0, reports: 0, createdAt: Date.now(), ip };
    db.groups.push(group);
    save();
    notifyTelegram('New group requesting review\n\nName: ' + title + '\nPlatform: ' + type + '\nLink: ' + url + (stored ? '\nPhoto: saved to site' : '') + '\n\nApprove or reject it in your control panel.');
    return json(res, 200, { ok: true, message: 'Requesting review… your group is in the queue.', slug: group.slug });
  }

  /* ---- track a join click ---- */
  const clickMatch = pathname.match(/^\/api\/groups\/([a-z0-9-]+)\/join$/);
  if (req.method === 'POST' && clickMatch) {
    const g = db.groups.find((x) => x.slug === clickMatch[1]);
    if (g) {
      g.clicks = (g.clicks || 0) + 1;
      save();
    }
    return json(res, 200, { ok: true });
  }

  /* ---- report a group ---- */
  const reportMatch = pathname.match(/^\/api\/groups\/([a-z0-9-]+)\/report$/);
  if (req.method === 'POST' && reportMatch) {
    if (rateLimited(ip, 10, 3600_000)) return json(res, 429, { error: 'Too many reports.' });
    const g = db.groups.find((x) => x.slug === reportMatch[1]);
    if (g) {
      g.reports = (g.reports || 0) + 1;
      save();
    }
    return json(res, 200, { ok: true, message: 'Thanks, our moderators will check it.' });
  }

  /* ---- stats ticker ---- */
  if (req.method === 'GET' && pathname === '/api/stats') {
    const approved = db.groups.filter((g) => g.status === 'approved');
    return json(res, 200, {
      groups: approved.length,
      joins: approved.reduce((s, g) => s + (g.clicks || 0), 0),
      members: approved.reduce((s, g) => s + (g.clicks || 0), 0) * 7 + 1337, // playful live-feel counter
    });
  }

  /* ================= admin ================= */
  if (pathname.startsWith('/api/admin/')) {
    const key = req.headers['x-admin-key'] || '';
    if (key !== ADMIN_PASSWORD) return json(res, 401, { error: 'Wrong admin password' });

    if (req.method === 'GET' && pathname === '/api/admin/groups') {
      const status = query.get('status') || 'pending';
      const list = db.groups.filter((g) => (status === 'all' ? true : g.status === status)).sort((a, b) => b.createdAt - a.createdAt);
      return json(res, 200, { items: list });
    }

    const actionMatch = pathname.match(/^\/api\/admin\/([a-z0-9-]+)\/(approve|reject|delete|reset-reports)$/);
    if (req.method === 'POST' && actionMatch) {
      const g = db.groups.find((x) => x.id === actionMatch[1]);
      if (!g) return json(res, 404, { error: 'Not found' });
      const action = actionMatch[2];
      if (action === 'approve') g.status = 'approved';
      else if (action === 'reject') g.status = 'rejected';
      else if (action === 'delete') db.groups = db.groups.filter((x) => x.id !== g.id);
      else if (action === 'reset-reports') g.reports = 0;
      save();
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: 'Not found' });
}

/* ---------------------------------------------------------------- static */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function serveStatic(res, file) {
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) return false;
  try {
    const data = fs.readFileSync(full);
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'x';

  try {
    // locally stored group photos
    if (req.method === 'GET' && pathname.startsWith('/i/')) {
      const name = pathname.slice(3).replace(/[^a-z0-9.]/gi, '');
      const file = path.join(IMG_DIR, name);
      if (file.startsWith(IMG_DIR) && fs.existsSync(file)) {
        res.writeHead(200, { 'content-type': IMG_MIME[path.extname(file)] || 'image/jpeg', 'cache-control': 'public, max-age=604800' });
        return res.end(fs.readFileSync(file));
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }

    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, url.searchParams, ip);

    // admin-only host: everything here is the control panel
    const host = (req.headers.host || '').toLowerCase().split(':')[0];
    if (ADMIN_HOST && host === ADMIN_HOST) {
      if (req.method === 'GET' && pathname !== '/favicon.ico') {
        if (serveStatic(res, 'admin.html')) return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }

    if (req.method === 'GET' && pathname === '/sitemap.xml') {
      const base = `https://${req.headers.host}`;
      const urls = db.groups.filter((g) => g.status === 'approved').map((g) => `  <url><loc>${base}/group/${g.slug}</loc></url>`).join('\n');
      res.writeHead(200, { 'content-type': 'application/xml' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc></url>\n${urls}\n</urlset>`);
    }

    if (req.method === 'GET' && pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(`User-agent: *\nAllow: /\nSitemap: https://${req.headers.host}/sitemap.xml\n`);
    }

    // group detail pages are server-rendered shells (good for SEO / link previews)
    const groupPage = pathname.match(/^\/group\/([a-z0-9-]+)$/);
    if (req.method === 'GET' && groupPage) {
      if (serveStatic(res, 'index.html')) return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      if (serveStatic(res, 'index.html')) return;
    }
    if (req.method === 'GET' && pathname === '/' + ADMIN_PATH) {
      if (serveStatic(res, 'admin.html')) return;
    }
    const clean = pathname.replace(/^\/+/, '');
    if (req.method === 'GET' && clean && !clean.includes('..')) {
      if (serveStatic(res, clean)) return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error('[groupverse] request failed', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[groupverse] listening on :${PORT}`);
  if (ADMIN_PASSWORD === 'changeme') console.warn('[groupverse] WARNING: set ADMIN_PASSWORD env var!');
});
