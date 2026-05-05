export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url parameter" });

    // Convert webcal:// → https://
    const fetchUrl = decodeURIComponent(url).replace(/^webcal:\/\//i, "https://");

    // Extract the host from the URL to use as Referer (some Schoology instances
    // check that the request comes from a known origin)
    let referer = "";
    try {
        const parsed = new URL(fetchUrl);
        referer = `${parsed.protocol}//${parsed.host}/`;
    } catch (_) {}

    try {
        const response = await fetch(fetchUrl, {
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/calendar, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                ...(referer ? { "Referer": referer } : {}),
            },
        });

        // Some servers return 200 but serve HTML (login redirect)
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        if (!response.ok) {
            return res.status(502).json({
                error: `Schoology returned HTTP ${response.status}`,
                details: "The calendar feed URL may have expired. Re-generate it in Schoology.",
            });
        }

        if (
            text.trimStart().startsWith("<html") ||
            text.trimStart().startsWith("<!DOCTYPE") ||
            contentType.includes("text/html")
        ) {
            return res.status(422).json({
                error: "Schoology returned a login page instead of calendar data.",
                details: "Re-generate your iCal link in Schoology: Calendar → Subscribe → Private Link.",
                preview: text.substring(0, 120).replace(/<[^>]*>/g, " ").trim(),
            });
        }

        if (!text.includes("BEGIN:VCALENDAR")) {
            return res.status(422).json({
                error: "Response is not a valid iCal file.",
                details: "Make sure you copied the full webcal:// or https:// URL from Schoology.",
            });
        }

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.status(200).send(text);
    } catch (error) {
        console.error("Schoology proxy error:", error);
        res.status(500).json({ error: "Proxy fetch failed", details: error.message });
    }
}

