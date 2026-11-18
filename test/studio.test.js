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
test('ticker has 161 local-event reports with no protagonist news or parody categories',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/ticker-data.js'),'utf8');
  const contents=source.match(/window\.VICE_TICKER_ITEMS\s*=\s*(\[[\s\S]*\]);/);
  assert.ok(contents);
  const entries=JSON.parse(contents[1]);
  assert.equal(entries.length,161);
  assert.equal(entries.filter(e=>e.kind==='leonida').length,121);
  assert.equal(entries.filter(e=>e.kind==='archive').length,40);
  assert.ok(entries.every(item=>['leonida','archive'].includes(item.kind)));
  assert.ok(entries.every(item=>!/(?:\bjason\b|\blucia\b|parody)/i.test(item.label+' '+item.text)));
  assert.equal(new Set(entries.map(item=>item.text)).size,entries.length);
});
test('shuffle-bag displays every headline once per round and avoids adjacent repeats',()=>{
  const {create}=require('../public/ticker-shuffle');
  const original=Array.from({length:12},(_,i)=>({text:'story '+i}));
  let seed=1729;
  const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const queue=create(original,rng);
  const rounds=Array.from({length:4},()=>Array.from({length:12},()=>queue.next()));
  for(const round of rounds){
    assert.equal(new Set(round).size,12);
    assert.deepEqual(new Set(round),new Set(original));
  }
  for(let i=1;i<rounds.length;i++)assert.notEqual(rounds[i][0],rounds[i-1][11]);
  assert.equal(create([]).next(),null);
  const one={text:'single'};const single=create([one]);assert.equal(single.next(),one);assert.equal(single.next(),one);
});

test('native Stinger support and mode persist in studio settings',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const integrations=fs.readFileSync(path.join(__dirname,'../integrations.js'),'utf8');
  const studio=fs.readFileSync(path.join(__dirname,'../studio.js'),'utf8');
  const Dockerfile=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');
  assert.ok(server.includes("transitionMode:'browser'"));
  assert.ok(server.includes("'native','browser'"));
  assert.ok(studio.includes("'transitionMode'"));
  assert.ok(integrations.includes("SetCurrentSceneTransition"));
  assert.ok(integrations.includes("GetSceneTransitionList"));
  assert.ok(Dockerfile.includes('build:stinger'));
});
