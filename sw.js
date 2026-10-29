const CACHE='jelly-wechat-v9';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
const isDoc=r=>r.mode==='navigate'||(r.headers.get('accept')||'').indexOf('text/html')>-1;
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
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
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(resp=>{
    const cp=resp.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); return resp;
  }).catch(()=>r)));
});
