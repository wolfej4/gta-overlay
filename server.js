'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const APP_VERSION = require('./package.json').version;

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (ADMIN_PASSWORD.length < 12 || ['SET_A_LONG_RANDOM_PASSWORD','change-me-please','password12345'].includes(ADMIN_PASSWORD)) {
  console.error('Set ADMIN_PASSWORD to a unique password of at least 12 characters before starting.');
  process.exit(1);
}
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
fs.mkdirSync(DATA_DIR, {recursive: true});
const defaults = {
  channel: 'ArcadeTimeTV', handle: '@ArcadeTimeTV',
  subtitle: 'LIVE FROM LEONIDA',
  streamTitle: 'A NEW ERA OF CHAOS',
  startingText: 'THE CITY NEVER SLEEPS',
  brbText: 'GRABBING A CAFECITO',
  endingText: 'SEE YOU ON THE STREETS',
  dispatchTitle: 'VICE CITY DISPATCH',
  location: 'VICE CITY',
  mission: 'Cruising the coast',
  wanted: 0, showMission: true, showLocation: true,
  showGameplayBar: true, showGameplayFooter: true,
  camLabel: 'ARCADE CAM', camSide: 'right',
  theme: 'night',
  showAlert: false, alertTitle: 'BREAKING NEWS', alertText: 'This just in...',
  countdownEnd: null
};
let settings;
try {
  settings = {...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))};
} catch { settings = {...defaults}; }
const clients = new Set();
function broadcast() {
  const payload = `event: settings\ndata: ${JSON.stringify(settings)}\n\n`;
  for (const c of clients) { try { c.write(payload); } catch { clients.delete(c); } }
}
function save(next) {
  settings = next;
  const tmp = SETTINGS_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), {mode: 0o600});
  fs.renameSync(tmp, SETTINGS_FILE);
  broadcast();
}
function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); }
  catch { return false; }
  const idx = decoded.indexOf(':');
  if (idx < 0 || decoded.slice(0, idx) !== 'admin') return false;
  const incoming = Buffer.from(crypto.createHash('sha256').update(decoded.slice(idx + 1)).digest());
  const expected = Buffer.from(crypto.createHash('sha256').update(ADMIN_PASSWORD).digest());
  return crypto.timingSafeEqual(incoming, expected);
}
function respond(res, code, obj) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
}
function getBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0; const parts = [];
    req.on('data', part => {
      bytes += part.length;
      if (bytes > 32768) { reject(new Error('Request too large')); req.destroy(); return; }
      parts.push(part);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
const maxString = {channel:42, handle:42, subtitle:56, streamTitle:72, startingText:90,
  brbText:90, endingText:90, dispatchTitle:52, location:55, mission:88,
  camLabel:48, alertTitle:50, alertText:130};
const boolKeys = new Set(['showMission','showLocation','showGameplayBar','showGameplayFooter','showAlert']);
function patchSettings(obj) {
  if (!obj || Array.isArray(obj) || typeof obj !== 'object') throw new Error('Expected an object');
  const next = {...settings};
  for (const [k,v] of Object.entries(obj)) {
    if (Object.hasOwn(maxString,k)) {
      if (typeof v !== 'string') throw new Error('Invalid ' + k);
      next[k] = v.trim().slice(0,maxString[k]);
    } else if (boolKeys.has(k)) {
      if (typeof v !== 'boolean') throw new Error('Invalid ' + k);
      next[k] = v;
    } else if (k === 'wanted') {
      if (!Number.isInteger(v) || v < 0 || v > 6) throw new Error('Wanted level must be 0–6');
      next[k] = v;
    } else if (k === 'camSide') {
      if (!['left','right'].includes(v)) throw new Error('Invalid camSide');
      next[k] = v;
    } else if (k === 'theme') {
      if (!['night','sunset'].includes(v)) throw new Error('Invalid theme');
      next[k] = v;
    } else throw new Error('Unsupported field: ' + k);
  }
  return next;
}
function file(res, name, type) {
  const abs = path.join(ROOT,name);
  fs.readFile(abs, (err, data) => {
    if (err) {respond(res,404,{error:'Not found'}); return;}
    res.writeHead(200, {
      'Content-Type':type, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'"
    });
    res.end(data);
  });
}
const routes = {
  '/':'admin.html', '/admin':'admin.html',
  '/admin.css':'admin.css', '/admin.js':'admin.js',
  '/overlay.css':'overlay.css', '/overlay.js':'overlay.js',
  '/assets/skyline.svg':'assets/skyline.svg',
  '/assets/palm.svg':'assets/palm.svg'
};
const types = {html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'application/javascript; charset=utf-8', svg:'image/svg+xml'};
const overlays = new Set(['gameplay','dispatch','cam','starting','brb','ending','alert']);
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/version') return respond(res,200,{version:APP_VERSION});
  if (req.method === 'GET' && p === '/api/health') return respond(res,200,{ok:true});
  if (req.method === 'GET' && p === '/api/settings') return respond(res,200,settings);
  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`event: settings\ndata: ${JSON.stringify(settings)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'POST' && (p === '/api/settings' || p === '/api/countdown')) {
    if (!authorized(req)) {res.setHeader('WWW-Authenticate','Basic realm="Overlay Admin"');return respond(res,401,{error:'Admin password required'});}
    // Restrict web-based cross-origin writes; clients may omit Origin (curl).
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
      return respond(res,403,{error:'Cross-origin updates are not allowed'});
    }
    try {
      const body = await getBody(req);
      if (p === '/api/settings') save(patchSettings(body));
      else {
        if (!body || !Number.isInteger(body.minutes) || body.minutes < 0 || body.minutes > 120) throw new Error('Minutes must be 0–120');
        save({...settings, countdownEnd: body.minutes ? new Date(Date.now()+body.minutes*60000).toISOString() : null});
      }
      return respond(res,200,settings);
    } catch(err) {return respond(res,400,{error: err.message});}
  }
  if (req.method === 'GET' && p.startsWith('/overlay/')) {
    const scene = p.slice('/overlay/'.length);
    if (!overlays.has(scene)) return respond(res,404,{error:'Unknown overlay'});
    return file(res,'overlay.html','text/html; charset=utf-8');
  }
  if (req.method === 'GET' && Object.hasOwn(routes,p)) {
    const name = routes[p];
    return file(res,name,types[name.split('.').pop()] || 'application/octet-stream');
  }
  respond(res,404,{error:'Not found'});
});
const keepAlive = setInterval(() => { for (const c of clients) { try { c.write(': ping\n\n'); } catch { clients.delete(c); } } },25000);
server.listen(PORT,HOST,()=>console.log(`Vice After Dark listening at http://${HOST}:${PORT}  |  Dashboard: /admin`));
function shutdown() { clearInterval(keepAlive); for (const c of clients) c.end(); server.close(()=>process.exit(0)); }
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
