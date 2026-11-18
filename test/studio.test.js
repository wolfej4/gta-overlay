'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

test('local API, scene routes, layouts, presets and backup round trip',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vice-studio-test-'));
  const port=19000+Math.floor(Math.random()*30000);
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.join(__dirname,'..'),
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_PASSWORD:'smoke-test-password-12345',
      TWITCH_CLIENT_ID:'',TWITCH_CLIENT_SECRET:'',TWITCH_REDIRECT_URI:'',OBS_WS_URL:'',OBS_WS_PASSWORD:''},
    stdio:['ignore','pipe','pipe']
  });
  let logs='';child.stderr.on('data',part=>logs+=part.toString());
  t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+port;
  const auth='Basic '+Buffer.from('admin:smoke-test-password-12345').toString('base64');
  async function req(route,method='GET',body,authenticated=true){
    const r=await fetch(base+route,{method,headers:{...(authenticated?{Authorization:auth}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:r.status,data:await r.json().catch(()=>null)};
  }
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Server exited: '+logs);
    try{const r=await req('/api/health');if(r.status===200){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'server became ready: '+logs);
  assert.equal((await req('/api/version')).data.version,require('../package.json').version);
  for(const route of ['/overlay/auto','/overlay/transition','/overlay/twitch-alerts','/overlay/ticker']){
    const r=await fetch(base+route);assert.equal(r.status,200,route);
  }
  assert.equal((await req('/api/studio/state','GET',undefined,false)).status,401);
  assert.equal((await req('/api/integrations/status','GET',undefined,false)).status,401);
  assert.equal((await req('/api/integrations/status')).status,200);
  assert.equal((await req('/api/integrations/scene')).status,200);
  assert.equal((await req('/api/studio/layout','POST',{scene:'gameplay',widgets:{'game-header':{x:120,y:70,w:600,h:100}}})).status,200);
  assert.deepEqual((await req('/api/settings')).data.layouts.gameplay['game-header'],{x:120,y:70,w:600,h:100});
  assert.equal((await req('/api/studio/mappings','POST',{mappings:{'Starting Soon':'starting'}})).status,200);
  assert.equal((await req('/api/settings','POST',{transitionsEnabled:true,transitionStyle:'neon',transitionDuration:1200,twitchAlertsEnabled:true})).status,200);
  assert.equal((await req('/api/studio/presets','POST',{action:'save',name:'My Layout'})).status,200);
  const backup=await req('/api/studio/backup');
  assert.equal(backup.status,200);assert.equal(backup.data.format,'vice-after-dark-backup');
  assert.equal(backup.data.assets.background,null);
  assert.equal(backup.data.presets.length,1);
  assert.equal((await req('/api/studio/layout','POST',{scene:'gameplay',widgets:{}})).status,200);
  assert.equal((await req('/api/studio/restore','POST',backup.data)).status,200);
  assert.equal((await req('/api/settings')).data.layouts.gameplay['game-header'].x,120);
  assert.equal((await req('/api/studio/presets','POST',{action:'apply',name:'My Layout'})).status,200);
  assert.equal((await req('/api/integrations/test-alert','POST')).status,200);
  assert.equal((await req('/api/integrations/test-transition','POST')).status,200);
});
test('ticker contains no parody content and keeps in-universe archives',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/ticker-data.js'),'utf8');
  const contents=source.match(/window\.VICE_TICKER_ITEMS\s*=\s*(\[[\s\S]*\]);/);
  assert.ok(contents);
  const entries=JSON.parse(contents[1]);
  assert.ok(entries.length>90);
  assert.ok(entries.every(item=>['leonida','archive'].includes(item.kind)));
  assert.ok(entries.every(item=>!item.label.includes('PARODY')));
});
