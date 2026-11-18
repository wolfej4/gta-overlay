(() => {
  'use strict';
  const allowed = ['gameplay','dispatch','cam','starting','brb','ending','alert'];
  const scene = location.pathname.split('/').pop();
  if (!allowed.includes(scene)) return;
  const stage = document.querySelector('#stage');
  let settings = {};
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
  function fullScreen(type) {
    stage.classList.add('screen');
    add(stage,'div','screen-bg');
    add(stage,'div','palm left'); add(stage,'div','palm right');
    add(stage,'div','sun-glow'); add(stage,'div','screen-lines');
    const top=add(stage,'div','topline');
    add(top,'div','',text(settings.channel).toUpperCase());
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
    const brand=add(bot,'div','brand'); brand.append('ARCADE');add(brand,'span','','TIME');brand.append(' TV');
    add(bot,'div','handle',text(settings.handle).toUpperCase());
  }
  function decorateCorners() {
    ['tl','tr','bl','br'].forEach(k=>add(stage,'div','corner '+k));
  }
  function gameplay() {
    decorateCorners(); add(stage,'div','rail');add(stage,'div','rail right');
    if(settings.showGameplayBar) {
      const header=add(stage,'div','game-header');
      add(header,'div','headline',text(settings.channel).toUpperCase());
      add(header,'div','small',text(settings.subtitle).toUpperCase());
    }
    if(settings.showGameplayFooter) add(stage,'div','game-footer',text(settings.handle).toUpperCase()+'  //  '+text(settings.streamTitle).toUpperCase());
  }
  function dispatch() {
    const d=add(stage,'section','dispatch');
    add(d,'div','dispatch-label','● LIVE DISPATCH FEED // MANUAL');
    add(d,'div','dispatch-title',text(settings.dispatchTitle).toUpperCase());
    const stars=add(d,'div','stars');
    for(let i=0;i<6;i++) add(stars,'span','star'+(i<settings.wanted?' lit':''),'★');
    const meta=add(d,'div','dispatch-meta');
    if(settings.showLocation) {
      const row=add(meta,'div','rowline');add(row,'span','k','SECTOR');add(row,'span','v',text(settings.location).toUpperCase());
    }
    if(settings.showMission) {
      const row=add(meta,'div','rowline');add(row,'span','k','CURRENT PLAN');add(row,'span','v',text(settings.mission));
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
    if(scene==='dispatch') dispatch();
    if(scene==='cam') cam();
    if(scene==='alert') alert();
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
  const events=new EventSource('/api/events');
  events.addEventListener('settings', ev=>{try {update(JSON.parse(ev.data));}catch{}});
})();
