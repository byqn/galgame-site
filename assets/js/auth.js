/* 登录 / 注册页逻辑 */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (window.SITE && window.SITE.esc) || ((v) => String(v == null ? '' : v));
  const TOKEN_KEY = 'galgame_token';

  let mode = 'login';
  let serverReady = false;

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

  function setMsg(text, kind) {
    const el = $('#auth-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function offlineView() {
    $('#auth-box').innerHTML = `
      <h2 style="margin:0 0 8px;font-size:20px">当前无法注册 / 登录</h2>
      <p class="muted small" style="margin:0 0 16px">
        没有检测到后端接口（<code>api/ping</code> 不可达）。静态托管（如 GitHub Pages）没有服务器，账号功能不可用。
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="index.html">返回首页</a>
        <a class="btn" href="upload.html">上传作品</a>
      </div>`;
  }

  function loggedInView(user) {
    $('#auth-box').innerHTML = `
      <h2 style="margin:0 0 6px;font-size:20px">已登录</h2>
      <p class="muted" style="margin:0 0 18px">当前账号：<b>${esc(user.username)}</b></p>
      <div class="actions">
        <a class="btn btn-primary" href="upload.html">去上传作品</a>
        <a class="btn" href="galgame.html">浏览作品库</a>
        <button class="btn" id="do-logout" type="button">退出登录</button>
      </div>`;
    $('#do-logout').addEventListener('click', async () => {
      try {
        await fetch('api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() } });
      } catch { /* 忽略 */ }
      setToken('');
      location.reload();
    });
  }

  function applyMode() {
    const isLogin = mode === 'login';
    const confirmRow = $('#au-confirm-row');
    if (confirmRow) confirmRow.style.display = isLogin ? 'none' : 'block';
    const btn = $('#au-submit');
    if (btn) btn.textContent = isLogin ? '登录' : '注册并登录';
    const pwd = $('#au-password');
    if (pwd) pwd.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
    document.querySelectorAll('.auth-tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === mode);
    });
  }

  function authView() {
    $('#auth-box').innerHTML = `
      <h2 style="margin:0 0 16px;font-size:20px">账号</h2>
      <div class="auth-tabs">
        <button type="button" data-mode="login">登录</button>
        <button type="button" data-mode="register">注册</button>
      </div>
      <form class="auth-form" id="auth-form" autocomplete="off">
        <label>用户名
          <input type="text" id="au-username" placeholder="3–20 位中文 / 字母 / 数字 / _ / -">
        </label>
        <label>密码
          <input type="password" id="au-password" placeholder="至少 6 位">
        </label>
        <label id="au-confirm-row">确认密码
          <input type="password" id="au-confirm" placeholder="再输入一次">
        </label>
        <div class="auth-msg" id="auth-msg"></div>
        <button class="btn btn-primary" type="submit" id="au-submit">登录</button>
      </form>`;

    document.querySelectorAll('.auth-tabs button').forEach((b) => {
      b.addEventListener('click', () => { mode = b.dataset.mode; applyMode(); setMsg(''); });
    });
    applyMode();
    $('#auth-form').addEventListener('submit', submit);
    $('#au-username').focus();
  }

  async function submit(e) {
    e.preventDefault();
    if (!serverReady) { setMsg('没有可用的后端，无法提交', 'error'); return; }

    const username = $('#au-username').value.trim();
    const password = $('#au-password').value;
    const confirm = $('#au-confirm') ? $('#au-confirm').value : password;

    if (!username) { setMsg('请填写用户名', 'error'); return; }
    if (password.length < 6) { setMsg('密码至少 6 位', 'error'); return; }
    if (mode === 'register' && password !== confirm) { setMsg('两次输入的密码不一致', 'error'); return; }

    const btn = $('#au-submit');
    btn.disabled = true;
    setMsg(mode === 'login' ? '登录中…' : '注册中…', '');

    try {
      const res = await fetch('api/' + (mode === 'login' ? 'login' : 'register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const info = await res.json();
      if (!info.ok) throw new Error(info.error || '操作失败');

      setToken(info.token);
      setMsg(mode === 'login' ? '登录成功，正在跳转…' : '注册成功，正在跳转…', 'ok');
      setTimeout(() => { location.href = 'upload.html'; }, 800);
    } catch (err) {
      setMsg(err.message, 'error');
      btn.disabled = false;
    }
  }

  (async function init() {
    // 1) 后端是否可用
    try {
      const res = await fetch('api/ping', { cache: 'no-store' });
      const info = await res.json();
      serverReady = !!(info && info.ok);
    } catch { serverReady = false; }

    if (!serverReady) { offlineView(); return; }

    // 2) 是否已登录
    const token = getToken();
    if (token) {
      try {
        const res = await fetch('api/me', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
        if (res.ok) {
          const info = await res.json();
          loggedInView(info.user);
          return;
        }
        setToken('');
      } catch { /* 继续走登录页 */ }
    }

    authView();
  })();
})();
