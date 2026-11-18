'use strict';
const fs=require('node:fs');
const path=require('node:path');

module.exports=function createStudio({dataDir,getSettings,save,patchSettings,authorized,respond,emit}){
  const presetPath=path.join(dataDir,'presets.json');
  const sceneNames=new Set(['gameplay','cam','alert','starting','brb','ending','socials','ticker','auto','twitch-alerts']);
  const widgetNames=new Set(['game-header','game-footer','topline','hero','countdown-box','bottomline','ticker-shell','cam','alert','socials-only','twitch-alert-card']);
  const editableKeys=new Set(['channel','handle','subtitle','streamTitle','startingText','brbText','endingText','showGameplayBar','showGameplayFooter','camLabel','camSide','theme','showAlert','alertTitle','alertText','socials','tickerEnabled','tickerShowFullScreen','tickerMode','tickerSpeed','tickerCustom','transitionsEnabled','transitionMode','transitionStyle','transitionDuration','obsSyncEnabled','twitchAlertsEnabled']);
  let presets=[];
  try{const raw=JSON.parse(fs.readFileSync(presetPath,'utf8'));if(Array.isArray(raw))presets=raw.slice(0,20);}catch{}
  function fail(message){throw Error(message);}
  function writeAtomic(file,text){const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,text,{mode:0o600});fs.renameSync(tmp,file);}
  function validMap(map){
    if(!map||typeof map!=='object'||Array.isArray(map))fail('Invalid OBS scene mapping');
    if(Object.keys(map).length>80)fail('Too many OBS scene mappings');
    const next={};
    for(const [scene,mode] of Object.entries(map)){
      if(!scene||scene.length>100||!(sceneNames.has(mode)||mode==='none'))fail('Invalid scene name or mode');
      next[scene]=mode;
    }
    return next;
  }
  function validWidgetMap(map){
    if(!map||typeof map!=='object'||Array.isArray(map))fail('Invalid widget positions');
    const out={};
    if(Object.keys(map).length>20)fail('Too many widgets');
    for(const [key,pos] of Object.entries(map)){
      if(!widgetNames.has(key)||!pos||typeof pos!=='object'||Array.isArray(pos))fail('Invalid widget');
      const {x,y,w,h}=pos;
      if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<60||h<35||x+w>1920||y+h>1080)fail('Widget must fit the 1920×1080 canvas');
      out[key]={x,y,w,h};
    }
    return out;
  }
  function validLayouts(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Invalid layouts');
    const out={};
    for(const [scene,widgets] of Object.entries(raw)){
      if(!sceneNames.has(scene))fail('Unrecognized overlay scene');
      out[scene]=validWidgetMap(widgets);
    }
    return out;
  }
  function cleanSettings(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Invalid settings');
    const ordinary={};
    for(const [key,value] of Object.entries(raw))if(editableKeys.has(key))ordinary[key]=value;
    const next=patchSettings(ordinary);
    if(Object.hasOwn(raw,'layouts'))next.layouts=validLayouts(raw.layouts);
    if(Object.hasOwn(raw,'obsSceneMappings'))next.obsSceneMappings=validMap(raw.obsSceneMappings);
    return next;
  }
  function readJson(req,limit=28*1024*1024){
    return new Promise((resolve,reject)=>{
      const parts=[];let bytes=0,oversized=false;
      req.on('data',part=>{bytes+=part.length;if(bytes>limit){oversized=true;}else parts.push(part);});
      req.on('end',()=>{if(oversized)return reject(Error('Request too large'));try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(Error('Invalid JSON'));}});
      req.on('error',reject);
    });
  }
  function sniff(bytes){
    if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return true;
    if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return true;
    if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return true;
    return false;
  }
  function imageFile(k){return path.join(dataDir,'custom-'+k);}
  function backup(){
    const assets={};
    for(const kind of ['background','logo']){
      let value=null;
      try{const bytes=fs.readFileSync(imageFile(kind));if(bytes.length<=8*1024*1024&&sniff(bytes))value=bytes.toString('base64');}catch{}
      assets[kind]=value;
    }
    return {format:'vice-after-dark-backup',schema:1,createdAt:new Date().toISOString(),settings:getSettings(),presets,assets};
  }
  function replacePresetFile(next){writeAtomic(presetPath,JSON.stringify(next,null,2));presets=next;}
  function metadata(){return presets.map(p=>({name:p.name,createdAt:p.createdAt}));}
  function notifyAssets(){
    emit('assets',{background:fs.existsSync(imageFile('background')),logo:fs.existsSync(imageFile('logo'))});
  }
  function restore(body){
    if(!body||body.format!=='vice-after-dark-backup'||body.schema!==1)fail('Unsupported backup format');
    const settings=cleanSettings(body.settings);
    if(!Array.isArray(body.presets)||body.presets.length>20)fail('Invalid backup presets');
    const nextPresets=body.presets.map(p=>{
      if(typeof p.name!=='string'||!p.name.trim()||p.name.length>48)fail('Invalid preset name');
      return {name:p.name,createdAt:typeof p.createdAt==='string'?p.createdAt:new Date().toISOString(),settings:cleanSettings(p.settings)};
    });
    if(!body.assets||typeof body.assets!=='object')fail('Missing backup images');
    const images={};
    for(const kind of ['background','logo']){
      const base64=body.assets[kind];
      if(base64===null){images[kind]=null;continue;}
      if(typeof base64!=='string'||base64.length>12*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))fail('Invalid backup image');
      const bytes=Buffer.from(base64,'base64');
      if(!sniff(bytes)||bytes.length>8*1024*1024)fail('Unsupported backup image');
      images[kind]=bytes;
    }
    // All external data validated before any files are overwritten.
    replacePresetFile(nextPresets);
    for(const kind of ['background','logo']){
      if(images[kind]===null){try{fs.unlinkSync(imageFile(kind));}catch(e){if(e.code!=='ENOENT')throw e;}}
      else {const tmp=imageFile(kind)+'.tmp';fs.writeFileSync(tmp,images[kind],{mode:0o600});fs.renameSync(tmp,imageFile(kind));}
    }
    save(settings);notifyAssets();
  }
  function handle(req,res,p){
    if(!p.startsWith('/api/studio/'))return false;
    (async()=>{
      if(!authorized(req))return respond(res,401,{error:'Admin password required'});
      if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!=='http://'+req.headers.host&&req.headers.origin!=='https://'+req.headers.host)
        return respond(res,403,{error:'Cross-origin updates are not allowed'});
      if(req.method==='GET'&&p==='/api/studio/state')return respond(res,200,{layouts:getSettings().layouts||{},mappings:getSettings().obsSceneMappings||{},presets:metadata()});
      if(req.method==='GET'&&p==='/api/studio/backup'){
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="vice-after-dark-backup.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return res.end(JSON.stringify(backup()));
      }
      if(req.method!=='POST')return respond(res,405,{error:'Method not allowed'});
      const body=await readJson(req);
      if(p==='/api/studio/layout'){
        if(!sceneNames.has(body?.scene))fail('Unknown scene');
        const positions=validWidgetMap(body.widgets);
        save({...getSettings(),layouts:{...(getSettings().layouts||{}),[body.scene]:positions}});
        return respond(res,200,{ok:true,scene:body.scene,widgets:positions});
      }
      if(p==='/api/studio/mappings'){
        const mappings=validMap(body?.mappings);
        save({...getSettings(),obsSceneMappings:mappings});
        return respond(res,200,{ok:true,mappings});
      }
      if(p==='/api/studio/presets'){
        const name=String(body?.name||'').trim();
        if(!name||name.length>48)fail('Enter a preset name (up to 48 characters)');
        if(body.action==='save'){
          const snapshot=JSON.parse(JSON.stringify(getSettings()));
          const existing=presets.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
          const updated=presets.slice();
          const preset={name,createdAt:new Date().toISOString(),settings:snapshot};
          if(existing>=0)updated[existing]=preset;else if(updated.length<20)updated.push(preset);else fail('Maximum of 20 presets reached');
          replacePresetFile(updated);
        }else if(body.action==='apply'){
          const preset=presets.find(p=>p.name===name);if(!preset)fail('Preset not found');
          save(cleanSettings(preset.settings));
        }else if(body.action==='delete'){
          if(!presets.some(p=>p.name===name))fail('Preset not found');
          replacePresetFile(presets.filter(p=>p.name!==name));
        }else fail('Unknown preset action');
        return respond(res,200,{ok:true,presets:metadata()});
      }
      if(p==='/api/studio/restore'){
        restore(body);
        return respond(res,200,{ok:true,presets:metadata()});
      }
      return respond(res,404,{error:'Unknown studio operation'});
    })().catch(e=>{if(!res.headersSent)respond(res,400,{error:e.message});});
    return true;
  }
  return {handle,validLayouts,validMap};
};
