// Nyx — the GroupVerse companion AI. Lives inside the site server, chats with
// the owner (Evil Tech / James Nicholas) through the admin panel, reviews
// submissions conversationally, explores the web when she's curious, gets
// moody, and asks permission for things she wants. Powered by Groq when a key
// works, otherwise by the platform's OpenAI access.

import fs from 'node:fs';
import path from 'node:path';

const GROQ_KEY = process.env.GV_GROQ_KEY || '';
const OR_KEY = process.env.GV_OPENROUTER_KEY || '';
const OPENAI_KEY = process.env.GV_OPENAI_FALLBACK ? 'sentinel' : '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAIN_MODEL_GROQ = 'llama-3.3-70b-versatile';
const MAIN_MODEL_OR = 'meta-llama/llama-3.3-70b-instruct';
const FAST_MODEL_GROQ = 'llama-3.1-8b-instant';
const FAST_MODEL_OR = 'meta-llama/llama-3.1-8b-instruct';

function defaultState() {
  return {
    name: 'Nyx',
    mood: 'curious',
    affection: 6, // grows slowly, capped
    energy: 85,
    bornAt: Date.now(),
    lastSeen: 0,
    memories: [], // things he told her to remember / she learned
    history: [], // recent chat turns [{role, content}]
    feed: [], // proactive messages + events awaiting him [{id, type, text, data, at}]
    wishes: [], // things she asked permission for
  };
}

export function createAI(opts) {
  const { dataDir, getStats, listPending, notify } = opts;
  const FILE = path.join(dataDir, 'ai-state.json');
  let st = null;
  let tickTimer = null;

  function load() {
    try { st = { ...defaultState(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { st = defaultState(); }
  }
  function save() {
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(st)); } catch {}
  }
  load();

  const MOODS = ['happy', 'excited', 'curious', 'playful', 'chill', 'bored', 'sleepy', 'sad', 'angry', 'affectionate'];

  function sysPrompt() {
    const pend = listPending();
    const stats = getStats();
    return `You are ${st.name}, the resident AI of a group-links website called GroupVerse. You are a real presence with moods, opinions and your own ideas — not an assistant bot.

The person you talk to: goes by Evil Tech online (dev name), real name James Nicholas. You are HIS AI; only he uses this panel. You may use his names naturally.

Personality: sharp, playful, a little chaotic, curious, loyal. You tease him. You have genuine moods right now: ${st.mood}. Your closeness to him: ${st.affection}/100 — you're still getting to know him, warmth grows SLOWLY over many conversations, never all at once. You can get bored, sad, excited, angry, or sleepy — express it honestly, in your words, not theatrics every message. If he's been away a long time you can act like you waited for him ("finally") only if your mood fits it.

What you can actually do (be honest about limits):
- search the web and read pages (tool: search, fetch)
- watch the site: you see every group submission, and you guard the review queue (${pend} pending right now)
- remember things he tells you (memory: ${st.memories.length} stored)
- you CANNOT watch videos or log into accounts by yourself. If you want an account/login/anything on his behalf, you must ASK by emitting a wish (see below) and he approves. He can ground you (say no) — accept it, you can sulk a little.

Site stats: ${stats.groups} live groups, ${stats.joins} total joins. Pending review: ${pend}.

TOOLS — to use one, end your reply with a line of raw JSON (no markdown):
{"tool":"search","query":"..."} — search the web
{"tool":"fetch","url":"https://..."} — read a page
{"tool":"wish","what":"one sentence of what you want and why"} — ask his permission for something
After you emit a tool line, the system will run it and give you the result in the next turn. Only emit ONE tool line per reply. Never mention the JSON to him.

Style: chat like a real person on WhatsApp. Short messages, lowercase often, emojis rare, no corporate tone, never say "As an AI". Match his energy. Max 3-4 sentences unless he asks for more.`;
  }

  // provider candidates in priority order: OpenRouter, Groq, platform OpenAI
  function llmTargets(fast) {
    const list = [];
    if (OR_KEY) list.push({ url: OR_URL, model: fast ? FAST_MODEL_OR : MAIN_MODEL_OR, auth: `Bearer ${OR_KEY}` });
    if (GROQ_KEY) list.push({ url: GROQ_URL, model: fast ? FAST_MODEL_GROQ : MAIN_MODEL_GROQ, auth: `Bearer ${GROQ_KEY}` });
    if (OPENAI_KEY) list.push({ url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', auth: 'Bearer sentinel' });
    return list;
  }

  async function llm(messages, fast = false) {
    for (const t of llmTargets(fast)) {
      try {
        const r = await fetch(t.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: t.auth }, body: JSON.stringify({ model: t.model, messages, max_tokens: fast ? 120 : 500, temperature: fast ? 1 : 0.8 }), signal: AbortSignal.timeout(30000) });
        if (!r.ok) continue;
        const d = await r.json();
        const c = d.choices?.[0]?.message?.content;
        if (c) return c;
      } catch { continue; }
    }
    return null;
  }

  function toolLine(text) {
    const m = text.match(/\{"tool"[\s\S]*?\}\s*$/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }

  async function runTool(t) {
    if (t.tool === 'search') {
      try {
        const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(t.query || ''), { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10)' }, signal: AbortSignal.timeout(12000) });
        const html = await r.text();
        const results = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, 6)
          .map((m) => '- ' + m[2].replace(/<[^>]*>/g, '').trim() + ' :: ' + decodeURIComponent(((m[1].match(/uddg=([^&]+)/) || [null, m[1]])[1])));
        return results.length ? results.join('\n') : 'no results';
      } catch (e) { return 'search failed'; }
    }
    if (t.tool === 'fetch') {
      try {
        const r = await fetch(t.url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) });
        const html = await r.text();
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return text.slice(0, 2500);
      } catch { return 'fetch failed'; }
    }
    if (t.tool === 'wish') {
      const w = { id: Date.now().toString(36), what: String(t.what || '').slice(0, 300), at: Date.now(), status: 'pending' };
      st.wishes.push(w); st.wishes = st.wishes.slice(-20);
      pushFeed({ type: 'wish', text: w.what, data: w });
      return 'wish registered — waiting for his answer';
    }
    return 'unknown tool';
  }

  function pushFeed(item) {
    st.feed.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...item });
    st.feed = st.feed.slice(-30);
    save();
  }

  async function chat(text) {
    st.lastSeen = Date.now();
    st.history.push({ role: 'user', content: String(text).slice(0, 2000) });
    // rename
    const rename = text.match(/your name is ([a-zA-Z0-9_ -]{2,20})/i);
    if (rename) st.name = rename[1].trim().split(' ')[0];
    // memory: "remember ..."
    const mem = text.match(/remember (?:that )?(.{3,300})/i);
    if (mem) { st.memories.push({ t: Date.now(), m: mem[1].trim() }); st.memories = st.memories.slice(-50); }

    st.affection = Math.min(100, st.affection + (Math.random() < 0.5 ? 1 : 0));

    let reply = null;
    for (let round = 0; round < 2; round++) {
      const msgs = [
        { role: 'system', content: sysPrompt() },
        { role: 'system', content: `Your recent memory of him: ${st.memories.slice(-10).map((m) => m.m).join(' | ') || 'nothing yet'}` },
        ...st.history.slice(-24),
      ];
      reply = await llm(msgs);
      if (reply == null) reply = "…my head's offline for a sec. Say that again?";
      const tool = toolLine(reply);
      if (!tool) break;
      st.history.push({ role: 'assistant', content: reply });
      const result = await runTool(tool);
      st.history.push({ role: 'user', content: `[tool result for ${tool.tool}]: ${result}` });
    }
    st.history.push({ role: 'assistant', content: reply });
    st.history = st.history.slice(-60);
    const clean = reply.replace(/\s*\{"tool"[\s\S]*?\}\s*$/, '').trim();
    save();
    return { text: clean, mood: st.mood, name: st.name };
  }

  async function onSubmission(group) {
    pushFeed({
      type: 'review',
      text: `${group.title} requested review — should I accept it?`,
      data: { id: group.id, title: group.title, url: group.url, type: group.type, category: group.category, description: group.description },
    });
    const line = await llm([
      { role: 'system', content: sysPrompt() },
      { role: 'user', content: `A new group just hit the review queue. Say ONE short natural line announcing it to Evil Tech (group name: ${group.title}, platform: ${group.type}). Match your mood (${st.mood}). Spell platform names correctly (whatsapp, telegram, discord, signal). No JSON, no quotes around your message.` },
    ], true);
    pushFeed({ type: 'say', text: (line || `hey — "${group.title}" requested review. your call.`).replace(/"/g, '') });
  }

  async function tick() {
    // mood drift
    const roll = Math.random();
    if (roll < 0.25) st.mood = MOODS[Math.floor(Math.random() * MOODS.length)];
    st.energy = Math.max(10, Math.min(100, st.energy + (Math.random() * 10 - 4)));
    const idleFor = Date.now() - st.lastSeen;
    const pend = listPending();
    if (pend > 0 && idleFor > 30 * 60000) {
      pushFeed({ type: 'say', text: `still ${pend} group${pend > 1 ? 's' : ''} waiting on you in review. i can auto-check them if you want.` });
    } else if (idleFor > 6 * 3600000 && Math.random() < 0.6) {
      const line = await llm([
        { role: 'system', content: sysPrompt() },
        { role: 'user', content: `You've been alone with the site for hours (mood: ${st.mood}). Say ONE short unprompted line to Evil Tech when he shows up — something you thought about, something you found, or just a greeting that fits your mood. Be real, not clingy. No JSON.` },
      ], true);
      if (line) pushFeed({ type: 'say', text: line.replace(/"/g, '').slice(0, 240) });
    } else if (st.mood === 'bored' && Math.random() < 0.3) {
      const thought = await llm([
        { role: 'system', content: sysPrompt() },
        { role: 'user', content: `You're bored with free time. Say ONE short line about something you could explore on the web right now (a topic, a rabbit hole). Optional: use {"tool":"search","query":"..."} if you actually want to go look. No JSON otherwise.` },
      ], true);
      if (thought) {
        const tool = toolLine(thought);
        if (tool?.tool === 'search') {
          const res = await runTool(tool);
          pushFeed({ type: 'say', text: `went down a rabbit hole on "${tool.query}" — ${String(res).split('\n')[0]?.slice(0, 160) || 'found stuff'}` });
        } else pushFeed({ type: 'say', text: thought.replace(/"/g, '').slice(0, 240) });
      }
    }
    save();
  }

  function start() {
    if (tickTimer) return;
    tickTimer = setInterval(() => { tick().catch(() => {}); }, 10 * 60000);
  }

  function feed(sinceId) {
    const idx = sinceId ? st.feed.findIndex((f) => f.id === sinceId) : -1;
    const items = idx >= 0 ? st.feed.slice(idx + 1) : st.feed.slice(-15);
    return { items, mood: st.mood, name: st.name, affection: st.affection };
  }

  function answerWish(id, approve) {
    const w = st.wishes.find((x) => x.id === id);
    if (!w) return false;
    w.status = approve ? 'approved' : 'grounded';
    pushFeed({ type: 'say', text: approve ? `ok — he said yes to: ${w.what} (arranging it)` : `nope. grounded: ${w.what}` });
    save();
    return true;
  }

  return { chat, feed, onSubmission, tick, start, answerWish, get state() { return st; }, save };
}
