var CACHE_NAME="notevault-v1";
var CACHE_URLS=[
  "./",
  "./index.html",
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
];

self.addEventListener("install",function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(CACHE_URLS.map(function(url){
        return cache.add(url).catch(function(err){
          console.warn("SW: failed to cache",url,err);
        });
      }));
    }).then(function(){return self.skipWaiting();})
  );
});

self.addEventListener("activate",function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
    }).then(function(){return self.clients.claim();})
  );
});

self.addEventListener("fetch",function(e){
  if(e.request.method!=="GET")return;
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached)return cached;
      return fetch(e.request).then(function(response){
        if(!response||response.status!==200||response.type!=="basic"){
          return response;
        }
        var clone=response.clone();
        caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,clone);});
        return response;
      }).catch(function(){
        return caches.match("./index.html");
      });
    })
  );
});