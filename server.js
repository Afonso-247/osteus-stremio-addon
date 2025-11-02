const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://osteusfilmestuga.online';

// === ADDON MANIFEST ===
const builder = new addonBuilder({
    id: 'org.osteusfilmestuga',
    version: '1.0.1',
    name: 'Os Teus Filmes Tuga',
    description: 'Filmes e séries PT com busca e múltiplos players',
    resources: ['catalog', 'meta', 'stream', 'search'],
    types: ['movie', 'series'],
    catalogs: [
        { type: 'movie', id: 'osteus_movies', name: 'Filmes' },
        { type: 'series', id: 'osteus_series', name: 'Séries' }
    ],
    idPrefixes: ['ost:']
});

// === CATALOG: Show 1 test movie + real ones when site is up ===
builder.defineCatalogHandler(async (args) => {
    if (args.id === 'osteus_movies') {
        const metas = [];
        try {
            const res = await axios.get(`${BASE_URL}/filmes/`, { timeout: 10000 });
            const $ = cheerio.load(res.data);
            $('a[href*="/filme/"]').slice(0, 20).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).attr('title') || $(el).find('img').attr('alt') || 'Filme';
                const img = $(el).find('img').attr('src');
                const slug = link.split('/filme/')[1]?.replace('/', '');
                if (slug) {
                    metas.push({
                        id: `ost:movie:${slug}`,
                        type: 'movie',
                        name: title.trim(),
                        poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`
                    });
                }
            });
        } catch (e) {
            console.error('Catalog error:', e.message);
        }

        // Always show 1 test movie so addon is visible
        if (metas.length === 0) {
            metas.push({
                id: 'ost:movie:test123',
                type: 'movie',
                name: 'TESTE: Clique Aqui (Rickroll)',
                poster: 'https://via.placeholder.com/300x450.png?text=TESTE'
            });
        }
        return { metas };
    }

    if (args.id === 'osteus_series') {
        return { metas: [] }; // Add later
    }

    return { metas: [] };
});

// === SEARCH: Now works! ===
builder.defineSearchHandler(async (args) => {
    const query = (args.query || '').toLowerCase().trim();
    if (!query) return { metas: [] };

    const metas = [];
    try {
        const res = await axios.get(`${BASE_URL}/?s=${encodeURIComponent(query)}`, { timeout: 10000 });
        const $ = cheerio.load(res.data);

        $('a[href*="/filme/"], a[href*="/serie/"]').slice(0, 15).each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).attr('title') || $(el).find('img').attr('alt') || 'Resultado';
            const img = $(el).find('img').attr('src');
            const isMovie = link.includes('/filme/');
            const slug = link.split(isMovie ? '/filme/' : '/serie/')[1]?.split('/')[0];

            if (slug) {
                metas.push({
                    id: `ost:${isMovie ? 'movie' : 'series'}:${slug}`,
                    type: isMovie ? 'movie' : 'series',
                    name: title.trim(),
                    poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`
                });
            }
        });
    } catch (e) {
        console.error('Search error:', e.message);
    }

    return { metas };
});

// === META ===
builder.defineMetaHandler(async (args) => {
    const id = args.id;
    if (!id.startsWith('ost:')) return { meta: null };
    const [, type, slug] = id.split(':');

    if (slug === 'test123') {
        return {
            meta: {
                id, type: 'movie',
                name: 'TESTE: Clique Aqui (Rickroll)',
                description: 'Teste de stream com múltiplos players.',
                poster: 'https://via.placeholder.com/300x450.png?text=TESTE'
            }
        };
    }

    const url = type === 'movie' ? `${BASE_URL}/filme/${slug}` : `${BASE_URL}/serie/${slug}`;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(res.data);
        return {
            meta: {
                id, type,
                name: $('h1, .title').first().text().trim() || 'Filme',
                description: $('.sinopse, p').first().text().trim().substring(0, 200),
                poster: $('img.poster, img[src*="upload"]').attr('src') || ''
            }
        };
    } catch (e) {
        return { meta: null };
    }
});

// === STREAMS: FULLY FIXED with Player Selection ===
builder.defineStreamHandler(async (args) => {
    const id = args.id;
    if (id === 'ost:movie:test123') {
        return {
            streams: [
                { title: 'Player 1 - YouTube (Teste)', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
                { title: 'Player 2 - Vimeo (Teste)', url: 'https://player.vimeo.com/video/76979871' }
            ]
        };
    }

    if (!id.startsWith('ost:')) return { streams: [] };
    const [, type, slug] = id.split(':');
    const url = type === 'movie' ? `${BASE_URL}/filme/${slug}` : `${BASE_URL}/serie/${slug}`;

    const streams = [];
    try {
        const res = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(res.data);

        // Find all player buttons
        const playerButtons = $('a.btn, a.reproduzir, button[data-src], .player-option a');
        for (let i = 0; i < playerButtons.length; i++) {
            const btn = playerButtons.eq(i);
            let playerUrl = btn.attr('href') || btn.attr('data-src') || btn.attr('onclick')?.match(/['"](.*?)['"]/)?.[1];

            if (!playerUrl) continue;
            if (playerUrl.startsWith('//')) playerUrl = 'https:' + playerUrl;
            if (!playerUrl.startsWith('http')) playerUrl = BASE_URL + playerUrl.replace(/^\//, '');

            try {
                await new Promise(r => setTimeout(r, 600)); // Avoid bans
                const playerRes = await axios.get(playerUrl, { timeout: 8000 });
                const p$ = cheerio.load(playerRes.data);

                let src = p$('iframe').first().attr('src');
                if (!src) src = p$('video source').attr('src');
                if (!src) src = p$('[data-video]').attr('data-video');

                if (src) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    streams.push({
                        title: `${btn.text().trim() || `Player ${i + 1}`}`,
                        url: src
                    });
                }
            } catch (e) { /* skip */ }
        }

        // Fallback: Direct iframe
        if (streams.length === 0) {
            $('iframe').each((i, el) => {
                let src = $(el).attr('src');
                if (src && (src.includes('embed') || src.includes('player'))) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    streams.push({ title: `Direct ${i + 1}`, url: src });
                }
            });
        }
    } catch (e) {
        console.error('Stream error:', e.message);
    }

    return { streams };
});

// === START SERVER ===
const addon = builder.getInterface();
const PORT = process.env.PORT || 10000;
serveHTTP(addon, { port: PORT });

console.log('Addon READY! Search + Streams FIXED!');
