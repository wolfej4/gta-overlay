'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

module.exports=function createIntegrations({dataDir,getSettings,authorized,respond,emit}){
  const clientId=(process.env.TWITCH_CLIENT_ID||'').trim();
  const clientSecret=(process.env.TWITCH_CLIENT_SECRET||'').trim();
  const redirectUri=(process.env.TWITCH_REDIRECT_URI||'').trim();
  const obsAddress=(process.env.OBS_WS_URL||'').trim();
  const obsPassword=process.env.OBS_WS_PASSWORD||'';
  const tokenFile=path.join(dataDir,'twitch-oauth.json');
  const validModes=new Set(['gameplay','cam','starting','brb','ending','alert','socials','ticker','twitch-alerts','none']);
  const status={obs:{connected:false,scenes:[],scene:'',error:''},twitch:{connected:false,user:'',error:'',subscriptions:[]}};
  let activeMode='gameplay',oauthState=null,oauthExpiry=0,tokens=null,twitchWS=null,obsWS=null,stopped=false;
  let twitchTimer=null,obsTimer=null,refreshTimer=null;const seen=new Set();
  try{tokens=JSON.parse(fs.readFileSync(tokenFile,'utf8'));}catch{}
  function summary(){return {obs:{...status.obs,configured:!!obsAddress},twitch:{...status.twitch,configured:!!(clientId&&clientSecret&&redirectUri),authorized:!!tokens?.access_token},mode:activeMode};}
  function notifyStatus(){emit('integrations',summary());}
  function timer(fn,ms){const t=setTimeout(fn,ms);t.unref?.();return t;}
  function close(socket){try{if(socket&&socket.readyState<2)socket.close();}catch{}}
  function saveTokens(data){
    const updated={...data,expires_at:Date.now()+Math.max(60,Number(data.expires_in)||3600)*1000};
    const tmp=tokenFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(updated),{mode:0o600});fs.renameSync(tmp,tokenFile);tokens=updated;
    clearTimeout(refreshTimer);
    refreshTimer=timer(()=>refreshToken().catch(e=>{status.twitch.error=e.message;notifyStatus();}),Math.max(60000,updated.expires_at-Date.now()-180000));
  }
  async function refreshToken(){
    if(!tokens?.refresh_token)throw Error('No Twitch refresh token');
    const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:clientId,client_secret:clientSecret});
    const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',body,signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error('Twitch token refresh rejected: '+r.status);
    saveTokens(await r.json());
  }
  async function freshToken(){
    if(!tokens?.access_token)throw Error('Connect Twitch in the dashboard');
    if(tokens.expires_at && tokens.expires_at<Date.now()+120000)await refreshToken();
    return tokens.access_token;
  }
  async function helixGet(route){
    const access=await freshToken();
    const r=await fetch('https://api.twitch.tv/helix'+route,{headers:{'Client-Id':clientId,Authorization:'Bearer '+access},signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error('Twitch API error '+r.status);
    return r.json();
  }
  function modeForScene(name){
    const map=getSettings().obsSceneMappings||{};
    if(Object.hasOwn(map,name)&&validModes.has(map[name]))return map[name];
    const n=String(name||'').toLowerCase();
    if(/starting|soon|intro/.test(n))return 'starting';
    if(/brb|be right back|break/.test(n))return 'brb';
    if(/end|offline|outro/.test(n))return 'ending';
    return 'gameplay';
  }
  function emitTransition(){
    const settings=getSettings();
    if(settings.transitionsEnabled===false)return;
    emit('transition',{id:crypto.randomUUID(),style:settings.transitionStyle||'neon',duration:settings.transitionDuration||1200});
  }
  function setOBSScene(scene,initial=false){
    if(!scene)return;
    const previous=status.obs.scene;
    status.obs.scene=scene;activeMode=modeForScene(scene);
    if(getSettings().obsSyncEnabled!==false)emit('scene',{sceneName:scene,mode:activeMode});
    if(!initial&&previous&&previous!==scene)emitTransition();
    notifyStatus();
  }
  function scheduleOBS(){clearTimeout(obsTimer);if(!stopped&&obsAddress)obsTimer=timer(connectOBS,6000);}
  function connectOBS(){
    clearTimeout(obsTimer);if(stopped||!obsAddress)return;
    if(!/^wss?:\/\/[^/]+/i.test(obsAddress)){status.obs.error='Use a ws:// or wss:// OBS URL';notifyStatus();return;}
    close(obsWS);
    let socket;
    try{socket=new WebSocket(obsAddress);}catch(e){status.obs.error=e.message;scheduleOBS();return;}
    obsWS=socket;status.obs.connected=false;notifyStatus();
    socket.addEventListener('message',event=>{
      if(obsWS!==socket)return;
      let packet;try{packet=JSON.parse(event.data);}catch{return;}
      if(packet.op===0){
        let authentication;
        if(packet.d?.authentication){
          if(!obsPassword){status.obs.error='OBS password missing from Docker environment';socket.close();notifyStatus();return;}
          const secret=crypto.createHash('sha256').update(obsPassword+packet.d.authentication.salt).digest('base64');
          authentication=crypto.createHash('sha256').update(secret+packet.d.authentication.challenge).digest('base64');
        }
        socket.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:4,...(authentication?{authentication}:{})}}));
      }else if(packet.op===2){
        status.obs.connected=true;status.obs.error='';notifyStatus();
        socket.send(JSON.stringify({op:6,d:{requestId:crypto.randomUUID(),requestType:'GetSceneList'}}));
      }else if(packet.op===7&&packet.d?.requestType==='GetSceneList'){
        if(!packet.d.requestStatus?.result){status.obs.error=packet.d.requestStatus?.comment||'Could not read OBS scenes';notifyStatus();return;}
        status.obs.scenes=(packet.d.responseData?.scenes||[]).map(s=>s.sceneName).filter(Boolean);
        setOBSScene(packet.d.responseData?.currentProgramSceneName,true);
        notifyStatus();
      }else if(packet.op===5&&packet.d?.eventType==='CurrentProgramSceneChanged'){
        setOBSScene(packet.d.eventData?.sceneName);
      }else if(packet.op===5&&packet.d?.eventType==='SceneListChanged'){
        status.obs.scenes=(packet.d.eventData?.scenes||[]).map(s=>s.sceneName).filter(Boolean);notifyStatus();
      }
    });
    socket.addEventListener('error',()=>{if(obsWS===socket){status.obs.error='OBS connection failed';notifyStatus();}});
    socket.addEventListener('close',()=>{if(obsWS!==socket)return;status.obs.connected=false;notifyStatus();scheduleOBS();});
  }
  function scheduleTwitch(){clearTimeout(twitchTimer);if(!stopped&&tokens&&clientId)twitchTimer=timer(()=>startTwitch().catch(e=>{status.twitch.error=e.message;notifyStatus();scheduleTwitch();}),12000);}
  function handleTwitchNotification(packet){
    const id=packet.metadata?.message_id;
    if(!id||seen.has(id))return;
    seen.add(id);if(seen.size>1000)seen.delete(seen.values().next().value);
    if(getSettings().twitchAlertsEnabled===false)return;
    const evt=packet.payload?.event||{},kind=packet.payload?.subscription?.type;
    const name=String(evt.user_name||evt.user_login||evt.from_broadcaster_user_name||'Anonymous').slice(0,65);
    let title='',detail='';
    if(kind==='channel.follow')title='NEW FOLLOWER';
    else if(kind==='channel.subscribe'){title='NEW SUBSCRIBER';detail=evt.tier==='3000'?'Tier 3':evt.tier==='2000'?'Tier 2':'Subscriber';}
    else if(kind==='channel.raid'){title='INCOMING RAID';detail=String(evt.viewers||0)+' viewers';}
    else if(kind==='channel.cheer'){title='BITS CHEER';detail=String(evt.bits||0)+' Bits';}
    else return;
    emit('twitch-alert',{id,kind,title,viewer:name,detail});
  }
  async function subscribe(sessionId,broadcasterId){
    const authorization=await freshToken();
    const configs=[
      {type:'channel.follow',version:'2',condition:{broadcaster_user_id:broadcasterId,moderator_user_id:broadcasterId}},
      {type:'channel.subscribe',version:'1',condition:{broadcaster_user_id:broadcasterId}},
      {type:'channel.raid',version:'1',condition:{to_broadcaster_user_id:broadcasterId}},
      {type:'channel.cheer',version:'1',condition:{broadcaster_user_id:broadcasterId}}
    ];
    const results=await Promise.all(configs.map(async entry=>{
      try{
        const r=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{'Client-Id':clientId,Authorization:'Bearer '+authorization,'Content-Type':'application/json'},body:JSON.stringify({...entry,transport:{method:'websocket',session_id:sessionId}}),signal:AbortSignal.timeout(8000)});
        return {type:entry.type,ok:r.ok||r.status===409,status:r.status};
      }catch(e){return {type:entry.type,ok:false,error:e.message};}
    }));
    status.twitch.subscriptions=results.filter(r=>r.ok).map(r=>r.type);
    const failed=results.filter(r=>!r.ok);
    status.twitch.error=failed.length?'Failed subscriptions: '+failed.map(r=>r.type).join(', '):'';
    notifyStatus();
  }
  async function startTwitch(url='wss://eventsub.wss.twitch.tv/ws',reconnecting=false){
    clearTimeout(twitchTimer);
    if(stopped||!tokens||!clientId||!clientSecret)return;
    await freshToken();
    const data=await helixGet('/users');
    const user=data.data?.[0];if(!user)throw Error('Twitch user not available');
    status.twitch.user=user.display_name||user.login;notifyStatus();
    const socket=new WebSocket(url),old=twitchWS;
    twitchWS=socket;
    if(!reconnecting)close(old);
    socket.addEventListener('message',async event=>{
      if(twitchWS!==socket)return;
      let packet;try{packet=JSON.parse(event.data);}catch{return;}
      const type=packet.metadata?.message_type;
      if(type==='session_welcome'){
        status.twitch.connected=true;notifyStatus();
        if(reconnecting){close(old);return;}
        try{await subscribe(packet.payload.session.id,user.id);}
        catch(e){status.twitch.error=e.message;notifyStatus();}
      }else if(type==='notification')handleTwitchNotification(packet);
      else if(type==='session_reconnect'){
        const target=packet.payload?.session?.reconnect_url;
        if(target&&target.startsWith('wss://eventsub.wss.twitch.tv/'))startTwitch(target,true).catch(e=>{status.twitch.error=e.message;notifyStatus();});
      }else if(type==='revocation'){status.twitch.error='Twitch revoked an event subscription';notifyStatus();}
    });
    socket.addEventListener('error',()=>{if(twitchWS===socket){status.twitch.error='Twitch EventSub connection failed';notifyStatus();}});
    socket.addEventListener('close',()=>{if(twitchWS!==socket)return;status.twitch.connected=false;notifyStatus();scheduleTwitch();});
  }
  async function beginTwitchAuth(){
    if(!clientId||!clientSecret||!redirectUri)throw Error('Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and TWITCH_REDIRECT_URI in Docker');
    oauthState=crypto.randomBytes(32).toString('hex');oauthExpiry=Date.now()+10*60*1000;
    const params=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'moderator:read:followers channel:read:subscriptions bits:read',state:oauthState,force_verify:'true'});
    return 'https://id.twitch.tv/oauth2/authorize?'+params;
  }
  async function finishTwitchAuth(url,res){
    if(!oauthState||Date.now()>oauthExpiry||url.searchParams.get('state')!==oauthState)throw Error('Twitch OAuth state expired or invalid');
    oauthState=null;oauthExpiry=0;
    if(url.searchParams.get('error'))throw Error('Twitch authorization denied');
    const code=url.searchParams.get('code');
    if(!code)throw Error('Missing Twitch authorization code');
    const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri});
    const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',body,signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error('Twitch OAuth exchange rejected '+r.status);
    saveTokens(await r.json());status.twitch.error='';
    startTwitch().catch(e=>{status.twitch.error=e.message;notifyStatus();scheduleTwitch();});
    res.writeHead(302,{Location:'/admin?twitch=connected','Cache-Control':'no-store'});res.end();
  }
  function disconnect(){
    tokens=null;close(twitchWS);twitchWS=null;clearTimeout(twitchTimer);clearTimeout(refreshTimer);
    try{fs.unlinkSync(tokenFile);}catch(e){if(e.code!=='ENOENT')throw e;}
    status.twitch.connected=false;status.twitch.user='';status.twitch.error='';status.twitch.subscriptions=[];notifyStatus();
  }
  function refreshMode(){
    if(!status.obs.scene)return;
    const next=modeForScene(status.obs.scene);
    if(next!==activeMode){activeMode=next;if(getSettings().obsSyncEnabled!==false)emit('scene',{sceneName:status.obs.scene,mode:next});notifyStatus();}
  }
  function handle(req,res,p,url){
    if(!p.startsWith('/api/integrations/'))return false;
    (async()=>{
      if(p==='/api/integrations/twitch-callback'&&req.method==='GET')return finishTwitchAuth(url,res);
      if(p==='/api/integrations/scene'&&req.method==='GET')return respond(res,200,{sceneName:status.obs.scene,mode:getSettings().obsSyncEnabled===false?'gameplay':activeMode});
      if(!authorized(req))return respond(res,401,{error:'Admin password required'});
      if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!=='http://'+req.headers.host&&req.headers.origin!=='https://'+req.headers.host)return respond(res,403,{error:'Cross-origin updates are not allowed'});
      if(p==='/api/integrations/status'&&req.method==='GET')return respond(res,200,summary());
      if(p==='/api/integrations/twitch-connect'&&req.method==='GET')return respond(res,200,{url:await beginTwitchAuth()});
      if(p==='/api/integrations/twitch-disconnect'&&req.method==='POST'){disconnect();return respond(res,200,summary());}
      if(p==='/api/integrations/test-alert'&&req.method==='POST'){
        emit('twitch-alert',{id:crypto.randomUUID(),kind:'test',title:'NEW FOLLOWER',viewer:'ViceCityViewer',detail:'TEST ALERT'});
        return respond(res,200,{ok:true});
      }
      if(p==='/api/integrations/test-transition'&&req.method==='POST'){emitTransition();return respond(res,200,{ok:true});}
      return respond(res,404,{error:'Not found'});
    })().catch(e=>{if(!res.headersSent)respond(res,400,{error:e.message});});
    return true;
  }
  function shutdown(){stopped=true;clearTimeout(obsTimer);clearTimeout(twitchTimer);clearTimeout(refreshTimer);close(obsWS);close(twitchWS);}
  if(obsAddress){obsTimer=timer(connectOBS,1000);}
  if(tokens){twitchTimer=timer(()=>startTwitch().catch(e=>{status.twitch.error=e.message;notifyStatus();scheduleTwitch();}),1000);}
  return {handle,summary,shutdown,modeForScene,refreshMode};
};
