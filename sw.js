// Сервис-воркер: всё приложение лежит в кэше, сеть не нужна.
// Меняя любой файл, поднимите VERSION — старый кэш снимется при активации.

const VERSION = 'loosen-11'
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './bell.js',
  './words.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

// `cache: 'reload'` обязателен: иначе файлы берутся из HTTP-кэша браузера, и новый кэш
// собирается из старых копий — хостинг отдаёт их с запасом в несколько минут.
self.addEventListener('install', (event) => {
  const fresh = ASSETS.map((url) => new Request(url, { cache: 'reload' }))
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((cache) => cache.put(request, copy))
            }
            return res
          })
          .catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    ),
  )
})
