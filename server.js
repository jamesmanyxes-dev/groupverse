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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SITE_NAME = process.env.SITE_NAME || 'GroupVerse';
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || '';
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
  const { id, slug, title, url, type, category, country, language, tags, description, clicks, views, createdAt } = g;
  return { id, slug, title, url, type, category, country, language, tags, description, clicks, views, createdAt };
}

/* ------------------------------------------------------------------- api */

async function handleApi(req, res, pathname, query, ip) {
  /* ---- config for the frontend ---- */
  if (req.method === 'GET' && pathname === '/api/config') {
    return json(res, 200, { siteName: SITE_NAME, adsenseClient: ADSENSE_CLIENT, categories: CATEGORIES, countries: COUNTRIES, languages: LANGUAGES, types: TYPES });
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
    const group = { id, slug: slugify(title, id), title, url, type, category, country, language, tags, description, status: 'pending', clicks: 0, views: 0, reports: 0, createdAt: Date.now(), ip };
    db.groups.push(group);
    save();
    return json(res, 200, { ok: true, message: 'Submitted! Your group will appear after a quick review.' });
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
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, url.searchParams, ip);

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
    if (req.method === 'GET' && pathname === '/admin') {
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
