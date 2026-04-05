// service-worker.ts

const CACHE_NAME = "matrix-media-v1";
const MAX_ENTRIES = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Match both legacy (r0) and current (v3) Matrix media endpoints
const MEDIA_PATTERNS = [
    /\/_matrix\/media\/v1\/(download|thumbnail)\//,
    /\/_matrix\/media\/v3\/(download|thumbnail)\//,
    /\/_matrix\/media\/r0\/(download|thumbnail)\//,
];

function isMatrixMedia(url: string): boolean {
    return MEDIA_PATTERNS.some((p) => p.test(url));
}

// ── Install & activate ────────────────────────────────────────

self.addEventListener("install", () => {
    (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener("activate", (e) => {
    const sw = self as unknown as ServiceWorkerGlobalScope;
    // Delete any old cache versions
    (e as ExtendableEvent).waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k !== CACHE_NAME)
                        .map((k) => caches.delete(k))
                )
            )
            .then(() => sw.clients.claim())
    );
});

// ── Fetch ─────────────────────────────────────────────────────

self.addEventListener("fetch", (e) => {
    const event = e as FetchEvent;
    const { request } = event;

    if (request.method !== "GET") return;
    if (!isMatrixMedia(request.url)) return;

    event.respondWith(cacheFirst(request));
});

async function cacheFirst(request: Request): Promise<Response> {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        const cachedAt = cached.headers.get("x-cached-at");
        const age = cachedAt ? Date.now() - Number(cachedAt) : 0;

        // Serve from cache if still fresh
        if (age < MAX_AGE_MS) return cached;

        // Stale — delete and re-fetch
        await cache.delete(request);
    }

    try {
        const response = await fetch(request);

        if (response.ok) {
            await putInCache(cache, request, response.clone());
        }

        return response;
    } catch {
        // Network failed and nothing in cache — propagate the error
        return new Response("Matrix media unavailable offline", {
            status: 503,
            statusText: "Service Unavailable",
        });
    }
}

// Stamp a timestamp header and enforce the LRU entry cap
async function putInCache(
    cache: Cache,
    request: Request,
    response: Response
): Promise<void> {
    // Rebuild the response with our custom timestamp header
    const headers = new Headers(response.headers);
    headers.set("x-cached-at", String(Date.now()));

    const stamped = new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
    });

    await cache.put(request, stamped);
    await evictOldEntries(cache);
}

// Keep the cache under MAX_ENTRIES by evicting the oldest entries first
async function evictOldEntries(cache: Cache): Promise<void> {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;

    // Collect entries with their cached-at timestamp
    const entries = await Promise.all(
        keys.map(async (req) => {
            const res = await cache.match(req);
            const cachedAt = res?.headers.get("x-cached-at");
            return { req, cachedAt: cachedAt ? Number(cachedAt) : 0 };
        })
    );

    // Sort oldest first, delete the overflow
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    const toDelete = entries.slice(0, keys.length - MAX_ENTRIES);
    await Promise.all(toDelete.map(({ req }) => cache.delete(req)));
}
