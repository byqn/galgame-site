/* ==========================================================================
   公共逻辑 v2：导航、组件、程序化封面、筛选分页、各页面装配
   依赖 data.js（必须先引入）
   ========================================================================== */

(function () {
  const D = window.SITE_DATA;
  const BUILTIN_GAMES = D.games || [];
  const BUILTIN_POSTS = D.posts || [];
  let GAMES = BUILTIN_GAMES.slice();   // 运行时会把「自己上传的作品」合并进来
  let POSTS = BUILTIN_POSTS.slice();   // 同上：资源与教程
  const NOTICES = D.notices || [];
  const SITE = D.site;
  const PAGE_SIZE = 12;

  /* ------------------------------ 基础工具 ------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const fmtDate = (iso) => (iso ? iso.replace(/-/g, '/') : '—');

  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (!n) return '';
    const mb = n / 1048576;
    return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  }
  const getGame = (id) => GAMES.find((g) => g.id === id) || null;
  const getPost = (id) => POSTS.find((p) => p.id === id) || null;
  const postsOfGame = (gameId) => POSTS.filter((p) => p.gameId === gameId);

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function countValues(list, pick) {
    const map = new Map();
    list.forEach((item) => [].concat(pick(item)).forEach((v) => v && map.set(v, (map.get(v) || 0) + 1)));
    return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  // 预设标签分组（作品库为空时标签页依然有内容）
  const TAG_GROUPS = (D.tagGroups || []).map((g) => ({ name: g.name, tags: g.tags.slice() }));

  // 标签列表：预设标签 + 作品里出现的标签，按收录数量排序
  function allTags() {
    const counted = new Map(countValues(GAMES, (g) => g.tags).map((t) => [t.name, t.count]));
    const seen = new Set();
    const out = [];
    TAG_GROUPS.forEach((g) => g.tags.forEach((name) => {
      if (seen.has(name)) return;
      seen.add(name);
      out.push({ name, count: counted.get(name) || 0 });
    }));
    counted.forEach((count, name) => {
      if (seen.has(name)) return;
      seen.add(name);
      out.push({ name, count });
    });
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  const allCompanies = () => countValues(GAMES, (g) => g.circle);
  const allPlatforms = () => countValues(GAMES, (g) => g.platforms);
  const allLanguages = () => countValues(GAMES, (g) => g.languages);

  /* ------------------------------ 图标 ------------------------------ */
  const svg = (body, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" ${body}`;
  const ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/></svg>',
    star: '<svg class="star-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.5 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4.8a2 2 0 0 1 2-2H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z"/><circle cx="7.6" cy="7.6" r="1.4" fill="currentColor" stroke="none"/></svg>',
    company: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15"/><path d="M15 10h4a1 1 0 0 1 1 1v10"/><path d="M2.5 21h19"/><path d="M7.5 9h3M7.5 13h3M7.5 17h3"/></svg>',
    patch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5v7.5M13.5 17.25h7.5"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.11-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.42.36.79 1.08.79 2.18v3.23c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  };

  /* --------------------- 程序化封面（壁纸质感） ---------------------
     每部作品按 id 哈希选一种图案变体，按 cover.hue 生成配色，
     叠一层全局噪点 + 顶部光晕，得到接近壁纸的效果。 */
  const ART_VARIANTS = 6;

  function artLayers(v, uid) {
    const w = 400, h = 250;
    switch (v) {
      case 0: // 同心光环
        return `
          <circle cx="298" cy="66" r="46" fill="rgba(255,255,255,.10)"/>
          <circle cx="298" cy="66" r="80" fill="none" stroke="rgba(255,255,255,.20)"/>
          <circle cx="298" cy="66" r="122" fill="none" stroke="rgba(255,255,255,.10)"/>
          <circle cx="298" cy="66" r="166" fill="none" stroke="rgba(255,255,255,.055)"/>`;
      case 1: // 斜向流光
        return Array.from({ length: 15 }, (_, i) =>
          `<line x1="${-60 + i * 34}" y1="${h}" x2="${60 + i * 34}" y2="0" stroke="rgba(255,255,255,.075)" stroke-width="1"/>`
        ).join('') + `<circle cx="86" cy="196" r="70" fill="rgba(255,255,255,.05)"/>`;
      case 2: // 波纹
        return Array.from({ length: 5 }, (_, i) =>
          `<path d="M0 ${120 + i * 30} Q 100 ${98 + i * 30} 200 ${120 + i * 30} T 400 ${120 + i * 30}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1.2"/>`
        ).join('') + `<circle cx="322" cy="52" r="26" fill="rgba(255,255,255,.14)"/>`;
      case 3: // 透视网格 + 星点
        return Array.from({ length: 5 }, (_, i) =>
          `<line x1="0" y1="${162 + i * i * 5}" x2="400" y2="${162 + i * i * 5}" stroke="rgba(255,255,255,.08)"/>`
        ).join('') +
          Array.from({ length: 9 }, (_, i) =>
            `<line x1="${i * 52}" y1="250" x2="${178 + (i - 4) * 24}" y2="150" stroke="rgba(255,255,255,.06)"/>`
          ).join('') +
          Array.from({ length: 14 }, (_, i) => {
            const x = (hash(uid + 's' + i) % 380) + 10;
            const y = (hash(uid + 't' + i) % 110) + 12;
            const r = ((hash(uid + 'r' + i) % 18) + 8) / 10;
            return `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="rgba(255,255,255,.5)"/>`;
          }).join('');
      case 4: // 层叠山影
        return `
          <circle cx="300" cy="70" r="30" fill="rgba(255,255,255,.16)"/>
          <path d="M0 250 L 62 138 L 116 188 L 186 104 L 254 176 L 322 126 L 400 196 L 400 250 Z" fill="rgba(0,0,0,.26)"/>
          <path d="M0 250 L 84 180 L 156 212 L 236 160 L 318 208 L 400 172 L 400 250 Z" fill="rgba(0,0,0,.38)"/>`;
      default: // 气泡
        return Array.from({ length: 9 }, (_, i) => {
          const x = hash(uid + 'bx' + i) % 400;
          const y = hash(uid + 'by' + i) % 250;
          const r = (hash(uid + 'br' + i) % 46) + 12;
          const o = (((hash(uid + 'bo' + i) % 12) + 4) / 100).toFixed(2);
          return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,${o})"/>`;
        }).join('');
    }
  }

  function coverArt(game, wide) {
    const hue = (game.cover && game.cover.hue) || 270;
    const uid = 'a' + hash(game.id).toString(36);
    const v = hash(game.id) % ART_VARIANTS;
    const [w, h] = wide ? [400, 250] : [300, 400];
    return `<svg class="art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="hsl(${hue} 58% 33%)"/>
            <stop offset="55%" stop-color="hsl(${(hue + 24) % 360} 52% 21%)"/>
            <stop offset="100%" stop-color="hsl(${(hue + 46) % 360} 50% 9%)"/>
          </linearGradient>
          <radialGradient id="${uid}r" cx="78%" cy="6%" r="72%">
            <stop offset="0" stop-color="rgba(255,255,255,.30)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </radialGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#${uid}g)"/>
        <g>${artLayers(v, uid)}</g>
        <rect width="${w}" height="${h}" fill="url(#${uid}r)"/>
        <rect width="${w}" height="${h}" filter="url(#grain)" opacity=".055" style="mix-blend-mode:overlay"/>
      </svg>`;
  }

  /* ------------------------------ 组件 ------------------------------ */
  const NAV = [
    { href: 'index.html', text: '首页', key: 'home' },
    { href: 'galgame.html', text: 'Galgame', key: 'galgame' },
    { href: 'tag.html', text: '标签', key: 'tag' },
    { href: 'company.html', text: '会社', key: 'company' },
    { href: 'resource.html', text: '资源', key: 'resource' },
    { href: 'doc.html', text: '文档', key: 'doc' },
    { href: 'upload.html', text: '上传', key: 'upload' },
    { href: 'manage.html', text: '管理', key: 'manage' },
  ];

  function renderHeader(active) {
    const host = $('#topbar');
    if (!host) return;
    host.className = 'topbar';
    host.innerHTML = `
      <div class="wrap topbar-inner">
        <a class="logo" href="index.html">
          <span class="mark">萝</span>
          <span><b>小萝莉</b> <span>の资源站</span></span>
        </a>
        <nav class="menu">
          ${NAV.map((n) => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.text}</a>`).join('')}
        </nav>
        <div class="topbar-actions">
          <form class="top-search" id="top-search">
            ${ICON.search}
            <input type="search" placeholder="搜索作品…" autocomplete="off" aria-label="搜索作品">
          </form>
          <button class="icon-btn" id="theme-btn" type="button" title="切换深浅色主题"></button>
          <div class="user-area" id="user-area"></div>
          <a class="icon-btn" href="${SITE.repo}" target="_blank" rel="noopener" title="GitHub 仓库">${ICON.github}</a>
        </div>
      </div>`;
    const form = $('#top-search');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('input', form).value.trim();
      location.href = 'galgame.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
  }

  function renderFooter() {
    const host = $('#footer');
    if (!host) return;
    const year = new Date().getFullYear();
    host.className = 'footer';
    host.innerHTML = `
      <div class="wrap">
        <div class="frow">
          <span>© ${SITE.since}–${year} ${esc(SITE.name)}</span>
          <a href="doc.html">网站说明</a>
          <a href="resource.html">资源与补丁</a>
          <a href="${SITE.repo}" target="_blank" rel="noopener">GitHub 仓库</a>
          <a href="${SITE.repo}/issues" target="_blank" rel="noopener">问题反馈</a>
        </div>
        <div class="disc">
          本站仅整理公开的作品信息与原创文字内容，不存储、不提供任何游戏文件。页面中的下载地址均为占位示例，
          替换前请确认你拥有相应的分发权利。请支持正版。
        </div>
      </div>`;
  }

  // 全局噪点滤镜（只注入一次，所有封面共用）
  function injectGrainFilter() {
    if ($('#grain-defs')) return;
    const holder = document.createElement('div');
    holder.id = 'grain-defs';
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    holder.innerHTML = `<svg width="0" height="0"><defs>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
      </defs></svg>`;
    document.body.appendChild(holder);
  }

  // 封面：优先用 assets/img/covers/<id>.jpg，缺失或加载失败时回退到程序化 SVG 底图
  const COVER_DIR = 'assets/img/covers';

  function coverHtml(game, wide) {
    const glyph = (game.cover && game.cover.glyph) || game.title.slice(0, 1);
    return `<div class="gcover">
        ${coverArt(game, wide)}
        <img class="cover-img" src="${COVER_DIR}/${encodeURIComponent(game.id)}.jpg"
             alt="${esc(game.title)} 封面" decoding="async"
             onerror="this.remove()">
        <span class="veil"></span>
        <span class="glyph">${esc(glyph)}</span>
        ${game.isNew ? '<span class="badge-new">NEW</span>' : ''}
      </div>`;
  }

  function gameCard(g, kw) {
    return `<a class="gcard reveal" href="detail.html?id=${encodeURIComponent(g.id)}">
        ${coverHtml(g, true)}
        ${favButton(g.id)}
        <div class="gbody">
          <div class="gtitle">${highlight(g.title, kw)}</div>
          <div class="gstats">${ICON.star} ${g.rating.toFixed(1)} <span class="dot">·</span> ${esc(g.views)}</div>
          <div class="gtags">${[].concat(g.platforms, g.languages).slice(0, 3).map((t) => `<span class="gtag">${esc(t)}</span>`).join('')}</div>
        </div>
      </a>`;
  }

  function listRow(post) {
    const game = post.gameId ? getGame(post.gameId) : null;
    const cls = post.category === '补丁' ? 'badge' : post.category === '教程' ? 'badge blue' : 'badge green';
    return `<a class="list-item" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="${cls}">${esc(post.category)}</span>
        <div style="flex:1;min-width:0">
          <div class="li-title">${esc(post.title)}</div>
          <div class="li-desc">${esc(post.excerpt)}</div>
          <div class="li-meta">${fmtDate(post.date)} · ${esc(post.views || '—')} 浏览${game ? ' · 关联：' + esc(game.title) : ''}</div>
        </div>
      </a>`;
  }

  const emptyHtml = (t) => `<div class="empty">${esc(t || '没有找到符合条件的内容。')}</div>`;

  /* ------------------------------ 筛选与分页 ------------------------------ */
  function filterGames(state) {
    const kw = (state.q || '').trim().toLowerCase();
    const favIds = state.favOnly ? getFavs() : null;
    const list = GAMES.filter((g) => {
      if (favIds && favIds.indexOf(g.id) < 0) return false;
      if (state.tag && !g.tags.includes(state.tag)) return false;
      if (state.company && g.circle !== state.company) return false;
      if (state.platform && !g.platforms.includes(state.platform)) return false;
      if (state.language && !g.languages.includes(state.language)) return false;
      if (!kw) return true;
      return [g.title, g.originalTitle, g.circle, g.summary, g.tags.join(' ')].join(' ').toLowerCase().includes(kw);
    });
    const sorters = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      rating: (a, b) => b.rating - a.rating,
      release: (a, b) => b.releaseDate.localeCompare(a.releaseDate),
      title: (a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'),
    };
    return list.sort(sorters[state.sort] || sorters.updated);
  }

  function renderPager(host, { page, total, onGo }) {
    if (!host) return;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) { host.innerHTML = ''; return; }
    let btns = '';
    for (let i = 1; i <= pages; i++) btns += `<button class="${i === page ? 'on' : ''}" data-p="${i}">${i}</button>`;
    host.innerHTML = `
      <button data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      ${btns}
      <button data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一页</button>
      <span class="info">第 ${page} / ${pages} 页</span>`;
    host.onclick = (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.p);
      if (p >= 1 && p <= pages && p !== page) onGo(p);
    };
  }

  function renderChips(host, { options, active, allLabel = '全部', label = '', onPick }) {
    if (!host) return;
    const items = [{ name: '', text: allLabel }].concat(options.map((o) => ({ name: o.name, count: o.count, text: o.name })));
    host.innerHTML =
      (label ? `<span class="label">${esc(label)}</span>` : '') +
      items.map((it) => `<span class="chip ${(it.name || '') === (active || '') ? 'active' : ''}" data-v="${esc(it.name)}">${esc(it.text)}${it.count != null ? ' ' + it.count : ''}</span>`).join('');
    host.onclick = (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('.chip', host).forEach((c) => c.classList.toggle('active', c === chip));
      onPick(chip.dataset.v);
    };
  }

  function syncUrl(state, keys) {
    const p = new URLSearchParams();
    keys.forEach((k) => { if (state[k]) p.set(k, state[k]); });
    if (state.sort && state.sort !== 'updated') p.set('sort', state.sort);
    if (state.page && state.page > 1) p.set('page', state.page);
    const s = p.toString();
    history.replaceState(null, '', s ? '?' + s : location.pathname);
  }

  /* ------------------------------ 全局交互 ------------------------------ */
  function observeReveal(root) {
    const els = $$('.reveal:not(.in)', root || document);
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -30px 0px', threshold: 0.02 });
    els.forEach((el) => io.observe(el));
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('galgame_theme', t); } catch { /* 忽略 */ }
    const btn = document.querySelector('#theme-btn');
    if (btn) btn.innerHTML = t === 'light' ? ICON.moon : ICON.sun;
  }

  function initGlobalUI() {
    injectGrainFilter();

    // 深浅色主题
    let savedTheme = 'dark';
    try { savedTheme = localStorage.getItem('galgame_theme') || 'dark'; } catch { /* 忽略 */ }
    applyTheme(savedTheme);
    const themeBtn = $('#theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(now);
      });
    }

    // 收藏（事件委托：卡片与详情页通用）
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fav]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const on = toggleFav(btn.dataset.fav);
      btn.classList.toggle('on', on);
      btn.title = on ? '取消收藏' : '收藏';
      btn.innerHTML = btn.classList.contains('inline')
        ? FAV_SVG(on) + '<span>' + (on ? '已收藏' : '收藏') + '</span>'
        : FAV_SVG(on);
    });
    // 键盘可达
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const btn = e.target.closest ? e.target.closest('[data-fav]') : null;
      if (!btn) return;
      e.preventDefault();
      btn.click();
    });

    // 顶栏滚动阴影
    const bar = $('#topbar');
    const onScroll = () => {
      if (bar) bar.classList.toggle('scrolled', window.scrollY > 8);
      const top = $('#to-top');
      if (top) top.classList.toggle('show', window.scrollY > 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 返回顶部
    const btn = document.createElement('button');
    btn.id = 'to-top';
    btn.className = 'to-top';
    btn.type = 'button';
    btn.title = '返回顶部';
    btn.innerHTML = ICON.up;
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);
  }

  /* ------------------------------ 本地收藏 ------------------------------ */
  const FAV_KEY = 'galgame_favs';

  function getFavs() {
    try {
      const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  function setFavs(list) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch { /* 隐私模式忽略 */ }
  }
  const isFav = (id) => getFavs().indexOf(id) >= 0;
  function toggleFav(id) {
    const list = getFavs();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.unshift(id);
    setFavs(list);
    return i < 0;   // 返回「现在是否已收藏」
  }

  const FAV_SVG = (on) => `<svg viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.9z"/></svg>`;

  function favButton(id, cls) {
    const on = isFav(id);
    return `<span class="fav-btn${on ? ' on' : ''}${cls ? ' ' + cls : ''}" role="button" tabindex="0"
        data-fav="${esc(id)}" title="${on ? '取消收藏' : '收藏'}" aria-label="收藏">${FAV_SVG(on)}</span>`;
  }

  /* ------------------------------ 搜索历史与高亮 ------------------------------ */
  const HIST_KEY = 'galgame_history';

  function getHistory() {
    try {
      const v = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  function pushHistory(q) {
    const kw = String(q || '').trim();
    if (!kw) return;
    const list = getHistory().filter((x) => x !== kw);
    list.unshift(kw);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 10))); } catch { /* 忽略 */ }
  }
  function clearHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch { /* 忽略 */ }
  }

  // 关键词高亮（先转义再插入 <mark>，避免 XSS）
  function highlight(text, kw) {
    const s = String(text == null ? '' : text);
    const k = String(kw || '').trim();
    if (!k) return esc(s);
    const idx = s.toLowerCase().indexOf(k.toLowerCase());
    if (idx < 0) return esc(s);
    return esc(s.slice(0, idx)) +
      '<mark class="hl">' + esc(s.slice(idx, idx + k.length)) + '</mark>' +
      esc(s.slice(idx + k.length));
  }

  /* ------------------------------ 账号 ------------------------------ */
  const TOKEN_KEY = 'galgame_token';
  let currentUser = null;

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

  function renderAuthUI() {
    const host = $('#user-area');
    if (!host) return;
    if (currentUser) {
      host.innerHTML = `
        <a class="user-chip" href="upload.html" title="已登录，去上传作品">
          <span class="avatar">${esc(currentUser.username.slice(0, 1))}</span>
          <span>${esc(currentUser.username)}</span>
        </a>
        <button class="icon-btn" id="logout-btn" type="button" title="退出登录">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>
          </svg>
        </button>`;
      $('#logout-btn').addEventListener('click', async () => {
        try {
          await fetch('api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() } });
        } catch { /* 忽略 */ }
        setToken('');
        currentUser = null;
        renderAuthUI();
      });
    } else {
      host.innerHTML = '<a class="login-link" href="login.html">登录 / 注册</a>';
    }
  }

  async function loadAuth() {
    const token = getToken();
    if (!token) { renderAuthUI(); return; }
    try {
      const res = await fetch('api/me', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (res.ok) {
        const info = await res.json();
        currentUser = info.user || null;
      } else {
        setToken('');
        currentUser = null;
      }
    } catch { /* 静态托管下没有接口，保持未登录 */ }
    renderAuthUI();
  }

  /* ------------------------------ 评论 ------------------------------ */
  async function renderComments(host, targetType, targetId) {
    if (!host) return;
    host.innerHTML = '<h3>评论</h3><p class="muted small" style="margin:0">加载中…</p>';

    let list = [];
    let online = false;
    try {
      const res = await fetch(`api/comments?type=${encodeURIComponent(targetType)}&id=${encodeURIComponent(targetId)}`, { cache: 'no-store' });
      if (res.ok) { list = await res.json(); online = true; }
    } catch { /* 静态模式 */ }

    if (!online) {
      host.innerHTML = '<h3>评论</h3><p class="muted small" style="margin:0">当前是静态模式，评论功能需要在本地服务器模式下使用。</p>';
      return;
    }

    const me = currentUser;
    const items = Array.isArray(list) ? list : [];

    host.innerHTML = `
      <h3>评论 <span class="count" style="font-size:13px;color:var(--muted-2)">${items.length}</span></h3>
      <div class="comment-list">
        ${items.length ? items.map((c) => `
          <div class="comment">
            <div class="cm-head">
              <span class="cm-avatar">${esc(String(c.username || '?').slice(0, 1))}</span>
              <b>${esc(c.username || '匿名')}</b>
              <span class="cm-date">${esc(String(c.createdAt || '').slice(0, 10).replace(/-/g, '/'))}</span>
              ${me && (me.id === c.userId || me.username === c.username) ? `<span class="cm-del" data-del="${esc(c.id)}">删除</span>` : ''}
            </div>
            <div class="cm-body">${esc(c.content)}</div>
          </div>`).join('') : '<p class="muted small" style="margin:0">还没有评论，来抢沙发。</p>'}
      </div>
      ${me ? `
        <form class="comment-form">
          <textarea id="cm-input" rows="3" maxlength="1000" placeholder="以 ${esc(me.username)} 的身份说点什么…"></textarea>
          <div class="actions">
            <button class="btn btn-primary" type="submit">发表评论</button>
            <span class="small muted" id="cm-msg"></span>
          </div>
        </form>` : `
        <p class="small muted" style="margin:0">先 <a href="login.html" style="color:#ffc2d6">登录</a> 才能评论。</p>`}
    `;

    const form = host.querySelector('.comment-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $('#cm-input');
        const msg = $('#cm-msg');
        const content = input.value.trim();
        if (!content) { msg.textContent = '评论不能为空'; msg.style.color = '#f87171'; return; }
        msg.textContent = '提交中…';
        msg.style.color = '';
        try {
          const res = await fetch('api/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
            body: JSON.stringify({ targetType, targetId, content }),
          });
          const info = await res.json();
          if (!info.ok) throw new Error(info.error || '提交失败');
          renderComments(host, targetType, targetId);
        } catch (err) {
          msg.textContent = '失败：' + err.message;
          msg.style.color = '#f87171';
        }
      });
    }

    host.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      if (!confirm('确定删除这条评论？')) return;
      try {
        const res = await fetch('api/comment-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
          body: JSON.stringify({ id: del.dataset.del }),
        });
        const info = await res.json();
        if (!info.ok) throw new Error(info.error || '删除失败');
        renderComments(host, targetType, targetId);
      } catch (err) { alert('删除失败：' + err.message); }
    });
  }

  /* ------------------------------ QQ 群 ------------------------------ */
  // 移动端直接唤起 QQ 加群卡片；PC 浏览器无法唤起，弹出群号 + 复制按钮
  function joinQQGroup(group) {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|QQ\//i.test(navigator.userAgent);
    if (isMobile) {
      location.href = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${group}&card_type=group&source=qrcode`;
      return;
    }
    showQQModal(group);
  }

  function showQQModal(group) {
    let mask = $('#qq-modal');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'qq-modal';
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-label="加入 QQ 群">
          <button class="modal-close" type="button" aria-label="关闭">×</button>
          <div class="modal-icon">💬</div>
          <h3>加入 QQ 群</h3>
          <p class="muted">电脑浏览器无法直接唤起 QQ 加群，用任一方式即可：</p>
          <div class="qq-number">
            <span class="qq-num">${esc(group)}</span>
            <button class="btn small-btn" type="button" id="qq-copy">复制群号</button>
          </div>
          <p class="small muted" style="margin:8px 0 16px">打开 QQ →「加好友 / 加群」→ 搜索该群号 → 申请加入</p>
          <a class="btn btn-primary btn-block" href="https://qm.qq.com/cgi-bin/qm/qr?uin=${encodeURIComponent(group)}" target="_blank" rel="noopener">在浏览器打开加群页</a>
        </div>`;
      document.body.appendChild(mask);

      mask.addEventListener('click', (e) => {
        if (e.target === mask || e.target.closest('.modal-close')) mask.classList.remove('show');
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mask.classList.contains('show')) mask.classList.remove('show');
      });
      const copyBtn = mask.querySelector('#qq-copy');
      copyBtn.addEventListener('click', async () => {
        const text = mask.querySelector('.qq-num').textContent.trim();
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = '已复制 ✓';
        } catch {
          copyBtn.textContent = '请手动复制';
        }
        setTimeout(() => { copyBtn.textContent = '复制群号'; }, 1600);
      });
    } else {
      mask.querySelector('.qq-num').textContent = group;
    }
    requestAnimationFrame(() => mask.classList.add('show'));
  }

  /* ------------------------------ 页面装配 ------------------------------ */
  function initHome() {
    const social = $('#social-row');
    if (social) {
      social.innerHTML = (SITE.links || []).map((l) => {
        const isQQ = /QQ/i.test(l.label);
        return `<a class="social-btn" href="${isQQ ? 'javascript:void(0)' : 'doc.html'}"${isQQ ? ` data-qq="${esc(l.value)}"` : ''}>
            <span>${l.icon || '🔗'}</span>${esc(l.label)} · ${esc(l.value)}</a>`;
      }).join('');
      social.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-qq]');
        if (btn && btn.dataset.qq) { e.preventDefault(); joinQQGroup(btn.dataset.qq); }
      });
    }

    const notice = $('#notice-card');
    if (notice && NOTICES.length) {
      const n = NOTICES[0];
      notice.className = 'notice-card';
      notice.innerHTML = `
        <div class="notice-top">📢 ${esc(n.title)}</div>
        <p class="notice-desc">${esc(n.desc)}</p>
        <div class="notice-foot">
          <span>${fmtDate(n.date)}</span><span>${esc(n.views)} 浏览</span><span>${n.comments} 评论</span>
          <a class="notice-more" href="doc.html">更多 →</a>
        </div>`;
    }

    const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
    setText('#q-games', GAMES.length + ' 部作品');
    setText('#q-tag', allTags().length + ' 个标签');
    setText('#q-company', allCompanies().length + ' 家公司');
  }

  function initLibrary() {
    const params = new URLSearchParams(location.search);
    const state = {
      q: params.get('q') || '',
      tag: params.get('tag') || '',
      company: params.get('company') || '',
      platform: params.get('platform') || '',
      language: params.get('language') || '',
      sort: params.get('sort') || 'updated',
      page: Number(params.get('page') || 1),
      favOnly: params.get('fav') === '1',
    };
    const KEYS = ['q', 'tag', 'company', 'platform', 'language'];

    const grid = $('#lib-grid');
    const count = $('#lib-count');
    const pager = $('#lib-pager');
    const searchInput = $('#lib-search');
    const companySel = $('#lib-company');
    const platformSel = $('#lib-platform');
    const langSel = $('#lib-language');
    const sortSel = $('#lib-sort');

    searchInput.value = state.q;
    sortSel.value = state.sort;
    companySel.innerHTML = '<option value="">全部会社</option>' +
      allCompanies().map((c) => `<option value="${esc(c.name)}">${esc(c.name)}（${c.count}）</option>`).join('');
    platformSel.innerHTML = '<option value="">全部平台</option>' +
      allPlatforms().map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    langSel.innerHTML = '<option value="">全部语言</option>' +
      allLanguages().map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    companySel.value = state.company;
    platformSel.value = state.platform;
    langSel.value = state.language;

    renderChips($('#lib-tags'), {
      options: allTags(), active: state.tag, label: '标签：',
      onPick: (v) => { state.tag = v; state.page = 1; refresh(); },
    });

    function refresh() {
      const list = filterGames(state);
      const total = list.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (state.page > pages) state.page = pages;
      const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      grid.innerHTML = slice.map((g) => gameCard(g, state.q)).join('');
      const emptyEl = $('#lib-empty');
      if (total) emptyEl.style.display = 'none';
      else {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = GAMES.length
          ? '没有符合条件的作品，换个关键词或筛选条件试试。'
          : '作品库里还没有作品。<a href="upload.html" style="color:#ffd6e4">去上传第一部 →</a>';
      }
      count.textContent = `共 ${total} 部作品`;
      renderPager(pager, { page: state.page, total, onGo: (p) => { state.page = p; refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
      syncUrl(state, KEYS);
      observeReveal(grid);
    }

    // 搜索输入（带历史记录）
    let histTimer = null;
    searchInput.addEventListener('input', () => {
      state.q = searchInput.value;
      state.page = 1;
      refresh();
      clearTimeout(histTimer);
      if (state.q.trim().length >= 2) histTimer = setTimeout(() => pushHistory(state.q), 900);
    });

    // 搜索历史下拉
    const histBox = $('#lib-history');
    if (histBox) {
      const renderHistory = () => {
        const list = getHistory();
        if (!list.length) { histBox.classList.remove('show'); return; }
        histBox.innerHTML = '<div class="sh-head">最近搜索<span class="sh-clear" id="sh-clear">清空</span></div>' +
          list.map((h) => `<button class="sh-item" type="button" data-h="${esc(h)}">${esc(h)}</button>`).join('');
        histBox.classList.add('show');
      };
      histBox.addEventListener('click', (e) => {
        if (e.target.id === 'sh-clear') { clearHistory(); histBox.classList.remove('show'); return; }
        const item = e.target.closest('[data-h]');
        if (!item) return;
        searchInput.value = item.dataset.h;
        state.q = item.dataset.h;
        state.page = 1;
        histBox.classList.remove('show');
        refresh();
      });
      searchInput.addEventListener('focus', renderHistory);
      searchInput.addEventListener('blur', () => setTimeout(() => histBox.classList.remove('show'), 180));
    }

    // 只看收藏
    const favBtn = $('#lib-fav-btn');
    if (favBtn) {
      const syncFavBtn = () => {
        favBtn.classList.toggle('on', !!state.favOnly);
        favBtn.innerHTML = (state.favOnly ? '♥' : '♡') + ' 只看收藏 (' + getFavs().length + ')';
      };
      syncFavBtn();
      favBtn.addEventListener('click', () => {
        state.favOnly = !state.favOnly;
        state.page = 1;
        syncFavBtn();
        refresh();
      });
    }

    companySel.addEventListener('change', () => { state.company = companySel.value; state.page = 1; refresh(); });
    platformSel.addEventListener('change', () => { state.platform = platformSel.value; state.page = 1; refresh(); });
    langSel.addEventListener('change', () => { state.language = langSel.value; state.page = 1; refresh(); });
    sortSel.addEventListener('change', () => { state.sort = sortSel.value; state.page = 1; refresh(); });
    refresh();
  }

  function initDetail() {
    const id = new URLSearchParams(location.search).get('id');
    const g = getGame(id) || GAMES[0];
    const host = $('#detail');
    if (!g) {
      document.title = `作品不存在 - ${SITE.name}`;
      host.innerHTML = `
        <div class="crumbs"><a href="index.html">首页</a> / <a href="galgame.html">Galgame</a> / 未找到</div>
        <div class="empty">
          作品不存在或已被删除。<br>
          <a class="btn" href="galgame.html" style="margin-top:16px">返回作品库</a>
          <a class="btn btn-primary" href="upload.html" style="margin-top:16px">上传一部作品</a>
        </div>`;
      return;
    }
    document.title = `${g.title} - ${SITE.name}`;

    const related = GAMES.filter((x) => x.id !== g.id && x.tags.some((t) => g.tags.includes(t))).slice(0, 4);
    const posts = POSTS.filter((p) => p.gameId === g.id);

    host.innerHTML = `
      <div class="crumbs"><a href="index.html">首页</a> / <a href="galgame.html">Galgame</a> / ${esc(g.title)}</div>
      <div class="detail-grid">
        <div class="detail-cover">${coverHtml(g, false)}</div>
        <div class="detail-main">
          <h1>${esc(g.title)}<span class="rating-big">${ICON.star}<span class="n">${g.rating.toFixed(1)}</span></span></h1>
          <div class="orig">${esc(g.originalTitle)} · ${esc(g.circle)}</div>
          <div class="gtags">${g.tags.map((t) => `<a class="gtag" href="galgame.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
          <div class="meta-grid">
            <div><b>发售日期：</b>${fmtDate(g.releaseDate)}</div>
            <div><b>最后更新：</b>${fmtDate(g.updatedAt)}</div>
            <div><b>版本：</b>${esc(g.version)}</div>
            <div><b>大小：</b>${esc(g.size)}</div>
            <div><b>平台：</b>${g.platforms.map((p) => `<a href="galgame.html?platform=${encodeURIComponent(p)}">${esc(p)}</a>`).join(' / ')}</div>
            <div><b>语言：</b>${g.languages.map((l) => `<a href="galgame.html?language=${encodeURIComponent(l)}">${esc(l)}</a>`).join(' / ')}</div>
            <div><b>浏览：</b>${esc(g.views)}</div>
            <div><b>会社：</b><a href="galgame.html?company=${encodeURIComponent(g.circle)}">${esc(g.circle)}</a></div>
          </div>
          <div class="actions">
            <a class="btn btn-primary" href="#downloads">查看下载 / 版本</a>
            <span class="fav-btn inline" role="button" tabindex="0" data-fav="${esc(g.id)}"
                  title="${isFav(g.id) ? '取消收藏' : '收藏'}">${FAV_SVG(isFav(g.id))}<span>${isFav(g.id) ? '已收藏' : '收藏'}</span></span>
            <a class="btn" href="galgame.html?tag=${encodeURIComponent(g.tags[0] || '')}">找同类作品</a>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>作品简介</h3>
        <p class="muted" style="margin:0">${esc(g.summary)}</p>
      </div>

      <div class="panel">
        <h3>截图预览（占位）</h3>
        <div class="shots">
          ${g.screenshots.map((s) => `<div class="shot" style="--h:${(g.cover.hue + 28) % 360}">${esc(s)}</div>`).join('')}
        </div>
      </div>

      <div class="panel" id="downloads">
        <h3>下载</h3>
        ${g.file ? `
          <div class="file-box">
            <span class="fb-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
            </span>
            <div style="flex:1;min-width:0">
              <div class="li-title">${esc(g.file.name)}</div>
              <div class="li-meta">${fmtSize(g.file.size)} · 站内直链，点击即可在浏览器下载</div>
            </div>
            <a class="btn btn-primary" href="${esc(g.file.url)}" download>下载文件</a>
          </div>` : ''}
        ${g.downloads.length ? g.downloads.map((d) => `
          <div class="download-row">
            <span class="name">${esc(d.label)}</span>
            <a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">打开链接</a>
            <span class="small muted">提取码：<span class="code">${esc(d.code)}</span></span>
          </div>`).join('')
          : (g.file ? '' : '<p class="muted small" style="margin:0">暂无可下载内容。</p>')}
      </div>

      ${posts.length ? `<div class="panel"><h3>相关资源</h3>${posts.map(listRow).join('')}</div>` : ''}

      <div class="panel" id="comments"></div>

      ${related.length ? `<div class="section">
        <div class="section-head"><h2>相关作品</h2><a class="more" href="galgame.html">浏览全部 →</a></div>
        <div class="ggrid">${related.map((r) => gameCard(r)).join('')}</div>
      </div>` : ''}
    `;
    observeReveal(host);
    renderComments($('#comments'), 'game', g.id);
  }

  function tagPill(t) {
    const hue = hash(t.name) % 360;
    const dim = !t.count;
    return `<a class="tag-pill${dim ? ' dim' : ''}" href="galgame.html?tag=${encodeURIComponent(t.name)}" style="--th:${hue}">
        <span class="tp-dot"></span>
        <span class="tp-name">${esc(t.name)}</span>
        ${t.count ? `<span class="tp-count">${t.count} 部</span>` : ''}
      </a>`;
  }

  function initTags() {
    const counts = new Map(countValues(GAMES, (g) => g.tags).map((t) => [t.name, t.count]));

    const groups = TAG_GROUPS.map((g) => ({
      name: g.name,
      tags: g.tags.map((name) => ({ name, count: counts.get(name) || 0 })),
    }));

    // 作品里出现、但不在预设分组里的标签 → 归到「更多标签」
    const presetSet = new Set(TAG_GROUPS.reduce((acc, g) => acc.concat(g.tags), []));
    const extra = [];
    counts.forEach((count, name) => { if (!presetSet.has(name)) extra.push({ name, count }); });
    if (extra.length) groups.push({ name: '更多标签', tags: extra.sort((a, b) => b.count - a.count) });

    const host = $('#tag-groups');
    const total = groups.reduce((n, g) => n + g.tags.length, 0);
    const used = groups.reduce((n, g) => n + g.tags.filter((t) => t.count).length, 0);

    host.innerHTML = groups.map((g) => `
      <section class="tag-group">
        <div class="tag-group-head">
          <h3>${esc(g.name)}</h3>
          <span class="count">${g.tags.length} 个</span>
        </div>
        <div class="tag-cloud">${g.tags.map(tagPill).join('')}</div>
      </section>`).join('') + `
      <p class="small muted" style="margin:22px 0 0">
        共 ${total} 个标签，其中 ${used} 个已有作品收录。标签会自动跟随你上传的作品更新。
      </p>`;

    const c = $('#tag-count');
    if (c) c.textContent = `共 ${total} 个标签`;
    observeReveal(host);
  }

  function initCompanies() {
    const list = allCompanies();
    const host = $('#company-list');
    const top = $('#company-top');

    if (!list.length) {
      host.innerHTML = '<div class="empty" style="grid-column:1/-1">还没有会社条目。上传作品后，会社会自动收录在这里。<br><a class="btn btn-primary" href="upload.html" style="margin-top:14px">上传一部作品</a></div>';
      if (top) top.innerHTML = '<p class="muted small" style="margin:0">暂无数据。</p>';
      const c0 = $('#company-count');
      if (c0) c0.textContent = '共 0 家公司';
      return;
    }

    host.innerHTML = list.map((c, i) => `
      <a class="tile reveal" href="galgame.html?company=${encodeURIComponent(c.name)}">
        <span class="dot" style="color:hsl(${(i * 53 + 200) % 360} 70% 60%);background:hsl(${(i * 53 + 200) % 360} 70% 60%)"></span>
        <span class="tn">${esc(c.name)}</span>
        <span class="tc">${c.count} 部</span>
      </a>`).join('');
    const c = $('#company-count');
    if (c) c.textContent = `共 ${list.length} 家公司`;
    if (top) {
      top.innerHTML = list.slice(0, 4).map((c) => {
        const g = GAMES.filter((x) => x.circle === c.name).sort((a, b) => b.rating - a.rating)[0];
        return `<div class="list-item">
            <div style="flex:1">
              <div class="li-title">${esc(c.name)}</div>
              <div class="li-desc">代表作品：${esc(g.title)}（★ ${g.rating.toFixed(1)}）</div>
              <div class="li-meta">收录 ${c.count} 部作品</div>
            </div>
            <a class="btn" href="galgame.html?company=${encodeURIComponent(c.name)}">查看</a>
          </div>`;
      }).join('');
    }
    observeReveal(host);
  }

  function initResources() {
    const params = new URLSearchParams(location.search);
    const state = { cat: params.get('cat') || '', q: params.get('q') || '' };
    const list = $('#res-list');
    const count = $('#res-count');
    const input = $('#res-search');
    input.value = state.q;

    renderChips($('#res-cats'), {
      options: countValues(POSTS, (p) => p.category).map((c) => ({ name: c.name })),
      active: state.cat, label: '类型：',
      onPick: (v) => { state.cat = v; refresh(); },
    });

    function refresh() {
      const kw = state.q.trim().toLowerCase();
      const items = POSTS.filter((p) => {
        if (state.cat && p.category !== state.cat) return false;
        if (!kw) return true;
        return [p.title, p.excerpt, p.tags.join(' ')].join(' ').toLowerCase().includes(kw);
      }).sort((a, b) => b.date.localeCompare(a.date));
      list.innerHTML = items.map(listRow).join('');
      const emptyEl = $('#res-empty');
      if (items.length) emptyEl.style.display = 'none';
      else {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = POSTS.length
          ? '没有符合条件的条目。'
          : '还没有发布任何资源。<a href="upload.html#post" style="color:#ffd6e4">去发布第一条 →</a>';
      }
      count.textContent = `共 ${items.length} 条`;
    }
    input.addEventListener('input', () => { state.q = input.value; refresh(); });
    refresh();
  }

  function initPost() {
    const id = new URLSearchParams(location.search).get('id');
    const p = getPost(id) || POSTS[0];
    if (!p) {
      document.title = `资源不存在 - ${SITE.name}`;
      $('#article').innerHTML = `
        <div class="crumbs"><a href="index.html">首页</a> / <a href="resource.html">资源</a> / 未找到</div>
        <div class="empty">
          这条资源不存在或已被删除。<br>
          <a class="btn" href="resource.html" style="margin-top:16px">返回资源列表</a>
          <a class="btn btn-primary" href="upload.html#post" style="margin-top:16px">发布一条资源</a>
        </div>`;
      return;
    }
    const g = p.gameId ? getGame(p.gameId) : null;
    document.title = `${p.title} - ${SITE.name}`;

    const body = p.body.map((raw) => {
      if (raw.startsWith('## ')) return `<h2>${esc(raw.slice(3))}</h2>`;
      if (raw.startsWith('- ')) {
        return `<ul>${raw.split('\n').map((li) => `<li>${esc(li.replace(/^-\s*/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${esc(raw)}</p>`;
    }).join('');

    $('#article').innerHTML = `
      <div class="crumbs"><a href="index.html">首页</a> / <a href="resource.html">资源</a> / ${esc(p.category)}</div>
      <h1>${esc(p.title)}</h1>
      <div class="post-meta">
        ${fmtDate(p.date)} · ${esc(p.author)} · ${esc(p.views || '—')} 浏览 · ${esc(p.tags.join(' / '))}
        ${g ? ` · 关联作品：<a href="detail.html?id=${encodeURIComponent(g.id)}">${esc(g.title)}</a>` : ''}
      </div>
      ${body}
      <div class="panel" style="margin-top:28px">
        <h3>相关推荐</h3>
        ${POSTS.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 3).map(listRow).join('') || '<p class="muted small">暂无</p>'}
      </div>
      <div class="panel" id="comments"></div>`;

    renderComments($('#comments'), 'post', p.id);
  }

  function initDoc() {
    const host = $('#doc-notices');
    if (host) {
      host.innerHTML = NOTICES.map((n) => `
        <div class="list-item">
          <span class="badge">公告</span>
          <div style="flex:1">
            <div class="li-title">${esc(n.title)}</div>
            <div class="li-desc">${esc(n.desc)}</div>
            <div class="li-meta">${fmtDate(n.date)} · ${esc(n.views)} 浏览 · ${n.comments} 评论</div>
          </div>
        </div>`).join('');
    }
    const stat = $('#doc-stats');
    if (stat) {
      stat.innerHTML = `
        <div><b>收录作品：</b>${GAMES.length} 部</div>
        <div><b>资源条目：</b>${POSTS.length} 条</div>
        <div><b>会社：</b>${allCompanies().length} 家</div>
        <div><b>标签：</b>${allTags().length} 个</div>`;
    }
  }

  /* ------------------------------ 入口 ------------------------------ */
  async function init() {
    const page = document.body.dataset.page || '';

    // 合并「自己上传的内容」：读取 data/games.json 与 data/posts.json（静态托管下没有文件会静默跳过）
    try {
      const res = await fetch('data/games.json', { cache: 'no-store' });
      if (res.ok) {
        const uploaded = await res.json();
        if (Array.isArray(uploaded) && uploaded.length) GAMES = uploaded.concat(BUILTIN_GAMES);
      }
    } catch { /* file:// 或静态模式，忽略 */ }

    try {
      const res = await fetch('data/posts.json', { cache: 'no-store' });
      if (res.ok) {
        const uploaded = await res.json();
        if (Array.isArray(uploaded) && uploaded.length) POSTS = uploaded.concat(BUILTIN_POSTS);
      }
    } catch { /* 同上 */ }

    renderHeader(page);
    renderFooter();
    initGlobalUI();
    loadAuth();
    const routes = {
      home: initHome, galgame: initLibrary, detail: initDetail,
      tag: initTags, company: initCompanies, resource: initResources,
      post: initPost, doc: initDoc,
    };
    (routes[page] || function () {})();
    observeReveal(document);
  }

  // 对外暴露常用工具与数据，供上传页 / 登录页等复用
  window.SITE = {
    $, $$, esc, fmtDate, fmtSize, hash,
    getGame, getPost, postsOfGame,
    gameCard, listRow, coverHtml, coverArt,
    filterGames, allTags, allCompanies,
    observeReveal,
    get games() { return GAMES; },
    get posts() { return POSTS; },
  };

  document.addEventListener('DOMContentLoaded', init);
})();
