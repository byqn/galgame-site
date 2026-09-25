/* 静态服务器 + 本地上传 API
   用法：node deploy/serve.js [端口] [站点目录]
   默认端口 8080，默认站点目录为项目根目录

   API：
     GET  /api/ping    检测服务与是否为本机访问
     GET  /api/games   返回 data/games.json（自己上传的作品）
     POST /api/upload  保存作品与封面（仅允许 localhost 访问）
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8080);
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const DATA_DIR = path.join(ROOT, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const COVER_DIR = path.join(ROOT, 'assets', 'img', 'covers');

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
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/* 写操作只允许从本机 localhost 发起：
   通过 Cloudflare 隧道进来的请求，Host 头是隧道域名，会被这里挡掉 */
function isLocalRequest(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体超过 12MB 限制'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readGames() {
  try {
    const list = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeGames(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(GAMES_FILE, JSON.stringify(list, null, 2), 'utf8');
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

async function handleUpload(req, res) {
  if (!isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: '上传接口仅允许通过 localhost 访问' });
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req)).toString('utf8'));
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: '数据解析失败：' + e.message });
  }

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
    cover: { hue: 270, glyph: title.slice(0, 1) },
    summary: String(g.summary || '（暂无简介）').trim(),
    screenshots: toArray(g.screenshots, []),
    downloads: Array.isArray(g.downloads) && g.downloads.length
      ? g.downloads.map((d) => ({
          label: String(d.label || '下载'),
          url: String(d.url || '#'),
          code: String(d.code || '—'),
        }))
      : [{ label: '待补充', url: '#', code: '—' }],
    uploadedAt: new Date().toISOString(),
  };

  // 保存封面（前端已压成 1100px 宽的 JPEG dataURL）
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

  const list = readGames();
  list.unshift(game);
  try {
    writeGames(list);
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: '写入 data/games.json 失败：' + e.message });
  }

  console.log(`[upload] 新增作品「${title}」 id=${id} 封面=${hasCover ? '有' : '无'} 总计=${list.length}`);
  sendJson(res, 200, { ok: true, id, hasCover, total: list.length });
}

function serveStatic(req, res, urlPath) {
  let target = path.join(ROOT, path.normalize(urlPath));
  if (!target.startsWith(ROOT)) return send(res, 403, '403 Forbidden');
  if (urlPath.endsWith('/')) target = path.join(target, 'index.html');

  fs.stat(target, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(target).pipe(res);
      return;
    }
    if (!err && st.isDirectory()) {
      const idx = path.join(target, 'index.html');
      if (fs.existsSync(idx)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        fs.createReadStream(idx).pipe(res);
        return;
      }
    }
    const alt = target + '.html';
    if (fs.existsSync(alt)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      fs.createReadStream(alt).pipe(res);
      return;
    }
    send(res, 404, '<h1 style="font-family:sans-serif">404 Not Found</h1>', MIME['.html']);
  });
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    return send(res, 400, '400 Bad Request');
  }

  // ---------- API ----------
  if (urlPath === '/api/ping') {
    return sendJson(res, 200, { ok: true, mode: 'server', local: isLocalRequest(req), games: readGames().length });
  }
  if (urlPath === '/api/games' && req.method === 'GET') {
    return sendJson(res, 200, readGames());
  }
  if (urlPath === '/api/upload' && req.method === 'POST') {
    return handleUpload(req, res).catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
  }

  // ---------- 静态文件 ----------
  serveStatic(req, res, urlPath);
}).listen(PORT, () => {
  console.log(`[serve] 站点目录: ${ROOT}`);
  console.log(`[serve] 本机访问: http://localhost:${PORT}`);
  console.log('[serve] 上传接口已启用（仅限 localhost）；作品数据写入 data/games.json');
});
