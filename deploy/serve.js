/* 静态服务器 + 本机后端 API
   用法：node deploy/serve.js [端口] [站点目录]
   默认端口 8080，默认站点目录为项目根目录

   API：
     GET  /api/ping          服务状态与是否本机访问
     GET  /api/games         自己上传的作品（data/games.json）
     POST /api/upload        保存作品与封面（仅 localhost）
     POST /api/register      注册
     POST /api/login         登录，返回 token
     POST /api/logout        退出
     GET  /api/me            当前登录用户
     POST /api/upload-file   浏览器直接上传文件（流式，仅 localhost）
     GET  /api/files         已上传文件列表
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || 8080);
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const DATA_DIR = path.join(ROOT, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');
const MAIL_FILE = path.join(DATA_DIR, 'mail.json');
const OUTBOX_FILE = path.join(DATA_DIR, 'mail-outbox.json');
const COVER_DIR = path.join(ROOT, 'assets', 'img', 'covers');
const FILES_DIR = path.join(ROOT, 'files');

const SESSION_DAYS = 30;
const CODE_TTL_MS = 10 * 60 * 1000;    // 验证码有效期 10 分钟
const CODE_COOLDOWN_MS = 60 * 1000;    // 同一邮箱发送间隔 60 秒
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

// 可选依赖：装了 nodemailer 且配置了 SMTP 才发真邮件，否则用「本机验证码模式」
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { nodemailer = null; }
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;   // 单文件上限 4GB
const MAX_JSON_BYTES = 12 * 1024 * 1024;         // JSON 请求体上限（含封面 base64）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.exe': 'application/octet-stream',
  '.pdf': 'application/pdf',
};

/* ------------------------------ 基础工具 ------------------------------ */
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function readJson(file, fallback) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/* 写操作只允许本机：通过 Cloudflare 隧道进来的请求 Host 是隧道域名，会被挡掉 */
function isLocalRequest(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function readBody(req, limit = MAX_JSON_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function toArray(v, fallback) {
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean);
    return arr.length ? arr : fallback;
  }
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  return fallback;
}

/* ------------------------------ 邮件与验证码 ------------------------------ */
function mailMode() {
  const cfg = readJson(MAIL_FILE, null);
  return cfg && cfg.enabled && nodemailer ? 'smtp' : 'local';
}

async function sendMail({ to, subject, text }) {
  const cfg = readJson(MAIL_FILE, null);
  if (cfg && cfg.enabled && nodemailer) {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port) || 465,
      secure: cfg.secure !== false,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({ from: cfg.from || cfg.user, to, subject, text });
    console.log(`[mail] SMTP 已发送 → ${to}`);
    return { sent: true, mode: 'smtp' };
  }
  // 本机模式：写进发件箱并打印到控制台
  const outbox = readJson(OUTBOX_FILE, []);
  outbox.unshift({ to, subject, text, at: new Date().toISOString() });
  writeJson(OUTBOX_FILE, outbox.slice(0, 100));
  console.log(`[mail] 本机模式 → ${to} | ${subject}`);
  console.log('[mail] ' + text.split('\n').filter(Boolean).join(' / '));
  return { sent: false, mode: 'local' };
}

function issueCode(email) {
  const now = Date.now();
  const code = String(crypto.randomInt(100000, 1000000));
  const list = readJson(CODES_FILE, [])
    .filter((c) => c.expires > now)
    .map((c) => ({ ...c, used: true }));   // 同一个邮箱的旧验证码作废
  list.push({ email, code, sentAt: now, expires: now + CODE_TTL_MS, used: false });
  writeJson(CODES_FILE, list);
  return code;
}

function verifyCode(email, code) {
  const now = Date.now();
  const list = readJson(CODES_FILE, []);
  const hit = list.find((c) => c.email === email && c.code === String(code) && !c.used && c.expires > now);
  if (!hit) return false;
  hit.used = true;
  writeJson(CODES_FILE, list.filter((c) => c.expires > now || c === hit));
  return true;
}

function handleSendCode(req, res) {
  return readBody(req).then(async (buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return sendJson(res, 400, { ok: false, error: '邮箱格式不正确' });
    if (findUserByEmail(email)) return sendJson(res, 409, { ok: false, error: '该邮箱已被注册' });

    const now = Date.now();
    const recent = readJson(CODES_FILE, []).find((c) => c.email === email && c.sentAt && now - c.sentAt < CODE_COOLDOWN_MS);
    if (recent) {
      const wait = Math.ceil((CODE_COOLDOWN_MS - (now - recent.sentAt)) / 1000);
      return sendJson(res, 429, { ok: false, error: `发送太频繁，请 ${wait} 秒后再试` });
    }

    const code = issueCode(email);
    let result;
    try {
      result = await sendMail({
        to: email,
        subject: '【小萝莉の资源站】注册验证码',
        text: `你的注册验证码是 ${code}，10 分钟内有效。\n如果不是你本人操作，请忽略这封邮件。`,
      });
    } catch (e) {
      console.error('[mail] 发送失败:', e.message);
      return sendJson(res, 500, { ok: false, error: '邮件发送失败：' + e.message });
    }

    const payload = { ok: true, mode: result.mode, expiresIn: CODE_TTL_MS / 1000 };
    // 本机模式且从 localhost 访问时，直接把验证码回传，方便自测
    if (!result.sent && isLocalRequest(req)) payload.devCode = code;
    sendJson(res, 200, payload);
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 忘记密码 ------------------------------ */
function handleResetCode(req, res) {
  return readBody(req).then(async (buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return sendJson(res, 400, { ok: false, error: '邮箱格式不正确' });
    if (!findUserByEmail(email)) return sendJson(res, 404, { ok: false, error: '该邮箱还没有注册过' });

    const now = Date.now();
    const recent = readJson(CODES_FILE, []).find((c) => c.email === email && c.sentAt && now - c.sentAt < CODE_COOLDOWN_MS);
    if (recent) {
      const wait = Math.ceil((CODE_COOLDOWN_MS - (now - recent.sentAt)) / 1000);
      return sendJson(res, 429, { ok: false, error: `发送太频繁，请 ${wait} 秒后再试` });
    }

    const code = issueCode(email);
    let result;
    try {
      result = await sendMail({
        to: email,
        subject: '【小萝莉の资源站】重置密码验证码',
        text: `你的重置密码验证码是 ${code}，10 分钟内有效。\n如果不是你本人操作，请忽略这封邮件。`,
      });
    } catch (e) {
      console.error('[mail] 发送失败:', e.message);
      return sendJson(res, 500, { ok: false, error: '邮件发送失败：' + e.message });
    }

    const payload = { ok: true, mode: result.mode, expiresIn: CODE_TTL_MS / 1000 };
    if (!result.sent && isLocalRequest(req)) payload.devCode = code;
    sendJson(res, 200, payload);
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

function handleResetPassword(req, res) {
  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const password = String(body.password || '');

    if (password.length < 6) return sendJson(res, 400, { ok: false, error: '新密码至少 6 位' });
    if (!code) return sendJson(res, 400, { ok: false, error: '请填写邮箱验证码' });

    const users = readJson(USERS_FILE, []);
    const user = users.find((u) => u.email && u.email.toLowerCase() === email);
    if (!user) return sendJson(res, 404, { ok: false, error: '该邮箱还没有注册过' });
    if (!verifyCode(email, code)) return sendJson(res, 400, { ok: false, error: '验证码错误或已过期' });

    user.salt = crypto.randomBytes(16).toString('hex');
    user.passHash = hashPassword(password, user.salt);
    writeJson(USERS_FILE, users);
    // 重置后让该账号所有旧登录失效
    writeJson(SESSIONS_FILE, readSessions().filter((s) => s.userId !== user.id));

    console.log(`[auth] 重置密码成功：${user.username}`);
    sendJson(res, 200, { ok: true });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 用户与会话 ------------------------------ */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// 用户名或邮箱都能定位到用户
function findUser(identifier) {
  const users = readJson(USERS_FILE, []);
  const key = String(identifier || '').trim().toLowerCase();
  return users.find((u) =>
    u.username.toLowerCase() === key || (u.email && u.email.toLowerCase() === key)
  ) || null;
}

function findUserByEmail(email) {
  const users = readJson(USERS_FILE, []);
  const key = String(email || '').trim().toLowerCase();
  return users.find((u) => u.email && u.email.toLowerCase() === key) || null;
}

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email || null, createdAt: u.createdAt };
}

function handleRegister(req, res) {
  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();

    if (!EMAIL_RE.test(email)) {
      return sendJson(res, 400, { ok: false, error: '请填写有效的邮箱地址' });
    }
    if (!/^[\w\u4e00-\u9fa5-]{3,20}$/.test(username)) {
      return sendJson(res, 400, { ok: false, error: '用户名需为 3–20 位中文、字母、数字、下划线或连字符' });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { ok: false, error: '密码至少 6 位' });
    }
    if (findUser(username)) {
      return sendJson(res, 409, { ok: false, error: '该用户名已被注册' });
    }
    if (findUserByEmail(email)) {
      return sendJson(res, 409, { ok: false, error: '该邮箱已被注册' });
    }
    if (!code) {
      return sendJson(res, 400, { ok: false, error: '请先获取并填写邮箱验证码' });
    }
    if (!verifyCode(email, code)) {
      return sendJson(res, 400, { ok: false, error: '验证码错误或已过期，请重新获取' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: 'u' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
      username,
      email,
      salt,
      passHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    const users = readJson(USERS_FILE, []);
    users.push(user);
    writeJson(USERS_FILE, users);

    const token = createSession(user.id);
    console.log(`[auth] 注册成功：${username}`);
    sendJson(res, 200, { ok: true, token, user: publicUser(user) });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

function handleLogin(req, res) {
  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const user = findUser(username);

    if (!user) return sendJson(res, 401, { ok: false, error: '用户名或密码错误' });
    if (hashPassword(password, user.salt) !== user.passHash) {
      return sendJson(res, 401, { ok: false, error: '用户名或密码错误' });
    }

    const token = createSession(user.id);
    console.log(`[auth] 登录成功：${user.username}`);
    sendJson(res, 200, { ok: true, token, user: publicUser(user) });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

function readSessions() {
  const list = readJson(SESSIONS_FILE, []);
  const now = Date.now();
  return list.filter((s) => s.expires > now);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = readSessions();
  sessions.push({ token, userId, expires: Date.now() + SESSION_DAYS * 864e5 });
  writeJson(SESSIONS_FILE, sessions);
  return token;
}

function getSessionUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const session = readSessions().find((s) => s.token === token);
  if (!session) return null;
  const users = readJson(USERS_FILE, []);
  return users.find((u) => u.id === session.userId) || null;
}

function handleLogout(req, res) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const sessions = readSessions().filter((s) => s.token !== token);
  writeJson(SESSIONS_FILE, sessions);
  sendJson(res, 200, { ok: true });
}

/* ------------------------------ 作品上传 ------------------------------ */
function handleUpload(req, res) {
  if (!isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: '上传接口仅允许通过 localhost 访问' });
  }

  return readBody(req).then((buf) => {
    let payload;
    try { payload = JSON.parse(buf.toString('utf8')); } catch (e) { return sendJson(res, 400, { ok: false, error: '数据解析失败：' + e.message }); }

    const g = (payload && payload.game) || {};
    const title = String(g.title || '').trim();
    if (!title) return sendJson(res, 400, { ok: false, error: '作品名不能为空' });

    const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const today = new Date().toISOString().slice(0, 10);

    const game = {
      id,
      title,
      originalTitle: String(g.originalTitle || title).trim(),
      circle: String(g.circle || '未填写').trim(),
      releaseDate: String(g.releaseDate || today).slice(0, 10),
      updatedAt: today,
      rating: Math.min(10, Math.max(0, Number(g.rating) || 0)),
      views: String(g.views || '0'),
      tags: toArray(g.tags, ['未分类']),
      platforms: toArray(g.platforms, ['PC']),
      languages: toArray(g.languages, ['官方中文']),
      size: String(g.size || '未知').trim(),
      version: String(g.version || 'v1.0').trim(),
      isNew: true,
      cover: { hue: 335, glyph: title.slice(0, 1) },
      summary: String(g.summary || '（暂无简介）').trim(),
      screenshots: toArray(g.screenshots, []),
      downloads: Array.isArray(g.downloads) && g.downloads.length
        ? g.downloads.map((d) => ({
            label: String(d.label || '下载'),
            url: String(d.url || '#'),
            code: String(d.code || '—'),
          }))
        : [],
      file: null,
      uploadedAt: new Date().toISOString(),
    };

    // 附带的本机文件（已在 /api/upload-file 上传过）
    if (payload.file && payload.file.url) {
      game.file = {
        name: String(payload.file.name || '下载文件'),
        size: Number(payload.file.size) || 0,
        url: String(payload.file.url),
      };
    }

    let hasCover = false;
    const cover = payload && payload.cover;
    if (typeof cover === 'string' && cover.startsWith('data:image/')) {
      const base64 = cover.split(',')[1];
      if (base64) {
        try {
          fs.mkdirSync(COVER_DIR, { recursive: true });
          fs.writeFileSync(path.join(COVER_DIR, id + '.jpg'), Buffer.from(base64, 'base64'));
          hasCover = true;
        } catch (e) {
          console.error('[upload] 封面写入失败:', e.message);
        }
      }
    }

    const list = readJson(GAMES_FILE, []);
    list.unshift(game);
    writeJson(GAMES_FILE, list);

    console.log(`[upload] 新增作品「${title}」 id=${id} 封面=${hasCover ? '有' : '无'} 文件=${game.file ? game.file.name : '无'}`);
    sendJson(res, 200, { ok: true, id, hasCover, total: list.length });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 发布资源 / 教程 ------------------------------ */
const POST_CATEGORIES = ['补丁', '教程', '资讯'];

function handleUploadPost(req, res) {
  if (!isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: '发布接口仅允许通过 localhost 访问' });
  }

  return readBody(req).then((buf) => {
    let payload;
    try { payload = JSON.parse(buf.toString('utf8')); } catch (e) { return sendJson(res, 400, { ok: false, error: '数据解析失败：' + e.message }); }

    const p = (payload && payload.post) || {};
    const title = String(p.title || '').trim();
    if (!title) return sendJson(res, 400, { ok: false, error: '标题不能为空' });

    const rawBody = Array.isArray(p.body) ? p.body : String(p.body || '').split('\n');
    const body = rawBody.map((s) => String(s).trim()).filter(Boolean);
    if (!body.length) return sendJson(res, 400, { ok: false, error: '正文不能为空' });

    const post = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title,
      category: POST_CATEGORIES.includes(p.category) ? p.category : '资讯',
      gameId: p.gameId ? String(p.gameId) : null,
      author: String(p.author || '站长').trim() || '站长',
      date: new Date().toISOString().slice(0, 10),
      views: '0',
      tags: toArray(p.tags, [POST_CATEGORIES.includes(p.category) ? p.category : '资讯']),
      excerpt: String(p.excerpt || '').trim() || body[0].replace(/^#+\s*/, '').slice(0, 60),
      body,
    };

    const list = readJson(POSTS_FILE, []);
    list.unshift(post);
    writeJson(POSTS_FILE, list);

    console.log(`[post] 新增资源「${title}」(${post.category}) 总计=${list.length}`);
    sendJson(res, 200, { ok: true, id: post.id, total: list.length });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 评论 ------------------------------ */
function handleGetComments(req, res, query) {
  const type = String(query.get('type') || 'game');
  const id = String(query.get('id') || '');
  if (!id) return sendJson(res, 400, { ok: false, error: '缺少目标 id' });
  const list = readJson(COMMENTS_FILE, [])
    .filter((c) => c.targetType === type && c.targetId === id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  sendJson(res, 200, list);
}

function handleAddComment(req, res) {
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: '请先登录后再评论' });

  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const targetType = String(body.targetType || 'game');
    const targetId = String(body.targetId || '');
    const content = String(body.content || '').trim();

    if (!targetId) return sendJson(res, 400, { ok: false, error: '缺少评论目标' });
    if (content.length < 1 || content.length > 1000) {
      return sendJson(res, 400, { ok: false, error: '评论长度需在 1–1000 字之间' });
    }

    const comment = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      targetType,
      targetId,
      userId: user.id,
      username: user.username,
      content,
      createdAt: new Date().toISOString(),
    };
    const list = readJson(COMMENTS_FILE, []);
    list.push(comment);
    writeJson(COMMENTS_FILE, list);
    console.log(`[comment] ${user.username} 评论了 ${targetType}:${targetId}`);
    sendJson(res, 200, { ok: true, comment });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

function handleDeleteComment(req, res) {
  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const id = String(body.id || '');
    const list = readJson(COMMENTS_FILE, []);
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return sendJson(res, 404, { ok: false, error: '评论不存在' });

    const user = getSessionUser(req);
    const isOwner = user && list[idx].userId === user.id;
    if (!isOwner && !isLocalRequest(req)) {
      return sendJson(res, 403, { ok: false, error: '只能删除自己的评论' });
    }
    list.splice(idx, 1);
    writeJson(COMMENTS_FILE, list);
    sendJson(res, 200, { ok: true });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 数据导入 ------------------------------ */
function normalizeImported(item, kind) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  if (!title) return null;
  const today = new Date().toISOString().slice(0, 10);
  const id = String(item.id || '').trim() ||
    (kind === 'game' ? 'u' : 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  if (kind === 'game') {
    return {
      id, title,
      originalTitle: String(item.originalTitle || title),
      circle: String(item.circle || '未填写'),
      releaseDate: String(item.releaseDate || today).slice(0, 10),
      updatedAt: String(item.updatedAt || today).slice(0, 10),
      rating: Math.min(10, Math.max(0, Number(item.rating) || 0)),
      views: String(item.views || '0'),
      tags: toArray(item.tags, ['未分类']),
      platforms: toArray(item.platforms, ['PC']),
      languages: toArray(item.languages, ['官方中文']),
      size: String(item.size || '未知'),
      version: String(item.version || 'v1.0'),
      isNew: !!item.isNew,
      cover: item.cover && typeof item.cover === 'object'
        ? { hue: Number(item.cover.hue) || 335, glyph: String(item.cover.glyph || title.slice(0, 1)) }
        : { hue: 335, glyph: title.slice(0, 1) },
      summary: String(item.summary || '（暂无简介）'),
      screenshots: toArray(item.screenshots, []),
      downloads: Array.isArray(item.downloads)
        ? item.downloads.map((d) => ({
            label: String(d.label || '下载'), url: String(d.url || '#'), code: String(d.code || '—'),
          }))
        : [],
      file: item.file && item.file.url
        ? { name: String(item.file.name || ''), size: Number(item.file.size) || 0, url: String(item.file.url) }
        : null,
      uploadedAt: String(item.uploadedAt || new Date().toISOString()),
    };
  }

  const body = Array.isArray(item.body)
    ? item.body.map((s) => String(s).trim()).filter(Boolean)
    : String(item.body || '').split('\n').map((s) => s.trim()).filter(Boolean);

  return {
    id, title,
    category: POST_CATEGORIES.includes(item.category) ? item.category : '资讯',
    gameId: item.gameId ? String(item.gameId) : null,
    author: String(item.author || '站长'),
    date: String(item.date || today).slice(0, 10),
    views: String(item.views || '0'),
    tags: toArray(item.tags, ['资讯']),
    excerpt: String(item.excerpt || ''),
    body,
  };
}

function handleImport(req, res) {
  if (!isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: '导入仅允许通过 localhost 访问' });
  }

  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: 'JSON 解析失败' }); }

    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    const inGames = Array.isArray(body.games) ? body.games : [];
    const inPosts = Array.isArray(body.posts) ? body.posts : [];

    const games = inGames.map((g) => normalizeImported(g, 'game')).filter(Boolean);
    const posts = inPosts.map((p) => normalizeImported(p, 'post')).filter(Boolean);

    if (!games.length && !posts.length) {
      return sendJson(res, 400, { ok: false, error: '文件里没有可导入的作品或资源（每条都要有 title 字段）' });
    }

    let totalGames;
    let totalPosts;
    if (mode === 'replace') {
      writeJson(GAMES_FILE, games);
      writeJson(POSTS_FILE, posts);
      totalGames = games.length;
      totalPosts = posts.length;
    } else {
      const curGames = readJson(GAMES_FILE, []);
      const curPosts = readJson(POSTS_FILE, []);
      const gIds = new Set(curGames.map((g) => g.id));
      const pIds = new Set(curPosts.map((p) => p.id));
      games.forEach((g) => { if (!gIds.has(g.id)) curGames.push(g); });
      posts.forEach((p) => { if (!pIds.has(p.id)) curPosts.push(p); });
      writeJson(GAMES_FILE, curGames);
      writeJson(POSTS_FILE, curPosts);
      totalGames = curGames.length;
      totalPosts = curPosts.length;
    }

    console.log(`[import] ${mode}：作品 +${games.length}，资源 +${posts.length}`);
    sendJson(res, 200, {
      ok: true, mode,
      importedGames: games.length, importedPosts: posts.length,
      games: totalGames, posts: totalPosts,
    });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 管理：编辑 / 删除 ------------------------------ */
function removeFileIfInside(dir, relUrl) {
  try {
    const target = path.join(ROOT, decodeURIComponent(String(relUrl || '')));
    if (target.startsWith(dir) && fs.existsSync(target) && fs.statSync(target).isFile()) {
      fs.unlinkSync(target);
      return true;
    }
  } catch { /* 忽略 */ }
  return false;
}

function handleManage(req, res) {
  if (!isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: '管理接口仅允许通过 localhost 访问' });
  }

  return readBody(req).then((buf) => {
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: '数据格式错误' }); }

    const action = String(body.action || '');
    const id = String(body.id || '');
    const data = body.data || {};

    // ---------- 作品 ----------
    if (action === 'delete-game') {
      const list = readJson(GAMES_FILE, []);
      const idx = list.findIndex((g) => g.id === id);
      if (idx < 0) return sendJson(res, 404, { ok: false, error: '作品不存在' });
      const [removed] = list.splice(idx, 1);
      writeJson(GAMES_FILE, list);
      fs.unlink(path.join(COVER_DIR, removed.id + '.jpg'), () => {});
      if (removed.file && removed.file.url) removeFileIfInside(FILES_DIR, removed.file.url);
      console.log(`[manage] 删除作品「${removed.title}」`);
      return sendJson(res, 200, { ok: true, total: list.length });
    }

    if (action === 'update-game') {
      const list = readJson(GAMES_FILE, []);
      const g = list.find((x) => x.id === id);
      if (!g) return sendJson(res, 404, { ok: false, error: '作品不存在' });

      ['title', 'originalTitle', 'circle', 'version', 'size', 'summary', 'releaseDate', 'views']
        .forEach((k) => { if (data[k] != null) g[k] = String(data[k]).trim(); });
      if (data.rating != null) g.rating = Math.min(10, Math.max(0, Number(data.rating) || 0));
      if (data.tags != null) g.tags = toArray(data.tags, g.tags);
      if (data.platforms != null) g.platforms = toArray(data.platforms, g.platforms);
      if (data.languages != null) g.languages = toArray(data.languages, g.languages);
      if (data.screenshots != null) g.screenshots = toArray(data.screenshots, g.screenshots);
      if (typeof data.isNew === 'boolean') g.isNew = data.isNew;
      if (Array.isArray(data.downloads)) {
        g.downloads = data.downloads
          .filter((d) => d && (d.label || d.url))
          .map((d) => ({
            label: String(d.label || '下载').trim(),
            url: String(d.url || '#').trim(),
            code: String(d.code || '—').trim(),
          }));
      }
      g.updatedAt = new Date().toISOString().slice(0, 10);
      writeJson(GAMES_FILE, list);
      console.log(`[manage] 更新作品「${g.title}」`);
      return sendJson(res, 200, { ok: true });
    }

    // ---------- 资源 / 教程 ----------
    if (action === 'delete-post') {
      const list = readJson(POSTS_FILE, []);
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) return sendJson(res, 404, { ok: false, error: '资源不存在' });
      const [removed] = list.splice(idx, 1);
      writeJson(POSTS_FILE, list);
      console.log(`[manage] 删除资源「${removed.title}」`);
      return sendJson(res, 200, { ok: true, total: list.length });
    }

    if (action === 'update-post') {
      const list = readJson(POSTS_FILE, []);
      const p = list.find((x) => x.id === id);
      if (!p) return sendJson(res, 404, { ok: false, error: '资源不存在' });

      ['title', 'excerpt', 'author'].forEach((k) => { if (data[k] != null) p[k] = String(data[k]).trim(); });
      if (data.category && POST_CATEGORIES.includes(data.category)) p.category = data.category;
      if (data.gameId !== undefined) p.gameId = data.gameId || null;
      if (data.tags != null) p.tags = toArray(data.tags, p.tags);
      if (data.body != null) {
        const lines = (Array.isArray(data.body) ? data.body : String(data.body).split('\n'))
          .map((s) => String(s).trim()).filter(Boolean);
        if (!lines.length) return sendJson(res, 400, { ok: false, error: '正文不能为空' });
        p.body = lines;
      }
      writeJson(POSTS_FILE, list);
      console.log(`[manage] 更新资源「${p.title}」`);
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 400, { ok: false, error: '未知操作：' + action });
  }).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
}

/* ------------------------------ 文件上传（流式） ------------------------------ */
function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  return base || 'file';
}

function handleUploadFile(req, res, query) {
  if (!isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: '文件上传仅允许通过 localhost 访问' });
  }

  const original = safeFileName(query.get('name'));
  const stamp = Date.now().toString(36);
  const stored = `${stamp}-${original}`;
  const fullPath = path.join(FILES_DIR, stored);

  fs.mkdirSync(FILES_DIR, { recursive: true });

  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > MAX_FILE_BYTES) {
    return sendJson(res, 413, { ok: false, error: '文件超过 4GB 上限' });
  }
  if (fs.existsSync(fullPath)) {
    return sendJson(res, 409, { ok: false, error: '同名文件已存在，请改名后重试' });
  }

  let size = 0;
  let aborted = false;
  const out = fs.createWriteStream(fullPath);

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_FILE_BYTES) {
      aborted = true;
      out.destroy();
      fs.unlink(fullPath, () => {});
      sendJson(res, 413, { ok: false, error: '文件超过 4GB 上限' });
      req.destroy();
    }
  });

  req.pipe(out);

  out.on('finish', () => {
    if (aborted) return;
    console.log(`[upload-file] ${stored}  ${(size / 1048576).toFixed(1)} MB`);
    sendJson(res, 200, {
      ok: true,
      file: { name: original, stored, size, url: 'files/' + encodeURIComponent(stored) },
    });
  });

  out.on('error', (e) => {
    if (aborted) return;
    console.error('[upload-file] 写入失败:', e.message);
    sendJson(res, 500, { ok: false, error: '写入失败：' + e.message });
  });
}

function listFiles() {
  try {
    return fs.readdirSync(FILES_DIR)
      .filter((f) => !f.startsWith('.'))
      .map((f) => {
        const st = fs.statSync(path.join(FILES_DIR, f));
        return { stored: f, size: st.size, mtime: st.mtimeMs, url: 'files/' + encodeURIComponent(f) };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

/* ------------------------------ 静态文件 ------------------------------ */
function serveStatic(req, res, urlPath) {
  let target = path.join(ROOT, path.normalize(urlPath));
  if (!target.startsWith(ROOT)) return send(res, 403, '403 Forbidden');
  if (urlPath.endsWith('/')) target = path.join(target, 'index.html');

  fs.stat(target, (err, st) => {
    if (!err && st.isFile()) return streamFile(target, res, req);
    if (!err && st.isDirectory()) {
      const idx = path.join(target, 'index.html');
      if (fs.existsSync(idx)) return streamFile(idx, res, req);
    }
    const alt = target + '.html';
    if (fs.existsSync(alt)) return streamFile(alt, res, req);
    send(res, 404, '<h1 style="font-family:sans-serif">404 Not Found</h1>', MIME['.html']);
  });
}

function streamFile(file, res, req) {
  const ext = path.extname(file).toLowerCase();
  const size = fs.statSync(file).size;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  };

  // files/ 目录下的文件一律强制下载并支持断点续传；常见的压缩包同样处理
  const isDownloadable = file.startsWith(FILES_DIR) || ['.zip', '.7z', '.rar', '.exe', '.pdf'].includes(ext);
  if (isDownloadable) {
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`;
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : size - 1;
        if (start < size) {
          res.writeHead(206, {
            ...headers,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': end - start + 1,
          });
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
      }
    }
  }

  headers['Content-Length'] = size;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------ 服务器 ------------------------------ */
http.createServer((req, res) => {
  let urlPath;
  let query;
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    urlPath = decodeURIComponent(u.pathname);
    query = u.searchParams;
  } catch {
    return send(res, 400, '400 Bad Request');
  }

  // ---------- API ----------
  if (urlPath === '/api/ping') {
    return sendJson(res, 200, {
      ok: true,
      mode: 'server',
      local: isLocalRequest(req),
      games: readJson(GAMES_FILE, []).length,
      posts: readJson(POSTS_FILE, []).length,
      users: readJson(USERS_FILE, []).length,
      files: listFiles().length,
      mail: mailMode(),
    });
  }
  if (urlPath === '/api/games' && req.method === 'GET') {
    return sendJson(res, 200, readJson(GAMES_FILE, []));
  }
  if (urlPath === '/api/posts' && req.method === 'GET') {
    return sendJson(res, 200, readJson(POSTS_FILE, []));
  }
  if (urlPath === '/api/upload-post' && req.method === 'POST') {
    return handleUploadPost(req, res).catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
  }
  if (urlPath === '/api/manage' && req.method === 'POST') {
    return handleManage(req, res);
  }
  if (urlPath === '/api/comments' && req.method === 'GET') {
    return handleGetComments(req, res, query);
  }
  if (urlPath === '/api/comment' && req.method === 'POST') {
    return handleAddComment(req, res);
  }
  if (urlPath === '/api/comment-delete' && req.method === 'POST') {
    return handleDeleteComment(req, res);
  }
  if (urlPath === '/api/import' && req.method === 'POST') {
    return handleImport(req, res);
  }
  if (urlPath === '/api/files' && req.method === 'GET') {
    return sendJson(res, 200, listFiles());
  }
  if (urlPath === '/api/send-code' && req.method === 'POST') {
    return handleSendCode(req, res);
  }
  if (urlPath === '/api/reset-code' && req.method === 'POST') {
    return handleResetCode(req, res);
  }
  if (urlPath === '/api/reset-password' && req.method === 'POST') {
    return handleResetPassword(req, res);
  }
  if (urlPath === '/api/register' && req.method === 'POST') {
    return handleRegister(req, res).catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
  }
  if (urlPath === '/api/login' && req.method === 'POST') {
    return handleLogin(req, res).catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
  }
  if (urlPath === '/api/logout' && req.method === 'POST') {
    return handleLogout(req, res);
  }
  if (urlPath === '/api/me' && req.method === 'GET') {
    const user = getSessionUser(req);
    return user
      ? sendJson(res, 200, { ok: true, user: publicUser(user) })
      : sendJson(res, 401, { ok: false, error: '未登录或登录已过期' });
  }
  if (urlPath === '/api/upload' && req.method === 'POST') {
    return handleUpload(req, res).catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
  }
  if (urlPath === '/api/upload-file' && req.method === 'POST') {
    return handleUploadFile(req, res, query);
  }

  // ---------- 静态文件 ----------
  serveStatic(req, res, urlPath);
}).listen(PORT, () => {
  console.log(`[serve] 站点目录: ${ROOT}`);
  console.log(`[serve] 本机访问: http://localhost:${PORT}`);
  console.log('[serve] 作品上传 / 账号注册登录 / 大文件上传下载 已启用（写操作仅限 localhost）');
});
