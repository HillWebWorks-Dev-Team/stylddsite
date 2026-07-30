/** Static server for local tenant preview. Use ?subdomain= on tenant HTML pages. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 3456;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(root, normalized.replace(/^\//, ''));
  if (!file.startsWith(root)) return null;
  return file;
}

const server = http.createServer(function (req, res) {
  let urlPath = req.url || '/';
  if (urlPath === '/') urlPath = '/marketing/index.html';

  const file = safePath(urlPath);
  if (!file) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, function () {
  console.log('');
  console.log('Styld local preview — http://127.0.0.1:' + port);
  console.log('');
  console.log('Hair Heaven trial (trialsyldd):');
  console.log('  Book page:  /tenant/book.html?subdomain=trialsyldd');
  console.log('  Home/split: /tenant/profile.html?subdomain=trialsyldd');
  console.log('');
  console.log('Production paths (/book) need `npx vercel dev` for middleware rewrites.');
  console.log('');
});
