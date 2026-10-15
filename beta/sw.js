const VERSION="1.1.1-b4";
const CORE="tasrifb-"+VERSION;
const FILES=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-180.png"];
self.addEventListener("install",e=>{ e.waitUntil(caches.open(CORE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("tasrifb-")&&k!==CORE&&k!=="tasrifb-fonts").map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET") return;
  if(u.hostname.includes("fonts.googleapis.com")||u.hostname.includes("fonts.gstatic.com")){
    e.respondWith(caches.open("tasrifb-fonts").then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n;}))));
    return;
  }
  if(u.origin!==location.origin) return;
  if(!true && u.pathname.includes("/beta/")) return;
  if(e.request.mode==="navigate"){
    const coi=r=>{ if(!r) return r; const h=new Headers(r.headers); h.set("Cross-Origin-Opener-Policy","same-origin"); h.set("Cross-Origin-Embedder-Policy","credentialless"); return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}); };
    e.respondWith(fetch(e.request,{cache:"no-cache"}).then(n=>{ const cp=n.clone(); caches.open(CORE).then(c=>c.put("./index.html",cp)); return coi(n); }).catch(()=>caches.match("./index.html").then(coi)));
    return;
  }
  e.respondWith(fetch(e.request,{cache:"no-cache"}).then(n=>{ const cp=n.clone(); caches.open(CORE).then(c=>c.put(e.request,cp)); return n; }).catch(()=>caches.match(e.request)));
});
