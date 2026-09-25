/* 上传作品页逻辑：模式检测 / 封面压缩 / 提交 */
(function () {
  const $ = (s) => document.querySelector(s);
  let coverDataUrl = null;
  let serverMode = false;

  function setMsg(text, kind) {
    const el = $('#form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'error' ? '#f87171' : kind === 'ok' ? '#6ee7b7' : '';
  }

  /* ---------- 模式检测 ----------
     先看地址栏主机名：只有 localhost / 127.0.0.1 才可能是本地服务器。
     真正把关的是服务端（会再次校验 Host 头），前端这里只负责给出提示。 */
  const hostName = location.hostname;
  const isLocalHost = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';

  const READY_TIP = '<b>可以上传。</b>保存后写入本站 <code>data/games.json</code> 与 <code>assets/img/covers/</code>，刷新即可在作品库看到。';

  function setMode(ok, badge, tipHtml, tipOk) {
    serverMode = ok;
    $('#mode-badge').textContent = badge;
    const tip = $('#mode-tip');
    tip.className = 'notice-bar' + (tipOk ? ' ok' : '');
    tip.style.display = 'block';
    tip.innerHTML = tipHtml;
    const btn = $('#submit-btn');
    btn.disabled = !ok;
    btn.textContent = ok ? '保存作品' : '不可上传';
  }

  if (!isLocalHost) {
    const isFile = location.protocol === 'file:';
    setMode(
      false,
      isFile ? '本地文件模式 · 不可上传' : '静态托管模式 · 不可上传',
      isFile
        ? '当前是直接双击打开的本地文件，没有后端可以接收上传。<br>请在项目目录执行 <code>node deploy/serve.js 8080</code>，再访问 <code>http://localhost:8080/upload.html</code>。'
        : '当前站点是静态托管，或通过域名 / 隧道访问，没有可用的上传后端。<br>上传请在本机执行 <code>node deploy/serve.js 8080</code>（或 <code>deploy/start-public.ps1</code>），再访问 <code>http://localhost:8080/upload.html</code>。'
    );
  } else {
    // 地址是 localhost，先放开；再用 ping 校准提示文案
    setMode(true, '本地服务器模式', READY_TIP, true);
    fetch('api/ping', { cache: 'no-store' })
      .then((r) => r.json())
      .then((info) => {
        if (!info || !info.ok) {
          setMode(false, '服务端响应异常 · 不可上传', '服务端返回了异常响应，请确认 <code>deploy/serve.js</code> 是最新版本。');
        } else if (info.local) {
          setMode(true, '本地服务器模式 · 已有 ' + (info.games || 0) + ' 部自定义作品', READY_TIP, true);
        } else {
          setMode(false, '服务器模式 · 非本机访问', '检测到服务器，但当前不是通过 localhost 访问，出于安全考虑上传已禁用。');
        }
      })
      .catch((err) => {
        $('#mode-badge').textContent = '本地模式 · 未检测到上传接口';
        const tip = $('#mode-tip');
        tip.className = 'notice-bar';
        tip.innerHTML = '地址是 localhost，但没有检测到上传接口（<code>api/ping</code> 不可达：'
          + (err && err.message ? err.message : '未知错误')
          + '）。<br>请确认运行的是最新版 <code>deploy/serve.js</code>；提交时服务端会再次校验。';
      });
  }

  /* ---------- 封面：选图 → canvas 压缩成 1100px 宽 JPEG ---------- */
  function fileToJpeg(file, maxW = 1100, quality = 0.86) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / img.naturalWidth);
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
      img.src = url;
    });
  }

  $('#cover-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setMsg('请选择图片文件', 'error'); return; }
    setMsg('正在处理图片…');
    try {
      coverDataUrl = await fileToJpeg(file);
      const img = $('#cover-preview');
      img.src = coverDataUrl;
      img.hidden = false;
      $('#cover-hint').style.display = 'none';
      $('#cover-clear').style.display = 'inline-flex';
      setMsg('封面已就绪', 'ok');
    } catch (err) {
      setMsg('图片处理失败：' + err.message, 'error');
    }
  });

  $('#cover-clear').addEventListener('click', () => {
    coverDataUrl = null;
    $('#cover-input').value = '';
    $('#cover-preview').hidden = true;
    $('#cover-preview').removeAttribute('src');
    $('#cover-hint').style.display = '';
    $('#cover-clear').style.display = 'none';
    setMsg('');
  });

  /* ---------- 游戏文件上传（流式 + 进度条） ---------- */
  let uploadedFile = null;

  function fmtSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / 1048576;
    return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
  }

  function setProgress(ratio) {
    const box = $('#file-progress');
    box.hidden = false;
    $('#fp-fill').style.width = (ratio * 100).toFixed(1) + '%';
    $('#fp-text').textContent = (ratio * 100).toFixed(0) + '%';
  }

  function uploadFileWithProgress(file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/upload-file?name=' + encodeURIComponent(file.name));
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(ev.loaded / ev.total); };
      xhr.onload = () => {
        try {
          const info = JSON.parse(xhr.responseText || '{}');
          if (info.ok) resolve(info.file);
          else reject(new Error(info.error || '上传失败'));
        } catch {
          reject(new Error('服务器响应解析失败'));
        }
      };
      xhr.onerror = () => reject(new Error('网络中断'));
      xhr.send(file);
    });
  }

  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!serverMode) { setMsg('当前不可上传文件', 'error'); return; }

    $('#file-hint').style.display = 'none';
    $('#file-chosen').hidden = false;
    $('#file-chosen').innerHTML = `${file.name} <span class="muted">· ${fmtSize(file.size)}</span>`;
    setProgress(0);
    setMsg('正在上传文件，请勿关闭页面…');

    try {
      uploadedFile = await uploadFileWithProgress(file);
      setProgress(1);
      $('#fp-text').textContent = '已上传 ' + fmtSize(uploadedFile.size);
      $('#file-clear').style.display = 'inline-flex';
      setMsg('文件已上传，访客可直接下载', 'ok');
    } catch (err) {
      uploadedFile = null;
      setMsg('文件上传失败：' + err.message, 'error');
      $('#file-progress').hidden = true;
    }
  });

  $('#file-clear').addEventListener('click', () => {
    uploadedFile = null;
    $('#file-input').value = '';
    $('#file-hint').style.display = '';
    $('#file-chosen').hidden = true;
    $('#file-progress').hidden = true;
    $('#file-clear').style.display = 'none';
    setMsg('');
  });

  /* ---------- 表单收集 ---------- */
  const checkedValues = (sel) =>
    Array.from(document.querySelectorAll(sel + ' input:checked')).map((i) => i.value);

  function collect() {
    const tags = $('#f-tags').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const shots = $('#f-shots').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const downloads = $('#f-downloads').value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((s) => s.trim());
        return { label: parts[0] || '下载', url: parts[1] || '#', code: parts[2] || '—' };
      });

    return {
      title: $('#f-title').value.trim(),
      originalTitle: $('#f-originalTitle').value.trim() || $('#f-title').value.trim(),
      circle: $('#f-circle').value.trim() || '未填写',
      releaseDate: $('#f-releaseDate').value || new Date().toISOString().slice(0, 10),
      rating: Math.min(10, Math.max(0, Number($('#f-rating').value) || 0)),
      version: $('#f-version').value.trim() || 'v1.0',
      size: $('#f-size').value.trim() || '未知',
      tags: tags.length ? tags : ['未分类'],
      platforms: checkedValues('#f-platforms').length ? checkedValues('#f-platforms') : ['PC'],
      languages: checkedValues('#f-languages').length ? checkedValues('#f-languages') : ['官方中文'],
      summary: $('#f-summary').value.trim() || '（暂无简介）',
      screenshots: shots,
      downloads: downloads.length ? downloads : [],
      file: uploadedFile,
    };
  }

  /* ---------- Tab 切换：上传作品 / 发布资源 ---------- */
  function switchTab(tab) {
    const isPost = tab === 'post';
    const gameBox = $('#tab-game');
    const postBox = $('#tab-post');
    if (gameBox) gameBox.hidden = isPost;
    if (postBox) postBox.hidden = !isPost;
    document.querySelectorAll('#upload-tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    if (isPost) fillGameOptions();
  }

  document.querySelectorAll('#upload-tabs button').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  if (location.hash === '#post') switchTab('post');

  /* ---------- 发布资源 / 教程 ---------- */
  function setPostMsg(text, kind) {
    const el = $('#post-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'error' ? '#f87171' : kind === 'ok' ? '#6ee7b7' : '';
  }

  // 关联作品下拉：读取已加载的作品列表
  function fillGameOptions() {
    const sel = $('#p-game');
    if (!sel) return;
    const games = (window.SITE && window.SITE.games) || [];
    sel.innerHTML = '<option value="">不关联</option>' +
      games.map((g) => `<option value="${g.id}">${g.title}</option>`).join('');
  }
  fillGameOptions();

  const postForm = $('#post-form');
  if (postForm) {
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!serverMode) { setPostMsg('当前不可发布，请用本地服务器模式打开', 'error'); return; }

      const post = {
        title: $('#p-title').value.trim(),
        category: $('#p-category').value,
        gameId: $('#p-game').value || null,
        author: $('#p-author').value.trim(),
        tags: $('#p-tags').value,
        excerpt: $('#p-excerpt').value.trim(),
        body: $('#p-body').value,
      };
      if (!post.title) { setPostMsg('标题不能为空', 'error'); $('#p-title').focus(); return; }
      if (!post.body.trim()) { setPostMsg('正文不能为空', 'error'); $('#p-body').focus(); return; }

      const btn = $('#post-submit');
      btn.disabled = true;
      setPostMsg('发布中…');
      try {
        const res = await fetch('api/upload-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post }),
        });
        const info = await res.json();
        if (!info.ok) throw new Error(info.error || '发布失败');
        setPostMsg('发布成功！正在跳转…', 'ok');
        setTimeout(() => { location.href = 'post.html?id=' + encodeURIComponent(info.id); }, 900);
      } catch (err) {
        setPostMsg('发布失败：' + err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  /* ---------- 提交作品 ---------- */
  $('#upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!serverMode) { setMsg('当前不可上传，请用本地服务器模式打开', 'error'); return; }
    const game = collect();
    if (!game.title) { setMsg('作品名不能为空', 'error'); $('#f-title').focus(); return; }

    const btn = $('#submit-btn');
    btn.disabled = true;
    setMsg('保存中…');
    try {
      const res = await fetch('api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, cover: coverDataUrl, file: uploadedFile }),
      });
      const info = await res.json();
      if (!info.ok) throw new Error(info.error || '服务器返回失败');
      setMsg('保存成功！正在跳转到作品页…', 'ok');
      setTimeout(() => { location.href = 'detail.html?id=' + encodeURIComponent(info.id); }, 900);
    } catch (err) {
      setMsg('保存失败：' + err.message, 'error');
      btn.disabled = false;
    }
  });

  $('#reset-btn').addEventListener('click', () => {
    coverDataUrl = null;
    $('#cover-preview').hidden = true;
    $('#cover-hint').style.display = '';
    $('#cover-clear').style.display = 'none';
    setMsg('');
  });
})();
