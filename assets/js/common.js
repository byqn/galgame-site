/* ==========================================================================
   公共逻辑：导航、页脚、卡片与列表组件、筛选、分页、各页面装配
   依赖 data.js（必须先引入）
   ========================================================================== */

(function () {
  const D = window.SITE_DATA;
  const GAMES = D.games;
  const POSTS = D.posts;
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
  const getGame = (id) => GAMES.find((g) => g.id === id) || null;
  const getPost = (id) => POSTS.find((p) => p.id === id) || null;

  // 统计每个取值出现的次数：[{ name, count }]，按次数降序
  function countValues(list, pick) {
    const map = new Map();
    list.forEach((item) => {
      const vals = [].concat(pick(item));
      vals.forEach((v) => v && map.set(v, (map.get(v) || 0) + 1));
    });
    return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  const allTags = () => countValues(GAMES, (g) => g.tags);
  const allCompanies = () => countValues(GAMES, (g) => g.circle);
  const allPlatforms = () => countValues(GAMES, (g) => g.platforms);
  const allLanguages = () => countValues(GAMES, (g) => g.languages);

  /* ------------------------------ 组件 ------------------------------ */
  const NAV = [
    { href: 'index.html', text: '首页', key: 'home' },
    { href: 'galgame.html', text: 'Galgame', key: 'galgame' },
    { href: 'tag.html', text: '标签', key: 'tag' },
    { href: 'company.html', text: '会社', key: 'company' },
    { href: 'resource.html', text: '资源', key: 'resource' },
    { href: 'doc.html', text: '文档', key: 'doc' },
  ];

  function renderHeader(active) {
    const host = $('#topbar');
    if (!host) return;
    host.className = 'topbar';
    host.innerHTML = `
      <div class="wrap topbar-inner">
        <a class="logo" href="index.html"><b>Galgame</b><span>资源站</span></a>
        <nav class="menu">
          ${NAV.map((n) => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.text}</a>`).join('')}
        </nav>
        <div class="topbar-actions">
          <form class="top-search" id="top-search">
            <span class="muted">🔍</span>
            <input type="search" placeholder="搜索作品…" autocomplete="off" aria-label="搜索作品">
          </form>
          <a class="icon-btn" href="${SITE.repo}" target="_blank" rel="noopener" title="GitHub 仓库">gh</a>
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

  function coverHtml(game, extra = '') {
    const hue = (game.cover && game.cover.hue) || 270;
    const glyph = (game.cover && game.cover.glyph) || game.title.slice(0, 1);
    return `<div class="gcover ${extra}" style="--h:${hue}">
        <span class="glyph">${esc(glyph)}</span>
        ${game.isNew ? '<span class="badge-new">新发布</span>' : ''}
      </div>`;
  }

  function gameCard(g) {
    return `<a class="gcard" href="detail.html?id=${encodeURIComponent(g.id)}">
        ${coverHtml(g)}
        <div class="gbody">
          <div class="gtitle">${esc(g.title)}</div>
          <div class="gstats"><span class="star">★</span> ${g.rating.toFixed(1)} <span class="muted">·</span> ${esc(g.views)}</div>
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

  function emptyHtml(text) {
    return `<div class="empty">${esc(text || '没有找到符合条件的内容。')}</div>`;
  }

  /* ------------------------------ 筛选与分页 ------------------------------ */
  function filterGames(state) {
    const kw = (state.q || '').trim().toLowerCase();
    const list = GAMES.filter((g) => {
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
    for (let i = 1; i <= pages; i++) {
      btns += `<button class="${i === page ? 'on' : ''}" data-p="${i}">${i}</button>`;
    }
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

  // 渲染一排可点击的筛选 chip
  function renderChips(host, { options, active, allLabel = '全部', label = '', onPick }) {
    if (!host) return;
    const items = [{ name: '', count: null, text: allLabel }].concat(
      options.map((o) => ({ name: o.name, count: o.count, text: o.name }))
    );
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

  // 把筛选状态同步到地址栏
  function syncUrl(state, keys) {
    const p = new URLSearchParams();
    keys.forEach((k) => { if (state[k]) p.set(k, state[k]); });
    if (state.sort && state.sort !== 'updated') p.set('sort', state.sort);
    if (state.page && state.page > 1) p.set('page', state.page);
    const s = p.toString();
    history.replaceState(null, '', s ? '?' + s : location.pathname);
  }

  /* ------------------------------ 页面装配 ------------------------------ */
  function initHome() {
    // Hero 社交按钮
    const social = $('#social-row');
    if (social) {
      social.innerHTML = (SITE.links || []).map((l) =>
        `<a class="social-btn" href="doc.html"><span>${l.icon || '🔗'}</span>${esc(l.label)} · ${esc(l.value)}</a>`
      ).join('');
    }

    // 公告卡
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

    // 快捷入口计数
    const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
    setText('#q-tag', allTags().length + ' 个标签');
    setText('#q-company', allCompanies().length + ' 家会社');
    setText('#q-resource', POSTS.filter((p) => p.category === '补丁').length + ' 个补丁');

    // 最新 Galgame
    const latest = filterGames({ sort: 'updated' }).slice(0, 12);
    const grid = $('#latest-grid');
    if (grid) grid.innerHTML = latest.map(gameCard).join('') || emptyHtml();

    // 高分榜
    const top = filterGames({ sort: 'rating' }).slice(0, 4);
    const topGrid = $('#top-grid');
    if (topGrid) topGrid.innerHTML = top.map(gameCard).join('');

    // 最新补丁
    const patches = POSTS.filter((p) => p.category === '补丁').slice(0, 6);
    const pl = $('#patch-list');
    if (pl) pl.innerHTML = patches.map(listRow).join('') || emptyHtml();

    // 数据统计
    setText('#stat-games', GAMES.length);
    setText('#stat-posts', POSTS.length);
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
      grid.innerHTML = slice.map(gameCard).join('') + (total ? '' : '');
      $('#lib-empty').style.display = total ? 'none' : 'block';
      count.textContent = `共 ${total} 部作品`;
      renderPager(pager, { page: state.page, total, onGo: (p) => { state.page = p; refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
      syncUrl(state, KEYS);
    }

    searchInput.addEventListener('input', () => { state.q = searchInput.value; state.page = 1; refresh(); });
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
    document.title = `${g.title} - ${SITE.name}`;

    const related = GAMES.filter((x) => x.id !== g.id && x.tags.some((t) => g.tags.includes(t))).slice(0, 4);
    const posts = POSTS.filter((p) => p.gameId === g.id);

    host.innerHTML = `
      <div class="crumbs"><a href="index.html">首页</a> / <a href="galgame.html">Galgame</a> / ${esc(g.title)}</div>
      <div class="detail-grid">
        <div class="detail-cover">${coverHtml(g)}</div>
        <div class="detail-main">
          <h1>${esc(g.title)}<span class="rating-big"><span class="star" style="color:var(--star)">★</span><span class="n">${g.rating.toFixed(1)}</span></span></h1>
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
          ${g.screenshots.map((s) => `<div class="shot" style="--h:${(g.cover.hue + 30) % 360}">${esc(s)}</div>`).join('')}
        </div>
      </div>

      <div class="panel" id="downloads">
        <h3>下载 / 版本</h3>
        ${g.downloads.map((d) => `
          <div class="download-row">
            <span class="name">${esc(d.label)}</span>
            <a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">打开链接</a>
            <span class="small muted">提取码：<span class="code">${esc(d.code)}</span></span>
          </div>`).join('')}
        <p class="small muted" style="margin:14px 0 0">以上为占位示例，请在 <code>assets/js/data.js</code> 中替换为你有权分发的地址。</p>
      </div>

      ${posts.length ? `<div class="panel"><h3>相关资源</h3>${posts.map(listRow).join('')}</div>` : ''}

      ${related.length ? `<div class="section">
        <div class="section-head"><h2>相关作品</h2><a class="more" href="galgame.html">浏览全部 →</a></div>
        <div class="ggrid">${related.map(gameCard).join('')}</div>
      </div>` : ''}
    `;
  }

  function initTags() {
    const tags = allTags();
    const host = $('#tag-wall');
    host.innerHTML = tags.map((t) => `
      <a class="tile" href="galgame.html?tag=${encodeURIComponent(t.name)}">
        <span class="dot" style="background:hsl(${(t.name.length * 47) % 360} 70% 60%)"></span>
        <span class="tn">${esc(t.name)}</span>
        <span class="tc">${t.count} 部</span>
      </a>`).join('');
    const c = $('#tag-count');
    if (c) c.textContent = `共 ${tags.length} 个标签`;
  }

  function initCompanies() {
    const list = allCompanies();
    const host = $('#company-list');
    host.innerHTML = list.map((c) => {
      const games = GAMES.filter((g) => g.circle === c.name);
      const hue = (c.name.length * 61) % 360;
      return `<a class="tile" href="galgame.html?company=${encodeURIComponent(c.name)}">
          <span class="dot" style="background:hsl(${hue} 65% 58%)"></span>
          <span class="tn">${esc(c.name)}</span>
          <span class="tc">${c.count} 部</span>
        </a>`;
    }).join('');
    const c = $('#company-count');
    if (c) c.textContent = `共 ${list.length} 家会社`;
    const top = $('#company-top');
    if (top) top.innerHTML = list.slice(0, 4).map((c) => {
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

  function initResources() {
    const params = new URLSearchParams(location.search);
    const state = { cat: params.get('cat') || '', q: params.get('q') || '' };
    const list = $('#res-list');
    const count = $('#res-count');
    const input = $('#res-search');
    input.value = state.q;

    const cats = countValues(POSTS, (p) => p.category)
      .map((c) => ({ name: c.name }));

    renderChips($('#res-cats'), {
      options: cats, active: state.cat, label: '类型：',
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
      $('#res-empty').style.display = items.length ? 'none' : 'block';
      count.textContent = `共 ${items.length} 条`;
    }
    input.addEventListener('input', () => { state.q = input.value; refresh(); });
    refresh();
  }

  function initPost() {
    const id = new URLSearchParams(location.search).get('id');
    const p = getPost(id) || POSTS[0];
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
      </div>`;
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
  function init() {
    const page = document.body.dataset.page || '';
    renderHeader(page);
    renderFooter();
    const routes = {
      home: initHome,
      galgame: initLibrary,
      detail: initDetail,
      tag: initTags,
      company: initCompanies,
      resource: initResources,
      post: initPost,
      doc: initDoc,
    };
    (routes[page] || function () {})();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
