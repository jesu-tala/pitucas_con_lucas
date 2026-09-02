/**
 * Pitucas sin lucas — service worker de notificaciones push.
 * ---------------------------------------------------------------------------
 * Este archivo va sin cambios a la raíz del sitio (junto a index.html), y Cloudflare Pages
 * lo sirve tal cual. Su único trabajo es recibir el push que manda el Worker
 * (cloudflare-worker/worker.js) y mostrarlo como una notificación del sistema — no toca tus
 * datos, no cachea nada, no hace nada más que esto.
 */

self.addEventListener('push', function(event){
  var data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){}
  var title = data.title || 'Pitucas sin lucas';
  var options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
      for(var i=0;i<list.length;i++){
        var client = list[i];
        if(client.url.indexOf(url)>=0 && 'focus' in client) return client.focus();
      }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});
