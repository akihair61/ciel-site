// Ciel site service worker (2026-11-05): HTML はネット優先（値段は常に最新・落ちたらキャッシュ）、画像/CSS/JS/フォントは stale-while-revalidate。
// 動画・連番画像(seq_full)・/apps/・/tools/・data(JSON) はキャッシュしない。
const V='ciel-site-v1';
const PRE=['/','/manifest.json'];
const SKIP=/^\/(seq_full|apps|tools|data|gallery)\//;
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==location.origin||SKIP.test(u.pathname)||/\.(mp4|webm|mov|json|xml|txt)$/.test(u.pathname)||r.headers.has('range'))return;
  if(r.mode==='navigate'||r.destination==='document'){
    e.respondWith(fetch(r).then(res=>{if(res.ok&&res.type==='basic'){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('/'))));
    return;
  }
  if(/\.(jpg|jpeg|png|webp|avif|svg|css|js|woff2?)$/.test(u.pathname)){
    e.respondWith(caches.open(V).then(async c=>{
      const m=await c.match(r);
      const net=fetch(r).then(res=>{if(res.ok&&res.type==='basic')c.put(r,res.clone());return res;}).catch(()=>m);
      return m||net;
    }));
  }
});
