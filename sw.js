const VERSION="1.0.6";
const CORE="tasrif-"+VERSION;
const FILES=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-180.png"];
self.addEventListener("install",e=>{ e.waitUntil(caches.open(CORE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CORE&&k!=="tasrif-fonts").map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET") return;
  if(u.hostname.includes("fonts.googleapis.com")||u.hostname.includes("fonts.gstatic.com")){
    e.respondWith(caches.open("tasrif-fonts").then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n;}))));
    return;
  }
  if(u.origin!==location.origin) return;
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(n=>{ const cp=n.clone(); caches.open(CORE).then(c=>c.put("./index.html",cp)); return n; }).catch(()=>caches.match("./index.html")));
    return;
  }
  e.respondWith(fetch(e.request).then(n=>{ const cp=n.clone(); caches.open(CORE).then(c=>c.put(e.request,cp)); return n; }).catch(()=>caches.match(e.request)));
});
