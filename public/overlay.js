(() => {
  'use strict';
  const allowed = ['gameplay','cam','starting','brb','ending','alert','socials'];
  const scene = location.pathname.split('/').pop();
  if (!allowed.includes(scene)) return;
  const stage = document.querySelector('#stage');
  let settings = {};
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
  function fullScreen(type) {
    stage.classList.add('screen');
    const bg=add(stage,'div','screen-bg');
    if(media.background)bg.style.backgroundImage='url("/assets/custom/background?v='+mediaRev+'")';
    add(stage,'div','palm left'); add(stage,'div','palm right');
    add(stage,'div','sun-glow'); add(stage,'div','screen-lines');
    const top=add(stage,'div','topline');
    top.style.justifyContent='flex-end';
    const pill=add(top,'div','pill');add(pill,'span','dot');add(pill,'span','', 'VICE CITY // 06');
    const hero=add(stage,'section','hero');
    add(hero,'div','eyebrow',type==='starting' ? 'A new transmission is loading' : type==='brb' ? 'Signal temporarily interrupted' : 'Transmission complete');
    const h=add(hero,'h1');
    if(type==='starting') {h.append('STARTING '); add(h,'span','accent','SOON');}
    if(type==='brb') {h.append('BE RIGHT ');add(h,'span','accent','BACK');}
    if(type==='ending') {h.append('STREAM ');add(h,'span','accent','ENDING');}
    add(hero,'div','subtitle',text(type==='starting'?settings.startingText:type==='brb'?settings.brbText:settings.endingText).toUpperCase());
    add(hero,'div','rule');
    if(type==='starting') {
      const cd=add(stage,'div','countdown-box');
      add(cd,'div','tiny-label','TRANSMISSION BEGINS IN');
      add(cd,'div','digits','--:--').id='timer';
    }
    const bot=add(stage,'div','bottomline');
    brand(bot);
    socials(bot);
  }
  function decorateCorners() {
    ['tl','tr','bl','br'].forEach(k=>add(stage,'div','corner '+k));
  }
  function gameplay() {
    decorateCorners(); add(stage,'div','rail');add(stage,'div','rail right');
    if(settings.showGameplayBar) {
      const header=add(stage,'div','game-header');
      if(media.logo){const img=add(header,'img','game-logo');img.src='/assets/custom/logo?v='+mediaRev;img.alt='';}
      add(header,'div','headline',text(settings.channel).toUpperCase());
      add(header,'div','small',text(settings.subtitle).toUpperCase());
    }
    if(settings.showGameplayFooter){
      const footer=add(stage,'div','game-footer');
      add(footer,'span','footer-title',text(settings.streamTitle).toUpperCase());
      socials(footer);
    }
  }
  function cam() {
    const c=add(stage,'section','cam '+settings.camSide);
    add(c,'div','cam-hole');add(c,'div','cam-top','LIVE // CAM 01');add(c,'div','cam-name',text(settings.camLabel).toUpperCase());
  }
  function alert() {
    if(!settings.showAlert) return;
    const a=add(stage,'section','alert');
    add(a,'div','alert-head',text(settings.alertTitle).toUpperCase());
    add(a,'div','alert-body',text(settings.alertText));
  }
  function paint() {
    stage.replaceChildren();stage.className=settings.theme||'night';
    if(['starting','brb','ending'].includes(scene)) fullScreen(scene);
    if(scene==='gameplay') gameplay();

    if(scene==='cam') cam();
    if(scene==='alert') alert();
    if(scene==='socials'){const section=add(stage,'section','socials-only');socials(section);}
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
  const events=new EventSource('/api/events');
  events.addEventListener('settings', ev=>{try {update(JSON.parse(ev.data));}catch{}});
  events.addEventListener('assets',ev=>{try{media=JSON.parse(ev.data);mediaRev=Date.now();paint();}catch{}});
})();
