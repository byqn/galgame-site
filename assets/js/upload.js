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
      downloads: downloads.length ? downloads : [{ label: '待补充', url: '#', code: '—' }],
    };
  }

  /* ---------- 提交 ---------- */
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
        body: JSON.stringify({ game, cover: coverDataUrl }),
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
