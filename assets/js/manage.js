/* 内容管理：列出自己上传的作品与资源，支持编辑与删除 */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (window.SITE && window.SITE.esc) || ((v) => String(v == null ? '' : v));

  let serverMode = false;
  let games = [];
  let posts = [];
  let tab = 'games';

  function tip(html, ok) {
    const el = $('#mg-tip');
    if (!el) return;
    if (!html) { el.style.display = 'none'; return; }
    el.className = 'notice-bar' + (ok ? ' ok' : '');
    el.style.display = 'block';
    el.innerHTML = html;
  }

  async function load() {
    try {
      const [g, p] = await Promise.all([
        fetch('api/games', { cache: 'no-store' }).then((r) => r.json()),
        fetch('api/posts', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      games = Array.isArray(g) ? g : [];
      posts = Array.isArray(p) ? p : [];
      serverMode = true;
    } catch {
      serverMode = false;
    }
  }

  function row(item) {
    const isGame = tab === 'games';
    const meta = isGame
      ? `${esc(item.circle || '未填写')} · ★ ${Number(item.rating || 0).toFixed(1)} · ${esc(item.version || '')}`
      : `${esc(item.category || '')} · ${esc(item.author || '')}`;
    const when = item.updatedAt || item.date || '';
    const hasFile = isGame && item.file;
    return `<div class="manage-row">
        <div style="flex:1;min-width:200px">
          <div class="li-title">${esc(item.title)}${hasFile ? ' <span class="badge green">含文件</span>' : ''}</div>
          <div class="li-meta">${meta} · 更新于 ${esc(when)}</div>
        </div>
        <a class="btn" href="${isGame ? 'detail.html?id=' : 'post.html?id='}${encodeURIComponent(item.id)}" target="_blank" rel="noopener">查看</a>
        <button class="btn" type="button" data-edit="${esc(item.id)}">编辑</button>
        <button class="btn btn-danger" type="button" data-del="${esc(item.id)}">删除</button>
      </div>`;
  }

  function renderList() {
    const host = $('#mg-list');
    const count = $('#mg-count');

    if (!serverMode) {
      host.innerHTML = '<div class="empty">当前不是本地服务器模式，管理功能不可用。<br><small>请在项目目录执行 <code>node deploy/serve.js 8080</code> 后访问 <code>http://localhost:8080/manage.html</code>。</small></div>';
      count.textContent = '—';
      return;
    }

    const list = tab === 'games' ? games : posts;
    count.textContent = tab === 'games' ? `共 ${games.length} 部作品` : `共 ${posts.length} 条资源`;

    if (!list.length) {
      host.innerHTML = `<div class="empty">还没有${tab === 'games' ? '作品' : '资源'}。<a href="upload.html${tab === 'posts' ? '#post' : ''}" style="color:#ffd6e4">去添加 →</a></div>`;
      return;
    }
    host.innerHTML = list.map(row).join('');
  }

  /* ---------- 删除 ---------- */
  async function del(id) {
    const item = (tab === 'games' ? games : posts).find((x) => x.id === id);
    if (!item) return;
    if (!confirm(`确定删除「${item.title}」吗？\n\n作品会连同封面与已上传的文件一起删除，此操作不可撤销。`)) return;

    try {
      const res = await fetch('api/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: tab === 'games' ? 'delete-game' : 'delete-post', id }),
      });
      const info = await res.json();
      if (!info.ok) throw new Error(info.error || '删除失败');
      tip(`已删除「${esc(item.title)}」`, true);
      await load();
      renderList();
    } catch (err) {
      tip('删除失败：' + esc(err.message), false);
    }
  }

  /* ---------- 编辑 ---------- */
  const field = (label, id, value, type) => `
    <label>${label}${type === 'area'
      ? `<textarea id="${id}" rows="4">${esc(value)}</textarea>`
      : `<input type="text" id="${id}" value="${esc(value)}">`}
    </label>`;

  function openEditor(item) {
    const isGame = tab === 'games';
    const old = $('#mg-modal');
    if (old) old.remove();

    const body = isGame
      ? `<div class="field-row">${field('作品名', 'e-title', item.title)}${field('原题', 'e-originalTitle', item.originalTitle)}</div>
         <div class="field-row">${field('会社', 'e-circle', item.circle)}${field('发售日期', 'e-releaseDate', item.releaseDate)}</div>
         <div class="field-row">${field('评分（0-10）', 'e-rating', item.rating)}${field('版本', 'e-version', item.version)}${field('大小', 'e-size', item.size)}</div>
         <div class="field-row">${field('标签（逗号分隔）', 'e-tags', (item.tags || []).join(', '))}</div>
         <div class="field-row">${field('平台（逗号分隔）', 'e-platforms', (item.platforms || []).join(', '))}${field('语言（逗号分隔）', 'e-languages', (item.languages || []).join(', '))}</div>
         <div class="field-row full">${field('简介', 'e-summary', item.summary, 'area')}</div>
         <div class="field-row full">${field('截图场景名（逗号分隔）', 'e-screenshots', (item.screenshots || []).join(', '))}</div>
         <div class="field-row full">${field('下载链接（每行一条：名称 | 链接 | 提取码）', 'e-downloads', (item.downloads || []).map((d) => `${d.label} | ${d.url} | ${d.code}`).join('\n'), 'area')}</div>`
      : `<div class="field-row">${field('标题', 'e-title', item.title)}${field('作者', 'e-author', item.author)}</div>
         <div class="field-row">${field('分类（补丁 / 教程 / 资讯）', 'e-category', item.category)}${field('标签（逗号分隔）', 'e-tags', (item.tags || []).join(', '))}</div>
         <div class="field-row full">${field('摘要', 'e-excerpt', item.excerpt)}</div>
         <div class="field-row full">${field('正文（## 小标题、- 列表项）', 'e-body', (item.body || []).join('\n'), 'area')}</div>`;

    const mask = document.createElement('div');
    mask.id = 'mg-modal';
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal modal-wide" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="关闭">×</button>
        <h3 style="text-align:left;margin:0 0 18px">编辑${isGame ? '作品' : '资源'}</h3>
        <form class="upload-form" id="mg-form" autocomplete="off">
          <div class="field-col">${body}
            <div class="upload-actions">
              <button class="btn btn-primary" type="submit" id="e-save">保存</button>
              <button class="btn" type="button" id="e-cancel">取消</button>
              <span class="small muted" id="e-msg"></span>
            </div>
          </div>
        </form>
      </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    const close = () => { mask.classList.remove('show'); setTimeout(() => mask.remove(), 220); };
    mask.addEventListener('click', (e) => { if (e.target === mask || e.target.closest('.modal-close')) close(); });
    $('#e-cancel').addEventListener('click', close);

    $('#mg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
      const msg = $('#e-msg');
      const save = $('#e-save');

      const data = isGame
        ? {
            title: val('e-title'), originalTitle: val('e-originalTitle'), circle: val('e-circle'),
            releaseDate: val('e-releaseDate'), rating: val('e-rating'), version: val('e-version'),
            size: val('e-size'), tags: val('e-tags'), platforms: val('e-platforms'),
            languages: val('e-languages'), summary: val('e-summary'), screenshots: val('e-screenshots'),
            downloads: val('e-downloads').split('\n').filter(Boolean).map((line) => {
              const p = line.split('|').map((s) => s.trim());
              return { label: p[0] || '下载', url: p[1] || '#', code: p[2] || '—' };
            }),
          }
        : {
            title: val('e-title'), author: val('e-author'), category: val('e-category'),
            tags: val('e-tags'), excerpt: val('e-excerpt'), body: val('e-body'),
          };

      if (!data.title) { msg.textContent = '标题不能为空'; msg.style.color = '#f87171'; return; }

      save.disabled = true;
      msg.textContent = '保存中…';
      msg.style.color = '';
      try {
        const res = await fetch('api/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: isGame ? 'update-game' : 'update-post', id: item.id, data }),
        });
        const info = await res.json();
        if (!info.ok) throw new Error(info.error || '保存失败');
        msg.textContent = '已保存 ✓';
        msg.style.color = '#6ee7b7';
        await load();
        renderList();
        setTimeout(close, 700);
      } catch (err) {
        msg.textContent = '保存失败：' + err.message;
        msg.style.color = '#f87171';
        save.disabled = false;
      }
    });
  }

  /* ---------- 导出 / 导入 ---------- */
  async function exportJson() {
    const msg = $('#mg-io-msg');
    msg.textContent = '导出中…';
    msg.style.color = '';
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        site: '小萝莉の资源站',
        games,
        posts,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'galgame-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      msg.textContent = `已导出 ${games.length} 部作品、${posts.length} 条资源`;
      msg.style.color = '#6ee7b7';
    } catch (err) {
      msg.textContent = '导出失败：' + err.message;
      msg.style.color = '#f87171';
    }
  }

  async function importJson(file) {
    const msg = $('#mg-io-msg');
    msg.textContent = '导入中…';
    msg.style.color = '';
    try {
      const data = JSON.parse(await file.text());
      const gCount = Array.isArray(data.games) ? data.games.length : 0;
      const pCount = Array.isArray(data.posts) ? data.posts.length : 0;

      const merge = confirm(
        `文件里有 ${gCount} 部作品、${pCount} 条资源。\n\n` +
        '点「确定」= 合并（保留现有内容，只追加新条目）\n' +
        '点「取消」= 覆盖（清空现有内容后导入）'
      );

      const res = await fetch('api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: merge ? 'merge' : 'replace', games: data.games || [], posts: data.posts || [] }),
      });
      const info = await res.json();
      if (!info.ok) throw new Error(info.error || '导入失败');
      msg.textContent = `导入成功（${info.mode === 'replace' ? '覆盖' : '合并'}）：现有作品 ${info.games} 部、资源 ${info.posts} 条`;
      msg.style.color = '#6ee7b7';
      await load();
      renderList();
    } catch (err) {
      msg.textContent = '导入失败：' + err.message;
      msg.style.color = '#f87171';
    }
  }

  const exportBtn = $('#mg-export');
  if (exportBtn) exportBtn.addEventListener('click', exportJson);
  const importBtn = $('#mg-import-btn');
  const importFile = $('#mg-import-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = '';
    });
  }

  /* ---------- 事件 ---------- */
  document.querySelectorAll('#mg-tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      document.querySelectorAll('#mg-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      tip('');
      renderList();
    });
  });

  $('#mg-list').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) { del(delBtn.dataset.del); return; }
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const item = (tab === 'games' ? games : posts).find((x) => x.id === editBtn.dataset.edit);
      if (item) openEditor(item);
    }
  });

  (async function init() {
    await load();
    if (serverMode) {
      tip('管理的是你自己上传的内容（<code>data/games.json</code> 与 <code>data/posts.json</code>）。删除作品会一并删掉封面与站内文件。', true);
    }
    renderList();
  })();
})();
