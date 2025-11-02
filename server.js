const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://osteusfilmestuga.online';

const builder = new addonBuilder({
    id: 'org.osteusfilmestuga',
    version: '1.0.0',
    name: 'Os Teus Filmes Tuga',
    description: 'Filmes e séries em português',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        { type: 'movie', id: 'osteus_movies', name: 'Filmes' },
        { type: 'series', id: 'osteus_series', name: 'Séries' }
    ],
    idPrefixes: ['ost:']
});

builder.defineCatalogHandler(async (args) => {
    if (args.id === 'osteus_movies') {
        try {
            const res = await axios.get(`${BASE_URL}/filmes/`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(res.data);
            const metas = [];
            $('a[href*="/filme/"]').slice(0, 30).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).attr('title') || $(el).find('img').attr('alt') || 'Sem título';
                const img = $(el).find('img').attr('src');
                const slug = link.split('/filme/')[1]?.replace('/', '');
                if (slug && title !== 'Sem título') {
                    metas.push({
                        id: `ost:movie:${slug}`,
                        type: 'movie',
                        name: title.trim(),
                        poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`
                    });
                }
            });
            return { metas };
        } catch (e) { console.error(e); return { metas: [] }; }
    }

    if (args.id === 'osteus_series') {
        try {
            const res = await axios.get(`${BASE_URL}/series/`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(res.data);
            const metas = [];
            $('a[href*="/serie/"]').slice(0, 30).each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).attr('title') || $(el).find('img').attr('alt') || 'Sem título';
                const img = $(el).find('img').attr('src');
                const slug = link.split('/serie/')[1]?.replace('/', '');
                if (slug && title !== 'Sem título') {
                    metas.push({
                        id: `ost:series:${slug}`,
                        type: 'series',
                        name: title.trim(),
                        poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`
                    });
                }
            });
            return { metas };
        } catch (e) { console.error(e); return { metas: [] }; }
    }

    return { metas: [] };
});

builder.defineMetaHandler(async (args) => {
    const id = args.id;
    if (!id.startsWith('ost:')) return { meta: null };
    const [, type, slug] = id.split(':');
    const url = type === 'movie' ? `${BASE_URL}/filme/${slug}` : `${BASE_URL}/serie/${slug}`;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        const title = $('h1, .title, title').first().text().trim() || 'Sem título';
        const description = $('.sinopse, .description, p').first().text().trim();
        const poster = $('img.poster, img[src*="upload"]').attr('src');
        return {
            meta: {
                id, type: type === 'movie' ? 'movie' : 'series',
                name: title, description,
                poster: poster?.startsWith('http') ? poster : `${BASE_URL}${poster}`
            }
        };
    } catch (e) { console.error(e); return { meta: null }; }
});

builder.defineStreamHandler(async (args) => {
    const id = args.id;
    if (!id.startsWith('ost:')) return { streams: [] };
    const [, type, slug] = id.split(':');
    const url = type === 'movie' ? `${BASE_URL}/filme/${slug}` : `${BASE_URL}/serie/${slug}`;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        const streams = [];
        $('iframe').each((i, el) => {
            let src = $(el).attr('src');
            if (!src) return;
            if (src.startsWith('//')) src = 'https:' + src;
            if (!src.startsWith('http')) src = BASE_URL + src;
            if (src.includes('player') || src.includes('embed') || src.includes('video')) {
                streams.push({
                    title: `Stream ${i + 1} - ${new URL(src).hostname}`,
                    url: src
                });
            }
        });
        return { streams: streams.length > 0 ? streams : [] };
    } catch (e) { console.error(e); return { streams: [] }; }
});

const addon = builder.getInterface();
const PORT = process.env.PORT || 10000; // Render uses 10000
serveHTTP(addon, { port: PORT });

console.log('Addon running on Render!');
