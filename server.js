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
const SOCIAL_PLATFORMS=["twitch","youtube","tiktok","instagram","x","discord","facebook","kick","bluesky","threads","reddit"];
const emptySocials=()=>Object.fromEntries(SOCIAL_PLATFORMS.map(name=>[name,'']));
const mediaKinds=new Set(['background','logo']);
const mediaPath=kind=>path.join(DATA_DIR,'custom-'+kind);
const mediaStatus=()=>({background:fs.existsSync(mediaPath('background')),logo:fs.existsSync(mediaPath('logo'))});
function sniffImage(buf){
  if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255)return 'image/jpeg';
  if(buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
}
function readImage(req){return new Promise((resolve,reject)=>{
  let size=0,tooBig=false;const chunks=[];
  req.on('data',part=>{size+=part.length;if(size>8*1024*1024){tooBig=true;return;}chunks.push(part);});
  req.on('end',()=>tooBig?reject(new Error('Image exceeds 8 MB')):resolve(Buffer.concat(chunks)));
  req.on('error',reject);
});}
function broadcastMedia(){
  const msg='event: assets\ndata: '+JSON.stringify(mediaStatus())+'\n\n';
  for(const client of clients){try{client.write(msg);}catch{clients.delete(client);}}
}
const defaults = {
  channel: 'ArcadeTimeTV', handle: '@ArcadeTimeTV',
  socials:{...emptySocials(),twitch:'@ArcadeTimeTV'},
  subtitle: 'LIVE FROM LEONIDA',
  streamTitle: 'A NEW ERA OF CHAOS',
  startingText: 'THE CITY NEVER SLEEPS',
  brbText: 'GRABBING A CAFECITO',
  endingText: 'SEE YOU ON THE STREETS',
  showGameplayBar: true, showGameplayFooter: true,
  camLabel: 'ARCADE CAM', camSide: 'right',
  theme: 'night',
  showAlert: false, alertTitle: 'BREAKING NEWS', alertText: 'This just in...',
  countdownEnd: null,
  tickerEnabled:true,tickerShowFullScreen:true,tickerMode:'all',tickerSpeed:85,tickerCustom:''
};
let stored={};
try{stored=JSON.parse(fs.readFileSync(SETTINGS_FILE,'utf8'));}catch{}
let settings={...defaults,...stored};
if(stored.socials&&typeof stored.socials==='object'&&!Array.isArray(stored.socials)){
  settings.socials=emptySocials();
  for(const p of SOCIAL_PLATFORMS)if(typeof stored.socials[p]==='string')settings.socials[p]=stored.socials[p].trim().slice(0,100);
}else{
  settings.socials={...emptySocials(),twitch:typeof settings.handle==='string'?settings.handle.trim():''};
}
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
  brbText:90, endingText:90,camLabel:48,alertTitle:50,alertText:130,tickerCustom:6000};
const boolKeys = new Set(['showGameplayBar','showGameplayFooter','showAlert','tickerEnabled','tickerShowFullScreen']);
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
    } else if (k === 'socials') {
      if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid socials');
      const accounts={...next.socials};
      for(const [platform,handle] of Object.entries(v)){
        if(!SOCIAL_PLATFORMS.includes(platform)||typeof handle!=='string')throw new Error('Invalid social platform or handle');
        accounts[platform]=handle.trim().slice(0,100);
      }
      next.socials=accounts;
    } else if(k==='tickerSpeed'){
      if(!Number.isInteger(v)||v<35||v>160)throw new Error('Ticker speed must be 35–160 pixels/second');
      next.tickerSpeed=v;
    } else if(k==='tickerMode'){
      if(!['all','lore','parody'].includes(v))throw new Error('Invalid ticker mode');
      next.tickerMode=v;
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
  '/overlay.css':'overlay.css', '/overlay.js':'overlay.js', '/ticker-data.js':'ticker-data.js',
  '/assets/skyline.svg':'assets/skyline.svg',
  '/assets/palm.svg':'assets/palm.svg',
  '/assets/default-background.webp':'assets/default-background.webp'
};
for(const p of SOCIAL_PLATFORMS)routes['/assets/social/'+p+'.svg']='assets/social/'+p+'.svg';
const types = {html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'application/javascript; charset=utf-8', svg:'image/svg+xml', webp:'image/webp'};
const overlays = new Set(['gameplay','cam','starting','brb','ending','alert','socials','ticker']);
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/version') return respond(res,200,{version:APP_VERSION});
  if (req.method === 'GET' && p === '/api/health') return respond(res,200,{ok:true});
  if (req.method === 'GET' && p === '/api/settings') return respond(res,200,settings);
  if (req.method === 'GET' && p === '/api/assets') return respond(res,200,mediaStatus());
  if(req.method==='GET'&&(p==='/assets/custom/background'||p==='/assets/custom/logo')){
    const kind=p.split('/').pop();
    return fs.readFile(mediaPath(kind),(err,bytes)=>{
      if(err)return respond(res,404,{error:'Image not uploaded'});
      const type=sniffImage(bytes);
      if(!type)return respond(res,404,{error:'Unsupported image'});
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(bytes);
    });
  }
  if((req.method==='POST'||req.method==='DELETE')&&p.startsWith('/api/assets/')){
    const kind=p.slice('/api/assets/'.length);
    if(!mediaKinds.has(kind))return respond(res,404,{error:'Unknown asset'});
    if(!authorized(req)){res.setHeader('WWW-Authenticate','Basic realm="Overlay Admin"');return respond(res,401,{error:'Admin password required'});}
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host&&req.headers.origin!=='https://'+req.headers.host)
      return respond(res,403,{error:'Cross-origin upload blocked'});
    try{
      if(req.method==='DELETE'){
        try{fs.unlinkSync(mediaPath(kind));}catch(e){if(e.code!=='ENOENT')throw e;}
      }else{
        const bytes=await readImage(req);
        if(!sniffImage(bytes))return respond(res,400,{error:'Use PNG, JPEG or WebP'});
        const dest=mediaPath(kind),tmp=dest+'.'+process.pid+'.tmp';
        fs.writeFileSync(tmp,bytes,{mode:0o600});fs.renameSync(tmp,dest);
      }
      broadcastMedia();return respond(res,200,mediaStatus());
    }catch(e){return respond(res,400,{error:e.message});}
  }
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
