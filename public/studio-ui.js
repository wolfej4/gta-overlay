(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const api=window.viceStudio;
  if(!api)return;
  const scenes={gameplay:'Gameplay HUD',starting:'Starting Soon',brb:'Be Right Back',ending:'Stream Ending',ticker:'News Ticker',cam:'Webcam Frame',alert:'Announcement',socials:'Socials', 'twitch-alerts':'Twitch Alerts'};
  const widgets={
    gameplay:[['game-header','Top banner',{x:690,y:23,w:540,h:100}],['game-footer','Footer + socials',{x:430,y:1007,w:1060,h:55}]],
    starting:[['topline','LIVE indicator',{x:1440,y:60,w:370,h:70}],['hero','Main heading',{x:152,y:335,w:1320,h:350}],['countdown-box','Countdown',{x:1400,y:730,w:405,h:180}],['bottomline','Channel + socials',{x:110,y:910,w:1700,h:95}],['ticker-shell','News ticker',{x:0,y:1012,w:1920,h:68}]],
    brb:[['topline','LIVE indicator',{x:1440,y:60,w:370,h:70}],['hero','Main heading',{x:152,y:335,w:1320,h:350}],['bottomline','Channel + socials',{x:110,y:910,w:1700,h:95}],['ticker-shell','News ticker',{x:0,y:1012,w:1920,h:68}]],
    ending:[['topline','LIVE indicator',{x:1440,y:60,w:370,h:70}],['hero','Main heading',{x:152,y:335,w:1320,h:350}],['bottomline','Channel + socials',{x:110,y:910,w:1700,h:95}],['ticker-shell','News ticker',{x:0,y:1012,w:1920,h:68}]],
    ticker:[['ticker-shell','News ticker',{x:0,y:1012,w:1920,h:68}]],
    cam:[['cam','Webcam frame',{x:1392,y:394,w:460,h:280}]],
    alert:[['alert','Announcement',{x:650,y:126,w:620,h:140}]],
    socials:[['socials-only','Social accounts',{x:70,y:970,w:1780,h:85}]],
    'twitch-alerts':[['twitch-alert-card','Twitch alert card',{x:610,y:150,w:700,h:190}]]
  };
  let studioState={layouts:{},mappings:{},presets:[]},draft={},active='gameplay',selected='',dragging=null;
  function message(s,error=false){const target=$('studioStatus');target.textContent=s;target.style.color=error?'#ff94a3':'';}
  async function request(route,method='GET',data){
    const r=await fetch(route,{method,headers:{...api.authHeaders(),...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
    if(!r.ok){let error='Request failed';try{error=(await r.json()).error||error;}catch{}throw Error(error);}
    return r.json();
  }
  function syncSettingValues(values){
    if(!values)return;
    for(const id of ['transitionsEnabled','obsSyncEnabled','twitchAlertsEnabled']){
      $(id).checked=values[id]!==false;
    }
    $('transitionStyle').value=values.transitionStyle||'neon';
    $('transitionDuration').value=Number(values.transitionDuration)||1200;
    $('transitionDurationLabel').textContent=String($('transitionDuration').value);
  }
  async function refreshStudio(){
    if(!api.unlocked()){message('Unlock Editing to manage layouts and backups');return;}
    try{
      studioState=await request('/api/studio/state');
      renderPresets();renderLayout();message('Studio settings loaded');
      const values=api.settings();syncSettingValues(values);
    }catch(e){message(e.message,true);}
  }
  function widgetsFor(scene){return widgets[scene]||[];}
  function geometry(key){
    const def=widgetsFor(active).find(([id])=>id===key);
    return {...(draft[key]||def?.[2]||{x:200,y:200,w:300,h:100})};
  }
  function publishDraft(){
    const frame=$('layoutIframe');
    frame.contentWindow?.postMessage({type:'vice-layout-preview',scene:active,widgets:draft},location.origin);
  }
  function renderLayout(){
    active=$('layoutScene').value||'gameplay';
    draft=JSON.parse(JSON.stringify(studioState.layouts?.[active]||{}));
    const layer=$('layoutHitLayer');layer.replaceChildren();
    const available=widgetsFor(active);
    if(!available.some(([key])=>key===selected))selected=available[0]?.[0]||'';
    const select=$('layoutWidget');select.replaceChildren();
    for(const [key,name] of available){
      const opt=document.createElement('option');opt.value=key;opt.textContent=name;select.append(opt);
      const pos=geometry(key);
      const el=document.createElement('div');el.className='layout-widget'+(key===selected?' selected':'');el.dataset.widget=key;el.textContent=name;
      positionElement(el,pos);
      const handle=document.createElement('span');handle.className='resize-handle';handle.title='Drag to resize';handle.setAttribute('aria-label','Resize '+name);el.append(handle);
      el.addEventListener('pointerdown',evt=>startDrag(evt,key,handle.contains(evt.target)));
      layer.append(el);
    }
    select.value=selected;
    $('layoutIframe').src='/overlay/'+active;
    renderNumbers();
  }
  function renderNumbers(){
    if(!selected)return;
    const pos=geometry(selected);
    for(const id of ['x','y','w','h'])$('layout'+id.toUpperCase()).value=pos[id];
  }
  function positionElement(el,pos){
    el.style.left=100*pos.x/1920+'%';el.style.top=100*pos.y/1080+'%';
    el.style.width=100*pos.w/1920+'%';el.style.height=100*pos.h/1080+'%';
  }
  function updateWidgets(){
    for(const el of $('layoutHitLayer').children){
      positionElement(el,geometry(el.dataset.widget));
      el.classList.toggle('selected',el.dataset.widget===selected);
    }
    $('layoutWidget').value=selected;renderNumbers();publishDraft();
  }
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function startDrag(evt,key,resizing){
    if(evt.button!==0)return;
    evt.preventDefault();evt.stopPropagation();
    selected=key;
    const current=geometry(key);
    const rect=$('layoutHitLayer').getBoundingClientRect();
    dragging={key,resizing,originX:evt.clientX,originY:evt.clientY,start:current,sx:1920/rect.width,sy:1080/rect.height};
    evt.currentTarget.setPointerCapture(evt.pointerId);
    updateWidgets();
  }
  $('layoutHitLayer').addEventListener('pointermove',evt=>{
    if(!dragging)return;
    const t=dragging,dx=Math.round((evt.clientX-t.originX)*t.sx/10)*10,dy=Math.round((evt.clientY-t.originY)*t.sy/10)*10;
    const p={...t.start};
    if(t.resizing){p.w=clamp(t.start.w+dx,60,1920-p.x);p.h=clamp(t.start.h+dy,35,1080-p.y);}
    else {p.x=clamp(t.start.x+dx,0,1920-p.w);p.y=clamp(t.start.y+dy,0,1080-p.h);}
    draft[t.key]=p;updateWidgets();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('layoutHitLayer').addEventListener(name,()=>{dragging=null;});
  $('layoutScene').addEventListener('change',()=>{selected='';renderLayout();});
  $('layoutWidget').addEventListener('change',ev=>{selected=ev.target.value;updateWidgets();});
  for(const id of ['x','y','w','h']){
    $('layout'+id.toUpperCase()).addEventListener('change',()=>{
      const p=geometry(selected);p[id]=Math.round(Number($('layout'+id.toUpperCase()).value)||0);
      p.w=clamp(p.w,60,1920);p.h=clamp(p.h,35,1080);
      p.x=clamp(p.x,0,1920-p.w);p.y=clamp(p.y,0,1080-p.h);
      draft[selected]=p;updateWidgets();
    });
  }
  $('saveLayout').addEventListener('click',async()=>{
    try{
      const r=await request('/api/studio/layout','POST',{scene:active,widgets:draft});
      studioState.layouts[active]=r.widgets;message('Layout saved to OBS overlays ✓');
    }catch(e){message(e.message,true);}
  });
  $('resetLayout').addEventListener('click',async()=>{
    draft={};updateWidgets();
    try{
      await request('/api/studio/layout','POST',{scene:active,widgets:{}});
      studioState.layouts[active]={};renderLayout();message('Scene layout reset ✓');
    }catch(e){message(e.message,true);}
  });
  function renderPresets(){
    const select=$('presetList'),old=select.value;select.replaceChildren();
    for(const p of studioState.presets||[]){const o=document.createElement('option');o.value=p.name;o.textContent=p.name;select.append(o);}
    if(studioState.presets?.some(p=>p.name===old))select.value=old;
  }
  async function preset(action){
    const name=action==='save' ? $('presetName').value.trim():$('presetList').value;
    if(!name){message('Choose or enter a preset name',true);return;}
    if(action==='apply'&&!confirm('Apply preset "'+name+'" to all overlays?'))return;
    if(action==='delete'&&!confirm('Delete preset "'+name+'"?'))return;
    try{
      const result=await request('/api/studio/presets','POST',{action,name});
      studioState.presets=result.presets;renderPresets();
      if(action==='apply'){
        await api.reloadSettings();await refreshStudio();
      }
      message('Preset '+(action==='save'?'saved':action==='apply'?'applied':'deleted')+' ✓');
    }catch(e){message(e.message,true);}
  }
  $('savePreset').addEventListener('click',()=>preset('save'));
  $('applyPreset').addEventListener('click',()=>preset('apply'));
  $('deletePreset').addEventListener('click',()=>preset('delete'));
  $('exportBackup').addEventListener('click',async()=>{
    try{
      if(!api.unlocked())throw Error('Unlock Editing first');
      const r=await fetch('/api/studio/backup',{headers:api.authHeaders()});
      if(!r.ok)throw Error('Could not download backup');
      const blob=await r.blob(),url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='vice-after-dark-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),15000);message('Backup exported — keep it somewhere safe ✓');
    }catch(e){message(e.message,true);}
  });
  $('importBackup').addEventListener('click',async()=>{
    const file=$('backupFile').files?.[0];
    if(!file){message('Choose a backup JSON file',true);return;}
    if(file.size>28*1024*1024){message('Backup exceeds size limit',true);return;}
    if(!confirm('Restore all settings, layouts, presets and uploaded images from this backup? Current values will be replaced.'))return;
    try{
      const data=JSON.parse(await file.text());
      await request('/api/studio/restore','POST',data);
      await api.reloadSettings();await refreshStudio();
      $('backupFile').value='';message('Backup restored ✓');
    }catch(e){message(e.message,true);}
  });
  async function saveSettings(){
    try{
      const data={
        transitionsEnabled:$('transitionsEnabled').checked,
        transitionStyle:$('transitionStyle').value,
        transitionDuration:Number($('transitionDuration').value),
        obsSyncEnabled:$('obsSyncEnabled').checked,
        twitchAlertsEnabled:$('twitchAlertsEnabled').checked
      };
      await api.saveSettings(data);message('Integration settings saved ✓');
    }catch(e){message(e.message,true);}
  }
  $('saveIntegrationSettings').addEventListener('click',saveSettings);
  $('transitionDuration').addEventListener('input',e=>$('transitionDurationLabel').textContent=e.target.value);
  async function doTest(kind){
    try{
      api.selectScene(kind==='alert'?'twitch-alerts':'transition');
      await request('/api/integrations/test-'+(kind==='alert'?'alert':'transition'),'POST');
      message('Test event sent ✓');
    }catch(e){message(e.message,true);}
  }
  $('testTwitchAlert').addEventListener('click',()=>doTest('alert'));
  $('testTransition').addEventListener('click',()=>doTest('transition'));
  $('connectTwitch').addEventListener('click',async()=>{
    try{
      const data=await request('/api/integrations/twitch-connect');
      location.assign(data.url);
    }catch(e){message(e.message,true);}
  });
  $('disconnectTwitch').addEventListener('click',async()=>{
    if(!confirm('Disconnect Twitch and discard its saved OAuth token?'))return;
    try{await request('/api/integrations/twitch-disconnect','POST');await refreshConnections();message('Twitch disconnected');}
    catch(e){message(e.message,true);}
  });
  async function refreshConnections(){
    if(!api.unlocked())return;
    try{
      const status=await request('/api/integrations/status');
      $('twitchConnection').textContent=status.twitch.configured?(status.twitch.connected?'Connected: '+status.twitch.user:status.twitch.authorized?'Authorized — connecting…':status.twitch.error||'Ready to authorize'):'Set Twitch credentials in Docker first';
      $('obsConnection').textContent=status.obs.configured?(status.obs.connected?'Connected · '+(status.obs.scene||'No active scene'):(status.obs.error||'Connecting…')):'Set OBS_WS_URL in Docker first';
      $('disconnectTwitch').disabled=!status.twitch.authorized;
      renderMappings(status.obs.scenes||[]);
    }catch(e){$('twitchConnection').textContent='Status unavailable';}
  }
  function renderMappings(scenes){
    const container=$('sceneMappings');
    const previous=Object.fromEntries([...container.querySelectorAll('select')].map(s=>[s.dataset.obsScene,s.value]));
    container.replaceChildren();
    if(!scenes.length){const p=document.createElement('p');p.className='note';p.textContent='Connect OBS to show your scene names and choose which overlay each one displays.';container.append(p);return;}
    for(const scene of scenes){
      const row=document.createElement('div');row.className='mapping-row';
      const label=document.createElement('label');label.textContent=scene;
      const select=document.createElement('select');select.dataset.obsScene=scene;
      const options=[['auto','Automatic name match'],['gameplay','Gameplay'],['starting','Starting Soon'],['brb','BRB'],['ending','Ending'],['none','Hide overlay']];
      for(const [value,name] of options){const o=document.createElement('option');o.value=value;o.textContent=name;select.append(o);}
      const configured=studioState.mappings?.[scene];
      select.value=previous[scene]||configured||'auto';
      if(select.value==='')select.value='auto';
      row.append(label,select);container.append(row);
    }
  }
  $('saveMappings').addEventListener('click',async()=>{
    try{
      const mappings={...studioState.mappings};
      for(const s of $('sceneMappings').querySelectorAll('select')){
        if(s.value==='auto')delete mappings[s.dataset.obsScene];
        else mappings[s.dataset.obsScene]=s.value;
      }
      const result=await request('/api/studio/mappings','POST',{mappings});
      studioState.mappings=result.mappings;message('OBS scene mappings saved ✓');
    }catch(e){message(e.message,true);}
  });
  $('refreshConnections').addEventListener('click',refreshConnections);
  window.addEventListener('vice-studio-unlocked',()=>{refreshStudio();refreshConnections();});
  $('layoutScene').value='gameplay';
  renderLayout();
  syncSettingValues(api.settings());
  if(new URLSearchParams(location.search).get('twitch'))message('Twitch authorization received. Unlock editing to check connection.');
  setInterval(()=>{if(api.unlocked())refreshConnections();},10000);
})();
