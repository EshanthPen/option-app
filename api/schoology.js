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
                "User-Agent": "Mozilla/5.0 (compatible; OptionApp/1.0)",
            },
        });

        if (!response.ok) {
            throw new Error(`Schoology returned ${response.status}`);
        }

        const text = await response.text();
        res.status(200).send(text);
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).json({ error: "Failed to proxy request", details: error.message });
    }
}
