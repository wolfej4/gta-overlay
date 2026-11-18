(() => {
  'use strict';
  const names = {gameplay:'Gameplay HUD',dispatch:'Dispatch / Wanted',cam:'Webcam Frame',alert:'Announcement',starting:'Starting Soon',brb:'Be Right Back',ending:'Stream Ending'};
  const $=id=>document.getElementById(id);
  const fields=[...document.querySelectorAll('[data-field]')];
  let latest={};let auth=null;let editing=false;let dirty=false;let current='gameplay';
  function say(message,error=false){$('saveState').textContent=message;$('saveState').style.color=error?'#ff98b8':'';}
  const setText = (id, value) => $(id).textContent=value;
  function render(values, force=false){
    latest=values;
    if(!dirty||force) { fields.forEach(f=> {if(!Object.hasOwn(values,f.dataset.field))return; const v=values[f.dataset.field];if(f.type==='checkbox')f.checked=!!v;else f.value=v;}); dirty=false; }
    setText('starsValue',`${values.wanted} / 6`); setText('starMeter','★'.repeat(values.wanted)+'☆'.repeat(6-values.wanted));
  }
  function dirtyChange(){dirty=true;say('Unsaved edits');const w=Number($('wanted').value);setText('starsValue',`${w} / 6`);setText('starMeter','★'.repeat(w)+'☆'.repeat(6-w));}
  fields.forEach(f=> {f.addEventListener('input',dirtyChange);f.addEventListener('change',dirtyChange);});
  function authHeaders(){return auth?{'Authorization':'Basic '+btoa('admin:'+auth)}:{}}
  async function save(url,body){
    if(!editing){$('loginDialog').showModal();return false;}
    const res=await fetch(url,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await res.json();
    if(!res.ok)throw Error(result.error||'Could not save');
    dirty=false;render(result,true);say('Live · Saved ✓');return true;
  }
  $('saveBtn').addEventListener('click',async()=>{
    const values={};fields.forEach(f=>values[f.dataset.field]=f.type==='checkbox'?f.checked:f.type==='range'?Number(f.value):f.value);
    try{await save('/api/settings',values);}catch(e){say(e.message,true);}
  });
  const timer = async minutes => {try{await save('/api/countdown',{minutes});}catch(e){say(e.message,true);}};
  $('startTimer').addEventListener('click',()=>timer(Number($('minutes').value)));
  $('stopTimer').addEventListener('click',()=>timer(0));
  $('loginBtn').addEventListener('click',()=>$('loginDialog').showModal());
  $('cancelLogin').addEventListener('click',()=>$('loginDialog').close());
  $('loginForm').addEventListener('submit',async ev=>{
    ev.preventDefault();const pw=$('password').value;
    try{
      const r=await fetch('/api/settings',{method:'POST',headers:{'Authorization':'Basic '+btoa('admin:'+pw),'Content-Type':'application/json'},body:'{}'});
      if(!r.ok) throw Error('Incorrect password or server configuration');
      auth=pw;editing=true;setText('status','Editing unlocked');$('loginBtn').textContent='Unlocked';$('loginDialog').close();$('password').value='';$('loginError').textContent='';
    }catch(e){setText('loginError',e.message);}
  });
  const iframe=$('previewIframe'), box=$('previewBox');
  function resizePreview(){const w=box.clientWidth;iframe.style.transform=`scale(${w/1920})`;}
  if('ResizeObserver' in window)new ResizeObserver(resizePreview).observe(box);
  addEventListener('resize',resizePreview);resizePreview();
  function obsUrl(scene){return location.origin+'/overlay/'+scene;}
  const previewUrl=$('selectedObsUrl');
  function selectUrl(input){input.focus();input.select();input.setSelectionRange(0,input.value.length);}
  function sceneChange(scene){
    current=scene;iframe.src='/overlay/'+scene;previewUrl.value=obsUrl(scene);
    setText('previewTitle',names[scene]);
    document.querySelectorAll('#sceneNav button').forEach(b=>b.classList.toggle('selected',b.dataset.scene===scene));
  }
  document.querySelectorAll('#sceneNav button').forEach(b=>b.addEventListener('click',()=>sceneChange(b.dataset.scene)));
  async function copy(s,button,input){
    const orig=button.textContent;
    let copied=false;
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(s);copied=true;}
    }catch{}
    if(!copied){
      selectUrl(input);
      try{copied=document.execCommand('copy');}catch{}
    }
    button.textContent=copied?'Copied ✓':'Selected — press Ctrl+C / ⌘C';
    setTimeout(()=>{button.textContent=orig;},2400);
  }
  previewUrl.value=obsUrl(current);
  previewUrl.addEventListener('click',()=>selectUrl(previewUrl));
  $('copyUrl').addEventListener('click',()=>copy(obsUrl(current),$('copyUrl'),previewUrl));
  const urls=$('urlList');
  Object.entries(names).forEach(([key,label])=>{
    const item=document.createElement('div');item.className='url-item';
    const heading=document.createElement('b');heading.textContent=label;
    const row=document.createElement('div');row.className='url-input-row';
    const input=document.createElement('textarea');input.className='obs-url-field';
    input.rows=2;input.readOnly=true;input.spellcheck=false;input.value=obsUrl(key);
    input.setAttribute('aria-label',label+' OBS URL');
    input.addEventListener('click',()=>selectUrl(input));
    const button=document.createElement('button');button.textContent='Copy URL';button.type='button';
    button.addEventListener('click',()=>copy(input.value,button,input));
    row.append(input,button);item.append(heading,row);urls.append(item);
  });
  fetch('/api/version').then(r=>{if(!r.ok)throw Error('Version unavailable');return r.json();}).then(v=>setText('appVersion','v'+v.version)).catch(()=>setText('appVersion','Version unavailable'));
  fetch('/api/settings').then(r=>r.json()).then(v=>{render(v,true);say('Viewing live settings');}).catch(()=>say('Unable to fetch settings',true));
  const sse=new EventSource('/api/events');sse.addEventListener('settings',e=>{try{render(JSON.parse(e.data));}catch{}});
})();
