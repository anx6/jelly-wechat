const CACHE='jelly-wechat-v55';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
const isDoc=r=>r.mode==='navigate'||(r.headers.get('accept')||'').indexOf('text/html')>-1;
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  let u; try{ u=new URL(req.url); }catch(_){ return; }
  /* 只接管本站资源。跨源（Supabase REST/Auth）必须完全放行、直连网络：
     Cache API 的 key 只有 URL，匹配时**不看请求头**。一旦把 API 的 GET 响应写进缓存，
     同一个 URL 就永远返回首次那份结果（新消息再也刷不出来），
     而且 A 账号缓存的响应会被 B 账号命中——既丢消息又串数据。 */
  if(u.origin!==self.location.origin) return;
  if(isDoc(req)){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE);
      const fallback=async()=>(await c.match(req))||(await c.match('./index.html'))||(await c.match('./'));
      if(navigator.onLine===false){ const hit=await fallback(); if(hit) return hit; }
      try{
        const ctrl=new AbortController();
        const t=setTimeout(()=>ctrl.abort(),3500);
        const resp=await fetch(req,{signal:ctrl.signal,cache:'no-store'});
        clearTimeout(t);
        if(resp&&resp.ok){ const cp=resp.clone(); c.put('./index.html',cp); return resp; }
        throw new Error('bad-response');
      }catch(err){
        const hit=await fallback();
        if(hit) return hit;
        return new Response('离线中，请联网后重新打开。',{status:503,headers:{'Content-Type':'text/html;charset=utf-8'}});
      }
    })());
    return;
  }
  /* 同源非导航请求只缓存静态资源；其余（含任何未来可能出现的同源接口）一律直连，
     避免同样的“缓存了接口响应”问题换个位置复发 */
  if(!/\.(png|jpe?g|gif|svg|webp|ico|webmanifest|css|js|woff2?|json|txt)$/i.test(u.pathname)) return;
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(resp=>{
    if(resp&&resp.ok){ const cp=resp.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); }
    return resp;
  }).catch(()=>r)));
});

/* ---------- Web Push（FR-1003） ----------
   服务端推来的 payload：{ title, body, conv, msg, tag, url }
   前台静默：应用开着时应用内浮条已经提示过，再弹一条系统通知很吵 */
self.addEventListener('push',e=>{
  let d={};
  try{ d=e.data?e.data.json():{}; }catch(_){ d={body:e.data?e.data.text():''}; }
  e.waitUntil((async()=>{
    try{
      const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      if(cs.some(c=>c.focused||c.visibilityState==='visible')) return;
    }catch(_){}
    try{
      await self.registration.showNotification(d.title||'果冻微信',{
        body:d.body||'你有一条新消息',
        tag:d.tag||'jelly',
        renotify:false,
        icon:'./icons/icon-192.png',
        badge:'./icons/icon-192.png',
        data:{url:d.url||'./',conv:d.conv||null,msg:d.msg||null,moment:d.moment||null}
      });
    }catch(_){}
  })());
});

/* 点通知：优先唤起已打开的窗口并直达目标（会话或那条动态），没有窗口才新开 */
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const data=e.notification.data||{};
  e.waitUntil((async()=>{
    try{
      const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const c of cs){
        try{
          await c.focus();
          if(data.moment) c.postMessage({t:'openMoment',moment:data.moment});
          else if(data.conv) c.postMessage({t:'openConv',conv:data.conv});
          return;
        }catch(_){}
      }
    }catch(_){}
    try{ await self.clients.openWindow(data.url||'./'); }catch(_){}
  })());
});

/* 浏览器换掉订阅时通知页面重订阅（SW 里没有 VAPID 公钥）。
   页面不在也没关系：下次打开 ensurePush 会补 */
self.addEventListener('pushsubscriptionchange',e=>{
  e.waitUntil((async()=>{
    try{
      const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      cs.forEach(c=>{ try{ c.postMessage({t:'pushResub'}); }catch(_){} });
    }catch(_){}
  })());
});
