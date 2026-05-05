const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
    // CORS heads
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const targetUrlRaw = urlParams.searchParams.get('url');
    if (!targetUrlRaw) { res.writeHead(400); res.end('Missing url'); return; }

    const targetUrl = decodeURIComponent(targetUrlRaw).replace(/^webcal:\/\//i, 'https://');
    let referer = "";
    try { const p = new URL(targetUrl); referer = `${p.protocol}//${p.host}/`; } catch(e){}

    const request = https.get(targetUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/calendar, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            ...(referer ? { "Referer": referer } : {})
        }
    }, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
             res.writeHead(response.statusCode, { 'Content-Type': response.headers['content-type'] || 'text/plain' });
             res.end(body);
        });
    });
    request.on('error', (e) => { res.writeHead(500); res.end(e.message); });
});
server.listen(3001, () => "Proxy on 3001");
