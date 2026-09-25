/* ==========================================================================
   公共逻辑：导航、页脚、卡片渲染、搜索筛选
   依赖 data.js（需先引入）
   ========================================================================== */

(function () {
  const DATA = window.SITE_DATA;
  const GAMES = DATA.games;
  const POSTS = DATA.posts;
  const SITE = DATA.site;

  /* ------------------------- 基础工具 ------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // HTML 转义，防止数据里的尖括号破坏页面
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${y}/${m}/${d}`;
  }

  const byId = (list, id) => list.find((it) => it.id === id) || null;
  const getGame = (id) => byId(GAMES, id);
  const getPost = (id) => byId(POSTS, id);
  const postsOfGame = (gameId) => POSTS.filter((p) => p.gameId === gameId);

  // 全部标签，按出现次数排序
  function allTags() {
    const count = new Map();
    GAMES.forEach((g) => g.tags.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }

  /* ------------------------- 顶栏 / 页脚 ------------------------- */
  const NAV = [
    { href: 'index.html', text: '首页', key: 'home' },
    { href: 'library.html', text: '资源库', key: 'library' },
    { href: 'guides.html', text: '攻略资讯', key: 'guides' },
    { href: 'about.html', text: '关于', key: 'about' },
  ];

  function renderHeader(active) {
    const host = $('#site-header');
    if (!host) return;
    host.className = 'site-header';
    host.innerHTML = `
      <div class="container">
        <a class="logo" href="index.html">${esc(SITE.name)}</a>
        <nav class="nav">
          ${NAV.map((n) => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.text}</a>`).join('')}
        </nav>
      </div>`;
  }

  function renderFooter() {
    const host = $('#site-footer');
    if (!host) return;
    const year = new Date().getFullYear();
    host.className = 'site-footer';
    host.innerHTML = `
      <div class="container">
        <span>© ${SITE.since}–${year} ${esc(SITE.name)}</span>
        <span class="muted">本站仅整理公开信息，不提供任何侵权资源；下载链接请自行替换为合法来源。</span>
        <a href="${SITE.repo}" target="_blank" rel="noopener">GitHub 仓库</a>
      </div>`;
  }

  /* ------------------------- 卡片渲染 ------------------------- */
  function coverHtml(game, extraClass = '') {
    const hue = (game.cover && game.cover.hue) || 270;
    const glyph = (game.cover && game.cover.glyph) || game.title.slice(0, 1);
    return `<div class="cover ${extraClass}" style="--h:${hue}">
        <span class="glyph">${esc(glyph)}</span>
        <span class="rating">★ ${game.rating.toFixed(1)}</span>
      </div>`;
  }

  function gameCard(game) {
    return `<a class="card" href="detail.html?id=${encodeURIComponent(game.id)}">
        ${coverHtml(game)}
        <div class="card-body">
          <div class="card-title">${esc(game.title)}</div>
          <div class="card-sub">${esc(game.circle)} · ${fmtDate(game.updatedAt)} 更新</div>
          <div class="tags">${game.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </div>
      </a>`;
  }

  function postItem(post) {
    const game = post.gameId ? getGame(post.gameId) : null;
    return `<a class="post-item" href="guide.html?id=${encodeURIComponent(post.id)}">
        <h3><span class="badge-cat">${esc(post.category)}</span>${esc(post.title)}</h3>
        <p>${esc(post.excerpt)}</p>
        <div class="small muted">${fmtDate(post.date)} · ${esc(post.author)}${game ? ' · 关联：' + esc(game.title) : ''}</div>
      </a>`;
  }

  // 渲染卡片网格；没有结果时在网格下方显示一条空状态提示
  function renderGrid(host, games, emptyText) {
    if (!host) return;
    host.innerHTML = games.map(gameCard).join('');
    const wrap = host.parentElement;
    if (!wrap) return;
    let empty = wrap.querySelector('.empty[data-for="' + host.id + '"]');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty';
      empty.dataset.for = host.id;
      wrap.appendChild(empty);
    }
    empty.textContent = emptyText || '没有符合条件的作品，换个关键词或标签试试。';
    empty.style.display = games.length ? 'none' : 'block';
  }

  /* ------------------------- 搜索 / 筛选 / 排序 ------------------------- */
  function searchGames({ q = '', tag = '', sort = 'updated' } = {}) {
    const kw = q.trim().toLowerCase();
    let list = GAMES.filter((g) => {
      const hitTag = !tag || g.tags.includes(tag);
      if (!hitTag) return false;
      if (!kw) return true;
      const haystack = [g.title, g.originalTitle, g.circle, g.summary, g.tags.join(' '), g.languages.join(' ')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(kw);
    });
    const sorters = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      rating: (a, b) => b.rating - a.rating,
      release: (a, b) => b.releaseDate.localeCompare(a.releaseDate),
      title: (a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'),
    };
    return list.sort(sorters[sort] || sorters.updated);
  }

  // 渲染标签筛选条；点击后回调
  function renderTagChips(host, { activeTag = '', onPick } = {}) {
    if (!host) return;
    const tags = allTags();
    host.innerHTML =
      `<span class="chip ${activeTag ? '' : 'active'}" data-tag="">全部</span>` +
      tags.map((t) => `<span class="chip ${t === activeTag ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)}</span>`).join('');
    host.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('.chip', host).forEach((c) => c.classList.toggle('active', c === chip));
      onPick && onPick(chip.dataset.tag);
    });
  }

  /* ------------------------- 文章正文渲染 ------------------------- */
  function renderBody(blocks) {
    return blocks.map((raw) => {
      if (raw.startsWith('## ')) return `<h2>${esc(raw.slice(3))}</h2>`;
      if (raw.startsWith('- ')) {
        // 连续的 "- " 行合并为一个列表
        return `<ul>${raw.split('\n').map((li) => `<li>${esc(li.replace(/^-\s*/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${esc(raw)}</p>`;
    }).join('');
  }

  /* ------------------------- 页面初始化 ------------------------- */
  function init() {
    const page = document.body.dataset.page || '';
    renderHeader(page);
    renderFooter();

    // 首页：最新更新 + 高分推荐
    if (page === 'home') {
      const latest = searchGames({ sort: 'updated' }).slice(0, 4);
      const top = searchGames({ sort: 'rating' }).slice(0, 4);
      renderGrid($('#latest-grid'), latest);
      renderGrid($('#top-grid'), top);
      const postHost = $('#home-posts');
      if (postHost) postHost.innerHTML = POSTS.slice(0, 3).map(postItem).join('');
      const statGames = $('#stat-games');
      const statPosts = $('#stat-posts');
      if (statGames) statGames.textContent = GAMES.length;
      if (statPosts) statPosts.textContent = POSTS.length;
      const searchForm = $('#home-search');
      if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const q = $('#home-search-input').value.trim();
          location.href = 'library.html' + (q ? '?q=' + encodeURIComponent(q) : '');
        });
      }
    }

    // 资源库
    if (page === 'library') {
      const params = new URLSearchParams(location.search);
      const state = {
        q: params.get('q') || '',
        tag: params.get('tag') || '',
        sort: params.get('sort') || 'updated',
      };
      const input = $('#lib-search');
      const sortSel = $('#lib-sort');
      const grid = $('#lib-grid');
      const count = $('#lib-count');
      if (input) input.value = state.q;
      if (sortSel) sortSel.value = state.sort;

      function refresh() {
        const list = searchGames(state);
        grid.innerHTML = list.map(gameCard).join('');
        if (count) count.textContent = `共 ${list.length} 部作品`;
        const empty = $('#lib-empty');
        if (empty) empty.style.display = list.length ? 'none' : 'block';
        const url = new URLSearchParams();
        if (state.q) url.set('q', state.q);
        if (state.tag) url.set('tag', state.tag);
        if (state.sort !== 'updated') url.set('sort', state.sort);
        history.replaceState(null, '', url.toString() ? '?' + url : location.pathname);
      }

      renderTagChips($('#lib-tags'), {
        activeTag: state.tag,
        onPick: (tag) => { state.tag = tag; refresh(); },
      });
      input && input.addEventListener('input', () => { state.q = input.value; refresh(); });
      sortSel && sortSel.addEventListener('change', () => { state.sort = sortSel.value; refresh(); });
      refresh();
    }

    // 作品详情
    if (page === 'detail') {
      const id = new URLSearchParams(location.search).get('id');
      const game = getGame(id) || GAMES[0];
      const host = $('#detail');
      document.title = `${game.title} - ${SITE.name}`;
      const related = GAMES.filter((g) => g.id !== game.id && g.tags.some((t) => game.tags.includes(t))).slice(0, 4);
      const guides = postsOfGame(game.id);
      host.innerHTML = `
        <div class="crumbs"><a href="index.html">首页</a> / <a href="library.html">资源库</a> / ${esc(game.title)}</div>
        <div class="detail-head">
          <div class="detail-cover">${coverHtml(game)}</div>
          <div>
            <h1>${esc(game.title)}</h1>
            <div class="orig">${esc(game.originalTitle)} · ${esc(game.circle)}</div>
            <div class="tags">${game.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            <div class="meta-list">
              <div><b>评分：</b>★ ${game.rating.toFixed(1)}</div>
              <div><b>发售：</b>${fmtDate(game.releaseDate)}</div>
              <div><b>更新：</b>${fmtDate(game.updatedAt)}</div>
              <div><b>版本：</b>${esc(game.version)}</div>
              <div><b>语言：</b>${esc(game.languages.join(' / '))}</div>
              <div><b>平台：</b>${esc(game.platforms.join(' / '))}</div>
              <div><b>大小：</b>${esc(game.size)}</div>
            </div>
            <a class="btn btn-primary" href="#downloads">前往下载 / 查看版本</a>
          </div>
        </div>

        <div class="panel">
          <h3>作品简介</h3>
          <p class="muted" style="margin:0">${esc(game.summary)}</p>
        </div>

        <div class="panel">
          <h3>截图预览（占位）</h3>
          <div class="shots">
            ${game.screenshots.map((s) => `<div class="shot" style="--h:${(game.cover.hue + 30) % 360}">${esc(s)}</div>`).join('')}
          </div>
        </div>

        <div class="panel" id="downloads">
          <h3>下载 / 版本</h3>
          ${game.downloads.map((d) => `
            <div class="download-row">
              <span class="name">${esc(d.label)}</span>
              <a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">打开链接</a>
              <span class="small muted">提取码：<span class="code">${esc(d.code)}</span></span>
            </div>`).join('')}
          <p class="small muted" style="margin:14px 0 0">以上为占位示例，请在 <code>assets/js/data.js</code> 中替换为你有权分发的地址。</p>
        </div>

        ${guides.length ? `<div class="panel">
          <h3>相关攻略</h3>
          <div class="post-list">${guides.map(postItem).join('')}</div>
        </div>` : ''}

        ${related.length ? `<div class="section">
          <div class="section-head"><h2>相关作品</h2></div>
          <div class="grid">${related.map(gameCard).join('')}</div>
        </div>` : ''}
      `;
    }

    // 攻略 / 资讯列表
    if (page === 'guides') {
      const cats = ['全部', '攻略', '评测', '资讯'];
      const params = new URLSearchParams(location.search);
      let cat = params.get('cat') || '全部';
      let q = params.get('q') || '';
      const input = $('#guide-search');
      const list = $('#guide-list');
      const count = $('#guide-count');
      if (input) input.value = q;

      function refresh() {
        const kw = q.trim().toLowerCase();
        const items = POSTS.filter((p) => {
          const okCat = cat === '全部' || p.category === cat;
          const okKw = !kw || [p.title, p.excerpt, p.tags.join(' ')].join(' ').toLowerCase().includes(kw);
          return okCat && okKw;
        }).sort((a, b) => b.date.localeCompare(a.date));
        list.innerHTML = items.map(postItem).join('');
        if (count) count.textContent = `共 ${items.length} 篇`;
        const empty = $('#guide-empty');
        if (empty) empty.style.display = items.length ? 'none' : 'block';
      }

      renderTagChips($('#guide-cats'), {
        activeTag: cat === '全部' ? '' : cat,
        onPick: (t) => { cat = t || '全部'; refresh(); },
      });
      input && input.addEventListener('input', () => { q = input.value; refresh(); });
      refresh();
    }

    // 文章详情
    if (page === 'guide') {
      const id = new URLSearchParams(location.search).get('id');
      const post = getPost(id) || POSTS[0];
      const game = post.gameId ? getGame(post.gameId) : null;
      document.title = `${post.title} - ${SITE.name}`;
      $('#article').innerHTML = `
        <div class="crumbs"><a href="index.html">首页</a> / <a href="guides.html">攻略资讯</a> / ${esc(post.category)}</div>
        <h1>${esc(post.title)}</h1>
        <div class="post-meta">
          ${fmtDate(post.date)} · ${esc(post.author)} · ${esc(post.tags.join(' / '))}
          ${game ? ` · 关联作品：<a href="detail.html?id=${encodeURIComponent(game.id)}">${esc(game.title)}</a>` : ''}
        </div>
        ${renderBody(post.body)}
      `;
    }
  }

  // 对外暴露，方便后续扩展
  window.SITE = {
    $, $$, esc, fmtDate, getGame, getPost, postsOfGame, gameCard, postItem,
    searchGames, renderGrid, allTags,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
