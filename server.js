// === STREAMS: Now Handles Player Selection ===
builder.defineStreamHandler(async (args) => {
    const id = args.id;
    if (!id.startsWith('ost:')) return { streams: [] };
    const [, type, slug] = id.split(':');
    const url = type === 'movie' ? `${BASE_URL}/filme/${slug}` : `${BASE_URL}/serie/${slug}`;

    try {
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        const streams = [];

        // Step 1: Find player buttons/links (common selectors — adjust if needed)
        const playerSelectors = [
            'a[href*="/player/"]',           // Direct player pages
            '.player-btn a',                 // Buttons with links
            'button[data-player]',           // JS buttons
            '.opciones iframe',              // Embedded options
            '.reproduzir a'                  // Portuguese "Play" buttons
        ];

        let playerLinks = [];
        playerSelectors.forEach(selector => {
            $(selector).each((i, el) => {
                let href = $(el).attr('href') || $(el).attr('data-player') || $(el).data('src');
                if (href && !playerLinks.includes(href)) {
                    playerLinks.push(href);
                }
            });
        });

        // Step 2: For each player link, fetch the actual stream URL
        for (let i = 0; i < Math.min(playerLinks.length, 5); i++) {  // Limit to 5 players
            let playerUrl = playerLinks[i];
            if (playerUrl.startsWith('//')) playerUrl = 'https:' + playerUrl;
            if (!playerUrl.startsWith('http')) playerUrl = BASE_URL + playerUrl;

            try {
                // Small delay to avoid bans
                await new Promise(r => setTimeout(r, 500));

                const playerRes = await axios.get(playerUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const player$ = cheerio.load(playerRes.data);

                // Extract iframe/video src from player page
                let streamUrl = '';
                player$.find('iframe[src]').each((j, iframe) => {
                    streamUrl = player$(iframe).attr('src') || player$(iframe).data('src');
                    if (streamUrl && (streamUrl.includes('embed') || streamUrl.includes('player') || streamUrl.includes('video'))) {
                        return false;  // Take first good one
                    }
                });

                if (!streamUrl) {
                    // Fallback: Look for video tags or direct embeds
                    streamUrl = player$('video source[src]').attr('src') || player$('[data-video-url]').attr('data-video-url');
                }

                if (streamUrl) {
                    if (streamUrl.startsWith('//')) streamUrl = 'https:' + streamUrl;
                    if (!streamUrl.startsWith('http')) streamUrl = BASE_URL + streamUrl;

                    streams.push({
                        title: `Player ${i + 1} - ${$(playerLinks[i]).text().trim().substring(0, 20) || 'HD'}`,
                        url: streamUrl,
                        behaviorHints: { bingeGroup: `player-${slug}` }  // Group for seamless switching
                    });
                }
            } catch (playerErr) {
                console.error(`Player ${i} fetch error:`, playerErr.message);
                // Skip bad players
            }
        }

        // Fallback: Original direct iframe scrape (if no players found)
        if (streams.length === 0) {
            $('iframe').each((i, el) => {
                let src = $(el).attr('src');
                if (!src) return;
                if (src.startsWith('//')) src = 'https:' + src;
                if (!src.startsWith('http')) src = BASE_URL + src;
                if (src.includes('player') || src.includes('embed') || src.includes('video')) {
                    streams.push({
                        title: `Direct Stream ${i + 1}`,
                        url: src
                    });
                }
            });
        }

        return { streams: streams.length > 0 ? streams : [] };
    } catch (e) {
        console.error('Stream error:', e.message);
        return { streams: [] };
    }
});
