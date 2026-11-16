import { self } from '$app/service-worker';
import { version } from '$app/env';

// Only the offline page and icons are cached: every Shed page is live data behind sign-in, so pages always come from the network.
const CACHE = `shed-${version}`;
const OFFLINE = ['/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	if (e.request.mode !== 'navigate') return;
	e.respondWith(fetch(e.request).catch(async () => (await caches.match('/offline.html')) ?? Response.error()));
});
