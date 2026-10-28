// vMix Ticker LAN 서버 — 의존성 없음 (Node.js 18+)
// 정적 파일 제공 + 상태 저장 + SSE로 모든 창(송출/조작/다른 기기)에 실시간 전달
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 8787;
const PIN = process.env.TICKER_PIN || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_BODY = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

let state = null;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (e) { /* 첫 실행 */ }
let seq = Math.max(Date.now(), (state && state.seq) || 0);
const clients = new Set();

let saveTimer;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdir(DATA_DIR, { recursive: true }, () => {
      fs.writeFile(STATE_FILE, JSON.stringify(state), (err) => {
        if (err) console.error('상태 저장 실패:', err.message);
      });
    });
  }, 300);
}

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}/`);
    }
  }
  return urls;
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/state' && req.method === 'GET') return sendJson(res, 200, state);

  if (pathname === '/api/state' && req.method === 'POST') {
    if (PIN && decodeURIComponent(req.headers['x-ticker-pin'] || '') !== PIN) return sendJson(res, 401, { error: 'pin' });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return sendJson(res, 400, { error: 'bad body' });
    }
    if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || typeof body.style !== 'object') {
      return sendJson(res, 400, { error: 'bad state' });
    }
    state = { ...body, seq: ++seq };
    const line = `data: ${JSON.stringify(state)}\n\n`;
    for (const c of clients) c.write(line);
    saveState();
    return sendJson(res, 200, state);
  }

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write('retry: 1500\n\n');
    if (state) res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (pathname === '/api/info') return sendJson(res, 200, { urls: lanUrls(), pin: !!PIN });

  sendJson(res, 404, { error: 'not found' });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch((e) => sendJson(res, 500, { error: e.message }));
  } else {
    serveStatic(req, res, pathname);
  }
});

// 프록시/방화벽이 유휴 연결을 끊지 않도록
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15000);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n포트 ${PORT}가 이미 사용 중입니다. 이미 실행 중인 서버 창이 있는지 확인하세요.`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const local = `http://localhost:${PORT}/`;
  console.log('\n  vMix Ticker 서버 실행 중');
  console.log(`  조작 화면 : ${local}`);
  console.log(`  송출 화면 : ${local}output.html`);
  for (const u of lanUrls()) console.log(`  다른 기기 : ${u}`);
  console.log(PIN ? '  PIN 보호 : 켜짐' : '  PIN 보호 : 꺼짐 (같은 네트워크의 누구나 조작 가능)');
  console.log('\n  이 창을 닫으면 서버가 꺼집니다.\n');
  if (process.argv.includes('--open') && process.platform === 'win32') exec(`start "" "${local}"`);
});
