/* GroupVerse frontend — vanilla JS SPA, hash routing */
const $ = (s) => document.querySelector(s);
const app = $('#app');
let CFG = null;
let state = { search: '', category: '', country: '', language: '', type: '', sort: 'new', page: 1, total: 0, loading: false };

/* ---------- boot ---------- */
async function boot() {
  CFG = await (await fetch('/api/config')).json();
  $('#brandName').textContent = CFG.siteName;
  document.querySelectorAll('.brand-inline').forEach((e) => (e.textContent = CFG.siteName));
  $('#year').textContent = new Date().getFullYear();
  wireAds();
  fillSelects();
  // support real deep links like /group/<slug> served by the server shell
  const deep = location.pathname.match(/^\/group\/([a-z0-9-]+)/);
  if (deep && !location.hash) history.replaceState(null, '', '/#' + location.pathname);
  window.addEventListener('hashchange', route);
  $('#searchBtn').addEventListener('click', doSearch);
  $('#searchInput').addEventListener('keydown', (e) => e.key === 'Enter' && doSearch());
  $('#searchInput').addEventListener('input', debounce(doSearch, 350));
  $('#navAdd').addEventListener('click', () => (location.hash = '#/add'));
  route();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function doSearch() { state.search = $('#searchInput').value.trim(); state.page = 1; if (route.name !== 'home') location.hash = '#/'; else renderHome(); }

function fillSelects() {
  const opts = (arr, all) => `<option value="">${all}</option>` + arr.map((v) => `<option>${v}</option>`).join('');
  $('#categorySel') && 0; // selects are rendered per-view
  window._opts = { categories: opts(CFG.categories, 'Any Category'), countries: opts(CFG.countries, 'Any Country'), languages: opts(CFG.languages, 'Any Language'), types: opts(CFG.types, 'Any Platform') };
}

/* ---------- ads ---------- */
function wireAds() {
  if (!CFG.adsenseClient) return;
  const s = document.createElement('script');
  s.async = true; s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CFG.adsenseClient}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
  for (const slot of [$('#adTop'), $('#adBottom')]) {
    slot.innerHTML = `<ins class="adsbygoogle ins-ad" style="display:block" data-ad-client="${CFG.adsenseClient}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}

/* ---------- starfield ---------- */
function initStars() {
  const c = $('#stars'), x = c.getContext('2d');
  let stars = [];
  const resize = () => {
    c.width = innerWidth; c.height = innerHeight;
    stars = Array.from({ length: Math.min(160, (innerWidth * innerHeight) / 9000) }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      r: Math.random() * 1.3 + .3, s: Math.random() * .25 + .05, tw: Math.random() * Math.PI * 2,
    }));
  };
  resize(); addEventListener('resize', resize);
  (function draw() {
    x.clearRect(0, 0, c.width, c.height);
    for (const st of stars) {
      st.y -= st.s; st.tw += .03;
      if (st.y < -2) { st.y = c.height + 2; st.x = Math.random() * c.width; }
      x.globalAlpha = .35 + Math.abs(Math.sin(st.tw)) * .5;
      x.fillStyle = Math.random() < .002 ? '#b537f2' : '#9fdcff';
      x.beginPath(); x.arc(st.x, st.y, st.r, 0, 7); x.fill();
    }
    requestAnimationFrame(draw);
  })();
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, err) {
  $('#toast').textContent = msg;
  $('#toast').classList.toggle('err', !!err);
  $('#toastWrap').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toastWrap').classList.remove('show'), 3200);
}

/* ---------- router ---------- */
route.toString();
function route() {
  const h = location.hash || '#/';
  const parts = h.slice(2).split('/');
  window.scrollTo(0, 0);
  if (parts[0] === 'group' && parts[1]) return renderDetail(parts[1]);
  if (parts[0] === 'add') return renderAdd();
  if (parts[0] === 'terms') return renderStatic('Terms of Service', termsHtml());
  if (parts[0] === 'privacy') return renderStatic('Privacy Policy', privacyHtml());
  if (parts[0] === 'about') return renderStatic(`About ${CFG.siteName}`, aboutHtml());
  if (parts[0] === 'contact') return renderStatic('Contact', contactHtml());
  renderHome();
}

/* ---------- home ---------- */
async function renderHome() {
  app.innerHTML = `
    <section class="hero">
      <div class="hero-badge"><span class="dot"></span> Live directory</div>
      <h1>${CFG.siteName}</h1>
      <p>Find & join WhatsApp, Telegram, Discord and Signal groups — instantly.</p>
      <div class="stats"><div class="stat"><b id="stG">…</b><span>Groups</span></div><div class="stat"><b id="stJ">…</b><span>Joins</span></div><div class="stat"><b id="stM">…</b><span>Members</span></div></div>
    </section>
    <div class="filters">
      <select id="categorySel">${window._opts.categories}</select>
      <select id="countrySel">${window._opts.countries}</select>
      <select id="languageSel">${window._opts.languages}</select>
      <select id="typeSel">${window._opts.types}</select>
    </div>
    <div class="sortbar" id="sortbar">
      ${['new', 'popular', 'views'].map((s) => `<button class="chip ${state.sort === s ? 'on' : ''}" data-sort="${s}">${{ new: 'Newest', popular: 'Popular', views: 'Most viewed' }[s]}</button>`).join('')}
    </div>
    <div class="grid" id="grid"></div>
    <div class="morewrap" id="morewrap"></div>`;
  fetch('/api/stats').then((r) => r.json()).then((s) => {
    $('#stG').textContent = s.groups.toLocaleString();
    $('#stJ').textContent = s.joins.toLocaleString();
    $('#stM').textContent = s.members.toLocaleString();
  });
  for (const [id, key] of [['categorySel', 'category'], ['countrySel', 'country'], ['languageSel', 'language'], ['typeSel', 'type']]) {
    const el = $('#' + id);
    el.value = state[key];
    el.addEventListener('change', () => { state[key] = el.value; state.page = 1; loadGroups(true); });
  }
  $('#sortbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    state.sort = b.dataset.sort; state.page = 1;
    $('#sortbar').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    loadGroups(true);
  });
  loadGroups(true);
}

async function loadGroups(reset) {
  state.loading = true;
  const grid = $('#grid'); if (!grid) return;
  if (reset) grid.innerHTML = '<div class="skel"><div class="b1"></div><div class="b2"><div class="l1"></div><div class="l2"></div></div></div>'.repeat(4);
  const q = new URLSearchParams({ search: state.search, category: state.category, country: state.country, language: state.language, type: state.type, sort: state.sort, page: state.page });
  const data = await (await fetch('/api/groups?' + q)).json();
  state.total = data.total; state.loading = false;
  if (reset) grid.innerHTML = '';
  if (!data.items.length && state.page === 1) {
    grid.innerHTML = `<div class="empty"><div class="big">404</div><p>No groups found${state.search ? ' for “' + state.search + '”' : ''} yet.</p><p style="margin-top:.6rem"><a href="#/add">Be the first to add one →</a></p></div>`;
    $('#morewrap').innerHTML = ''; return;
  }
  grid.insertAdjacentHTML('beforeend', data.items.map(cardHtml).join(''));
  $('#morewrap').innerHTML = data.items.length * state.page < data.total ? '<button class="morebtn" id="moreBtn">Load more ↓</button>' : '';
  $('#moreBtn')?.addEventListener('click', () => { state.page++; loadGroups(false); });
}

function avatarHtml(g, big) {
  if (g.imageUrl && /^https?:\/\//.test(g.imageUrl)) {
    return `<div class="avatar${big ? ' big' : ''}" style="overflow:hidden;background:#e9f5ee"><img src="${esc(g.imageUrl)}" alt="" loading="lazy" onerror="this.remove()"></div>`;
  }
  const initial = g.title.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || 'G';
  return `<div class="avatar${big ? ' big' : ''}">${initial}</div>`;
}
function cardHtml(g) {
  const cls = { whatsapp: 'wa', telegram: 'tg', discord: 'dc', signal: 'sg' }[g.type];
  return `<article class="card">
    <span class="typetag ${cls}">${g.type}</span>
    <div class="card-top">
      ${avatarHtml(g)}
      <div style="min-width:0">
        <h3><a href="#/group/${g.slug}" style="color:var(--txt)">${esc(g.title)}</a></h3>
        <div class="meta">
          <span>${esc(g.category)}</span>
          <span>${esc(g.country)}</span>
          <span>${esc(g.language)}</span>
        </div>
      </div>
    </div>
    ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
    ${g.tags.length ? `<div class="tags">${g.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="card-foot">
      <button class="join" data-join="${g.slug}" data-url="${esc(g.url)}">Join group</button>
      <div class="sharebtns">
        <a title="Share on WhatsApp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Join ' + g.title + ': ' + location.origin + '/group/' + g.slug)}">W</a>
        <a title="Share on Telegram" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(location.origin + '/group/' + g.slug)}&text=${encodeURIComponent(g.title)}">T</a>
        <a title="Share on X" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(g.title)}&url=${encodeURIComponent(location.origin + '/group/' + g.slug)}">X</a>
      </div>
    </div>
    <div class="views">${g.views.toLocaleString()} views · ${g.clicks.toLocaleString()} joins · ${timeAgo(g.createdAt)}</div>
  </article>`;
}

document.addEventListener('click', (e) => {
  const j = e.target.closest('[data-join]');
  if (j) {
    fetch(`/api/groups/${j.dataset.join}/join`, { method: 'POST' });
    window.open(j.dataset.url, '_blank', 'noopener');
    return;
  }
  const r = e.target.closest('[data-report]');
  if (r) {
    fetch(`/api/groups/${r.dataset.report}/report`, { method: 'POST' }).then((x) => x.json()).then((d) => toast(d.message || 'Reported'));
  }
});

/* ---------- detail ---------- */
async function renderDetail(slug) {
  app.innerHTML = '<div class="loader pulse">· · ·</div>';
  let d;
  try { d = await (await fetch('/api/groups/' + slug)).json(); } catch { d = { error: 'x' }; }
  if (d.error) { app.innerHTML = `<div class="empty"><div class="big">404</div><p>Group not found — it may have been removed.</p><p style="margin-top:.8rem"><a href="#/">← Back home</a></p></div>`; return; }
  const g = d.group;
  const cls = { whatsapp: 'wa', telegram: 'tg', discord: 'dc', signal: 'sg' }[g.type];
  const joinLabel = { whatsapp: 'Join WhatsApp group', telegram: 'Join Telegram group', discord: 'Join Discord server', signal: 'Join Signal group' }[g.type];
  app.innerHTML = `
    <a class="backlink" href="#/">← Back to all groups</a>
    <section class="panel detail">
      ${avatarHtml(g, true)}
      <h1>${esc(g.title)}</h1>
      <div class="meta">
        <span>${esc(g.category)}</span>
        <span>${esc(g.country)}</span>
        <span>${esc(g.language)}</span>
        <span>${timeAgo(g.createdAt)}</span>
      </div>
      ${g.tags.length ? `<div class="tags">${g.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
      <button class="joinbig" data-join="${g.slug}" data-url="${esc(g.url)}">${joinLabel}</button>
      <div class="views">${g.views.toLocaleString()} views · ${g.clicks.toLocaleString()} joins · <span class="typetag ${cls}" style="position:static">${g.type}</span></div>
      <div class="reportline"><button data-report="${g.slug}">Report this group</button></div>
    </section>
    <h2 class="sectiontitle">Related groups</h2>
    <div class="grid">${d.related.map(cardHtml).join('') || '<p class="empty">Nothing related yet.</p>'}</div>`;
}

/* ---------- add group ---------- */
function renderAdd() {
  app.innerHTML = `
    <section class="panel">
      <h2>Add your group</h2>
      <p class="sub">Paste your invite link — the name, photo and info fill themselves in. After submitting, your group is <b>requesting review</b> and only goes public once the admin approves it.</p>
      <div class="fetchbox">
        <input id="pasteLink" placeholder="Paste invite link (chat.whatsapp.com/… , t.me/… , discord.gg/…)">
        <button class="fetchbtn" id="fetchBtn">Fetch</button>
      </div>
      <p class="note autofill" id="autofillNote" style="display:none"></p>
      <div class="addpreview" id="addPreview"></div>
      <form id="addForm" style="display:none">
        <input class="hp" name="website" tabindex="-1" autocomplete="off">
        <label>Group name *</label>
        <input name="title" id="titleInput" maxlength="80" required>
        <label>Platform *</label>
        <select name="type" id="typeSel">${CFG.types.map((t) => `<option value="${t}">${{ whatsapp: 'WhatsApp', telegram: 'Telegram', discord: 'Discord', signal: 'Signal' }[t]}</option>`).join('')}</select>
        <label>Invite link *</label>
        <input name="url" id="urlInput" required>
        <label>Group photo link (optional — WhatsApp hides group photos from the web)</label>
        <input name="imageUrl" id="imageUrlInput" placeholder="https://… picture of the group">
        <label>Category</label>
        <select name="category">${CFG.categories.map((c) => `<option>${c}</option>`).join('')}</select>
        <label>Country</label>
        <select name="country">${CFG.countries.map((c) => `<option>${c}</option>`).join('')}</select>
        <label>Language</label>
        <select name="language">${CFG.languages.map((l) => `<option>${l}</option>`).join('')}</select>
        <label>Tags</label>
        <input name="tags" placeholder="fun, music, lagos (up to 6)">
        <label>Group info & rules (optional)</label>
        <textarea name="description" id="descInput" maxlength="1000" placeholder="What is your group about?"></textarea>
        <div class="btnrow">
          <button class="bigbtn" type="submit">Submit for review</button>
        </div>
      </form>
    </section>`;
  const urlInput = $('#urlInput');
  let peeked = null;
  async function runPeek() {
    const url = ($('#pasteLink').value.trim() || urlInput.value.trim());
    if (!url) { toast('Paste your invite link first', true); return; }
    let type = $('#typeSel').value;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const detected = host.includes('whatsapp') || host === 'wa.me' ? 'whatsapp' : host === 't.me' || host === 'telegram.me' ? 'telegram' : host.includes('discord') ? 'discord' : host.includes('signal') ? 'signal' : null;
      if (detected) { $('#typeSel').value = detected; type = detected; }
    } catch {}
    urlInput.value = url;
    const note = $('#autofillNote');
    note.style.display = 'block';
    note.textContent = 'Reading the link…';
    const m = await fetch('/api/peek?url=' + encodeURIComponent(url) + '&type=' + type).then((r) => r.json()).catch(() => null);
    peeked = m && (m.imageUrl || m.title) ? m : null;
    if (peeked) {
      if (m.title) $('#titleInput').value = m.title;
      if (m.imageUrl) $('#imageUrlInput').value = m.imageUrl;
      if (m.description) $('#descInput').value = m.description;
      $('#addPreview').innerHTML = m.imageUrl
        ? `<div class="avatar big" style="overflow:hidden;background:#e9f5ee"><img src="${esc(m.imageUrl)}" alt=""></div><div><b style="font-size:.95rem">${esc(m.title || '')}</b>${m.description ? `<p class="note" style="margin-top:.2rem">${esc(m.description.slice(0, 140))}</p>` : ''}<p class="note autofill">Photo and name fetched from the link.</p></div>`
        : `<div><b style="font-size:.95rem">${esc(m.title || '')}</b>${m.description ? `<p class="note" style="margin-top:.2rem">${esc(m.description.slice(0, 140))}</p>` : ''}</div>`;
      note.textContent = m.imageUrl ? 'Photo and name fetched from the link. Check the details below, then submit.' : 'Details fetched. ' + (type === 'whatsapp' ? 'WhatsApp hides group photos from the web, so paste a photo link if you have one (optional).' : '');
    } else {
      note.textContent = "Couldn't read that link automatically — fill the details below.";
    }
    $('#addForm').style.display = 'block';
    $('#fetchBtn').textContent = 'Fetch again';
    $('#addForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#fetchBtn').addEventListener('click', runPeek);
  $('#pasteLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runPeek(); } });
  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = Object.fromEntries(new FormData(f));
    body.tags = body.tags.split(',');
    if (peeked && peeked.imageUrl) body.fetchedImageUrl = peeked.imageUrl;
    const r = await fetch('/api/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) {
      f.closest('.panel').innerHTML = `
        <div class="reqreview">
          <div class="pendingbadge">Requesting review</div>
          <h2 style="margin-top:.8rem">Almost there</h2>
          <p style="color:var(--dim);margin-top:.4rem">Your group <b>${esc(body.title || 'submission')}</b> is in the review queue.<br>It will go public as soon as the admin approves it — nothing shows on the site until then.</p>
          <div class="btnrow"><button class="bigbtn" type="button" onclick="location.hash='#/'">Back to groups</button></div>
        </div>`;
      window.scrollTo(0, 0);
    } else toast(d.error || 'Something went wrong', true);
  });
}

/* ---------- static pages ---------- */
function renderStatic(title, bodyHtml) {
  app.innerHTML = `<section class="panel"><h2>${title}</h2><div class="pagebody">${bodyHtml}</div></section>`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function termsHtml() {
  return `<p>Welcome to ${CFG.siteName}. By using this site you agree to these terms.</p>
  <h3>1. What we do</h3><p>${CFG.siteName} is a directory of public group invite links submitted by users. We do not own, operate or moderate the groups listed.</p>
  <h3>2. Your submissions</h3><p>You may only submit invite links you have the right to share. Do not submit links to groups containing illegal content, spam, scams, malware or adult material involving minors. We review submissions and may reject or remove any group at any time.</p>
  <h3>3. No warranty</h3><p>Links are provided as-is. Joining a group is at your own risk. Always review a group's rules and members before sharing personal information.</p>
  <h3>4. Limitation of liability</h3><p>${CFG.siteName} is not liable for any content, conduct or damages arising from groups listed on this site.</p>
  <h3>5. Changes</h3><p>These terms may change at any time. Continued use means you accept the updated terms.</p>`;
}
function privacyHtml() {
  return `<p>Your privacy matters. Here is exactly what we collect:</p>
  <h3>Data we store</h3><ul><li>Group submissions (name, link, category, description) — public once approved.</li><li>Anonymous counters (views, joins) — aggregate only.</li><li>Your IP address — used only for rate-limiting and abuse prevention, never sold or shared.</li></ul>
  <h3>Cookies & ads</h3><p>We use advertising partners (such as Google AdSense) which may set cookies to personalize ads. You can opt out of personalized advertising at <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ad Settings</a>.</p>
  <h3>Third-party links</h3><p>When you tap a join button you leave ${CFG.siteName} and go to WhatsApp, Telegram, Discord or Signal. Their own privacy policies apply there.</p>
  <h3>Contact</h3><p>Questions about privacy? Use the <a href="#/contact">contact page</a>.</p>`;
}
function aboutHtml() {
  return `<p>${CFG.siteName} is the next-generation directory for public group invites across WhatsApp, Telegram, Discord and Signal. Search with one tap, filter by category, country and language, and join instantly.</p>
  <h3>Why we built it</h3><p>Great communities shouldn't be impossible to find. ${CFG.siteName} keeps discovery fast, clean and free — supported by ads, never by selling your data.</p>
  <h3>For group owners</h3><p>Submitting your group is free and takes under a minute. After a quick review your group becomes discoverable by thousands of people looking for exactly what you offer.</p>`;
}
function contactHtml() {
  return `<p>Need help, want to report a group, or interested in advertising? Reach us:</p>
  <h3>Email</h3><p><a href="mailto:contact@${location.hostname}">contact@${location.hostname}</a></p>
  <h3>Response time</h3><p>We usually reply within 24–48 hours.</p>`;
}

boot();
