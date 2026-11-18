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
  function sceneChange(scene){current=scene;iframe.src='/overlay/'+scene;setText('previewTitle',names[scene]);document.querySelectorAll('#sceneNav button').forEach(b=>b.classList.toggle('selected',b.dataset.scene===scene));}
  document.querySelectorAll('#sceneNav button').forEach(b=>b.addEventListener('click',()=>sceneChange(b.dataset.scene)));
  function copy(s,button){navigator.clipboard.writeText(s).then(()=>{const orig=button.textContent;button.textContent='Copied ✓';setTimeout(()=>button.textContent=orig,1200)}).catch(()=>prompt('Copy this URL:',s));}
  $('copyUrl').addEventListener('click',()=>copy(location.origin+'/overlay/'+current,$('copyUrl')));
  const urls=$('urlList');
  Object.entries(names).forEach(([key,label])=>{
    const item=document.createElement('div');item.className='url-item';
    const intro=document.createElement('div');const b=document.createElement('b');b.textContent=label;const small=document.createElement('small');small.textContent=location.origin+'/overlay/'+key;intro.append(b,small);
    const button=document.createElement('button');button.textContent='COPY';button.type='button';button.addEventListener('click',()=>copy(small.textContent,button));item.append(intro,button);urls.append(item);
  });
  fetch('/api/settings').then(r=>r.json()).then(v=>{render(v,true);say('Viewing live settings');}).catch(()=>say('Unable to fetch settings',true));
  const sse=new EventSource('/api/events');sse.addEventListener('settings',e=>{try{render(JSON.parse(e.data));}catch{}});
})();
