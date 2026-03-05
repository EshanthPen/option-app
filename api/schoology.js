export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
    }

    // Convert webcal:// to https://
    const fetchUrl = decodeURIComponent(url).replace(/^webcal:\/\//i, "https://");

    try {
        const response = await fetch(fetchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/calendar,text/plain,*/*",
            },
        });

        if (!response.ok) {
            throw new Error(`Schoology returned ${response.status}`);
        }

        const text = await response.text();
        const contentType = response.headers.get("content-type") || "";

        if (text.includes('<html') || text.includes('<!DOCTYPE html') || contentType.includes("text/html")) {
            console.error("Schoology returned HTML instead of ICS. First 200 chars:", text.substring(0, 200));
            return res.status(422).json({
                error: "Schoology returned a webpage instead of calendar data.",
                details: "This usually means the link is private/expired or you are being redirected to a login page. Ensure you use the 'Private Link' from Schoology.",
                preview: text.substring(0, 100).replace(/<[^>]*>/g, '').trim()
            });
        }

        res.status(200).send(text);
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).json({ error: "Failed to proxy request", details: error.message });
    }
}
