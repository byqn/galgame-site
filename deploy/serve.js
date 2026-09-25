/* 极简静态服务器：正确 MIME + UTF-8 charset + 目录索引
   用法：node deploy/serve.js [端口] [站点目录]
   默认端口 8080，默认站点目录为项目根目录 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8080);
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));

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

function serveFile(file, res) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return send(res, 400, '400 Bad Request');
  }

  let target = path.join(ROOT, path.normalize(urlPath));
  if (!target.startsWith(ROOT)) return send(res, 403, '403 Forbidden');
  if (urlPath.endsWith('/')) target = path.join(target, 'index.html');

  fs.stat(target, (err, st) => {
    if (!err && st.isFile()) return serveFile(target, res);
    if (!err && st.isDirectory()) {
      const idx = path.join(target, 'index.html');
      if (fs.existsSync(idx)) return serveFile(idx, res);
    }
    const alt = target + '.html';
    if (fs.existsSync(alt)) return serveFile(alt, res);
    send(res, 404, '<h1 style="font-family:sans-serif">404 Not Found</h1>', 'text/html; charset=utf-8');
  });
}).listen(PORT, () => {
  console.log(`[serve] 站点目录: ${ROOT}`);
  console.log(`[serve] 本机访问: http://localhost:${PORT}`);
});
