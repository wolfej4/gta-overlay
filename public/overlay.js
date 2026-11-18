(() => {
  'use strict';
  const allowed = ['gameplay','cam','starting','brb','ending','alert','socials','ticker','auto','transition','twitch-alerts'];
  const scene = location.pathname.split('/').pop();
  if (!allowed.includes(scene)) return;
  const stage = document.querySelector('#stage');
  let settings = {};
  let activeMode=scene==='auto'?'gameplay':scene;
  let previewLayout=null;
  const alerts=[];let alertRunning=false;
  let media={background:false,logo:false};let mediaRev=Date.now();
  // Scales to whatever size OBS/browser viewport is configured to, with a 16:9 design canvas.
  function scale() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${s})`;
    stage.style.left = `${(innerWidth-1920*s)/2}px`;
    stage.style.top = `${(innerHeight-1080*s)/2}px`;
  }
  addEventListener('resize', scale); scale();
  const el = (name, cls, value) => {
    const e = document.createElement(name);
    if (cls) e.className = cls;
    if (value != null) e.textContent = value;
    return e;
  };
  const add = (parent, name, cls, value) => { const child = el(name,cls,value); parent.append(child); return child; };
  const text = v => String(v ?? '');
  function mark(element,key){element.dataset.layoutKey=key;return element;}
  function applyLayout(){
    const perScene=previewLayout||settings.layouts?.[activeMode]||{};
    for(const element of stage.querySelectorAll('[data-layout-key]')){
      const p=perScene[element.dataset.layoutKey];
      if(!p)continue;
      if(![p.x,p.y,p.w,p.h].every(Number.isFinite))continue;
      Object.assign(element.style,{left:p.x+'px',top:p.y+'px',right:'auto',bottom:'auto',width:p.w+'px',height:p.h+'px',minWidth:'0',maxWidth:'none',transform:'none',margin:'0'});
    }
  }
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent)return;
    if(event.data?.type!=='vice-layout-preview'||event.data.scene!==activeMode)return;
    previewLayout=event.data.widgets;paint();
  });
  function transitionEffect(payload){
    if(scene!=='transition')return;
    stage.replaceChildren();stage.className='transition-stage';
    const style=['neon','wipe','fade'].includes(payload.style)?payload.style:'neon';
    const duration=Math.max(300,Math.min(3000,Number(payload.duration)||1200));
    const layer=add(stage,'section','scene-transition scene-transition-'+style);
    layer.style.setProperty('--transition-ms',duration+'ms');
    const bar=add(layer,'div','transition-sweep');
    add(bar,'span','transition-label','VICE AFTER DARK');
    setTimeout(()=>{if(layer.isConnected)layer.remove();},duration+140);
  }
  function receiveTwitchAlert(payload){
    if(scene!=='twitch-alerts'||settings.twitchAlertsEnabled===false)return;
    alerts.push(payload);if(alerts.length>10)alerts.shift();
    playTwitchAlert();
  }
  function playTwitchAlert(){
    if(scene!=='twitch-alerts'||alertRunning||!alerts.length)return;
    alertRunning=true;const data=alerts.shift();
    const card=mark(add(stage,'section','twitch-alert-card'),'twitch-alert-card');
    add(card,'div','twitch-alert-eyebrow','VICE CITY SOCIAL CLUB');
    add(card,'div','twitch-alert-title',String(data.title||'LIVE EVENT').slice(0,45));
    add(card,'div','twitch-alert-viewer',String(data.viewer||'Viewer').slice(0,65));
    if(data.detail)add(card,'div','twitch-alert-detail',String(data.detail).slice(0,95));
    applyLayout();
    setTimeout(()=>{card.classList.add('is-leaving');setTimeout(()=>{card.remove();alertRunning=false;playTwitchAlert();},530);},6500);
  }
  const socialLabels={"twitch":"Twitch","youtube":"YouTube","tiktok":"TikTok","instagram":"Instagram","x":"X","discord":"Discord","facebook":"Facebook","kick":"Kick","bluesky":"Bluesky","threads":"Threads","reddit":"Reddit"};
  function socials(parent){
    const accounts=settings.socials && typeof settings.socials==='object'?settings.socials:{twitch:settings.handle||''};
    const visible=Object.entries(socialLabels).filter(([key])=>typeof accounts[key]==='string'&&accounts[key].trim());
    if(!visible.length)return;
    const strip=add(parent,'div','social-strip');
    for(const [key,label] of visible){
      const pill=add(strip,'span','social-pill');
      const icon=add(pill,'img','social-icon');icon.src='/assets/social/'+key+'.svg';icon.alt=label+' icon';
      add(pill,'span','social-handle',accounts[key].trim());
    }
  }
  function brand(parent){
    const brandEl=add(parent,'div','brand');
    if(media.logo){const img=add(brandEl,'img','brand-logo');img.src='/assets/custom/logo?v='+mediaRev;img.alt='';}
    add(brandEl,'span','brand-name',text(settings.channel).toUpperCase());
  }

  // Virtualized ticker: only a few headlines exist in the DOM at once.
  // After each item scrolls away it is replaced by the next item, wrapping
  // back to the first after the complete 193-headline collection finishes.
  function renderTicker(parent){
    if(settings.tickerEnabled===false)return;
    const mode=['all','leonida','archive'].includes(settings.tickerMode)?settings.tickerMode:'all';
    const library=Array.isArray(window.VICE_TICKER_ITEMS)?window.VICE_TICKER_ITEMS:[];
    const stories=library.filter(item=>mode==='all'||item.kind===mode).slice();
    for(const line of String(settings.tickerCustom||'').split(/\r?\n/)){
      const headline=line.trim();
      if(headline)stories.push({kind:'custom',label:'YOUR HEADLINE',text:headline.slice(0,180)});
    }
    if(stories.length===0)return;
    const shell=mark(add(parent,'section','ticker-shell'),'ticker-shell');
    shell.setAttribute('aria-label','Looping Weazel News-inspired GTA universe news ticker');
    const badge=add(shell,'div','ticker-badge');
    add(badge,'span','ticker-badge-dot');
    add(badge,'span','ticker-badge-name','WEAZEL NEWS');
    const viewport=add(shell,'div','ticker-viewport');
    const track=add(viewport,'div','ticker-track');
    let index=0,position=0,previous=null;
    function appendNext(){
      const story=stories[index];index=(index+1)%stories.length;
      const item=add(track,'span','ticker-item ticker-'+story.kind);
      add(item,'span','ticker-topic',story.label);
      add(item,'span','ticker-headline',story.text);
      add(item,'span','ticker-divider','✦');
    }
    function ensureAhead(){
      // Keep sufficient offscreen headlines loaded without creating an enormous DOM.
      while(track.scrollWidth < viewport.clientWidth+position+2200 && track.children.length<25)appendNext();
    }
    ensureAhead();
    const speed=Math.max(35,Math.min(160,Number(settings.tickerSpeed)||85));
    function advance(now){
      if(!track.isConnected)return;
      if(previous!==null)position+=speed*Math.min((now-previous)/1000,.05);
      previous=now;
      let first=track.firstElementChild;
      while(first && position>=first.offsetWidth){
        position-=first.offsetWidth;
        first.remove();
        first=track.firstElementChild;
      }
      ensureAhead();
      track.style.transform='translate3d('+(-position)+'px,0,0)';
      requestAnimationFrame(advance);
    }
    if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      requestAnimationFrame(advance);
  }
  function fullScreen(type) {
    stage.classList.add('screen');
    const bg=add(stage,'div','screen-bg');
    // Built-in user-provided wallpaper is the default; an uploaded image takes precedence.
    bg.style.backgroundImage=media.background
      ? 'url("/assets/custom/background?v='+mediaRev+'")'
      : 'url("/assets/default-background.webp")';
    add(stage,'div','screen-lines');
    const top=mark(add(stage,'div','topline'),'topline');
    top.style.justifyContent='flex-end';
    const pill=add(top,'div','pill');add(pill,'span','dot');add(pill,'span','', 'VICE CITY // LIVE');
    const hero=mark(add(stage,'section','hero'),'hero');
    add(hero,'div','eyebrow',type==='starting' ? 'THE STREETS ARE CALLING' : type==='brb' ? 'TAKING A PIT STOP' : 'ANOTHER NIGHT IN VICE CITY');
    const h=add(hero,'h1');
    if(type==='starting') {h.append('STARTING '); add(h,'span','accent','SOON');}
    if(type==='brb') {h.append('BE RIGHT ');add(h,'span','accent','BACK');}
    if(type==='ending') {h.append('STREAM ');add(h,'span','accent','ENDING');}
    add(hero,'div','subtitle',text(type==='starting'?settings.startingText:type==='brb'?settings.brbText:settings.endingText).toUpperCase());
    add(hero,'div','rule');
    if(type==='starting') {
      const cd=mark(add(stage,'div','countdown-box'),'countdown-box');
      add(cd,'div','tiny-label','HITTING THE STREETS IN');
      add(cd,'div','digits','--:--').id='timer';
    }
    const bot=mark(add(stage,'div','bottomline'),'bottomline');
    brand(bot);
    socials(bot);
    if(settings.tickerShowFullScreen!==false)renderTicker(stage);
  }
  function decorateCorners() {
    ['tl','tr','bl','br'].forEach(k=>add(stage,'div','corner '+k));
  }
  function gameplay() {
    decorateCorners(); add(stage,'div','rail');add(stage,'div','rail right');
    if(settings.showGameplayBar) {
      const header=mark(add(stage,'div','game-header'),'game-header');
      if(media.logo){const img=add(header,'img','game-logo');img.src='/assets/custom/logo?v='+mediaRev;img.alt='';}
      add(header,'div','headline',text(settings.channel).toUpperCase());
      add(header,'div','small',text(settings.subtitle).toUpperCase());
    }
    if(settings.showGameplayFooter){
      const footer=mark(add(stage,'div','game-footer'),'game-footer');
      add(footer,'span','footer-title',text(settings.streamTitle).toUpperCase());
      socials(footer);
    }
  }
  function cam() {
    const c=mark(add(stage,'section','cam '+settings.camSide),'cam');
    add(c,'div','cam-hole');add(c,'div','cam-top','LIVE // CAM 01');add(c,'div','cam-name',text(settings.camLabel).toUpperCase());
  }
  function alert() {
    if(!settings.showAlert) return;
    const a=mark(add(stage,'section','alert'),'alert');
    add(a,'div','alert-head',text(settings.alertTitle).toUpperCase());
    add(a,'div','alert-body',text(settings.alertText));
  }
  function paint() {
    if(activeMode==='transition'||activeMode==='twitch-alerts')return;
    stage.replaceChildren();stage.className=settings.theme||'night';
    if(['starting','brb','ending'].includes(activeMode)) fullScreen(activeMode);
    if(activeMode==='gameplay') gameplay();
    if(activeMode==='cam') cam();
    if(activeMode==='alert') alert();
    if(activeMode==='socials'){const section=mark(add(stage,'section','socials-only'),'socials-only');socials(section);}
    if(activeMode==='ticker')renderTicker(stage);
    applyLayout();
    countdown();
  }
  function countdown() {
    const timer=document.querySelector('#timer');if(!timer)return;
    const end = settings.countdownEnd ? new Date(settings.countdownEnd).getTime() : NaN;
    if(!Number.isFinite(end)) {timer.textContent='--:--';return;}
    const seconds=Math.max(0,Math.ceil((end-Date.now())/1000));
    const m=Math.floor(seconds/60),s=seconds%60;
    timer.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  setInterval(countdown,1000);
  function update(data) {if(data && typeof data==='object'){settings=data;paint();}}
  fetch('/api/settings',{cache:'no-store'}).then(r=>r.json()).then(update).catch(()=>{stage.textContent='Overlay connection unavailable';});
  fetch('/api/assets',{cache:'no-store'}).then(r=>r.json()).then(status=>{media=status;mediaRev=Date.now();paint();}).catch(()=>{});
  if(scene==='auto'){
    fetch('/api/integrations/scene',{cache:'no-store'}).then(r=>r.json()).then(data=>{
      activeMode=data.mode==='none'?'none':(['starting','brb','ending','gameplay','socials','ticker','cam','alert'].includes(data.mode)?data.mode:'gameplay');
      paint();
    }).catch(()=>{});
  }
  const events=new EventSource('/api/events');
  events.addEventListener('settings', ev=>{try {update(JSON.parse(ev.data));}catch{}});
  events.addEventListener('assets',ev=>{try{media=JSON.parse(ev.data);mediaRev=Date.now();paint();}catch{}});
  events.addEventListener('scene',ev=>{if(scene!=='auto')return;try{
    const data=JSON.parse(ev.data);activeMode=data.mode==='none'?'none':(['starting','brb','ending','gameplay','socials','ticker','cam','alert'].includes(data.mode)?data.mode:'gameplay');
    previewLayout=null;paint();
  }catch{}});
  events.addEventListener('transition',ev=>{try{transitionEffect(JSON.parse(ev.data));}catch{}});
  events.addEventListener('twitch-alert',ev=>{try{receiveTwitchAlert(JSON.parse(ev.data));}catch{}});
})();
