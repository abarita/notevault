var CACHE_NAME="notevault-v3-live";
var CACHE_URLS=[
  "./",
  "./index.html",
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js",
  "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
];

self.addEventListener("install",function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(CACHE_URLS.map(function(url){
        return cache.add(url).catch(function(err){
          console.warn("SW: failed to cache",url,err);
        });
      }));
    })
  );
});

self.addEventListener("activate",function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
    }).then(function(){return self.clients.claim();})
  );
});

// Network-First with Cache Fallback for always fresh updates
self.addEventListener("fetch",function(e){
  if(e.request.method!=="GET")return;
  var url = new URL(e.request.url);
  if(!url.protocol.startsWith("http"))return;

  e.respondWith(
    fetch(e.request).then(function(response){
      if(response && response.status===200){
        var clone=response.clone();
        caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,clone);});
      }
      return response;
    }).catch(function(){
      return caches.match(e.request).then(function(cached){
        return cached || caches.match("./index.html");
      });
    })
  );
});