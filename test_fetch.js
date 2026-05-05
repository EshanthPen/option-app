const url = "https://lms.fcps.edu/calendar/feed/ical/1771968965/5aaf2ce578d7e8e4cc982356ec29ede7/ical.ics";
(async () => {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/calendar, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://lms.fcps.edu/"
            }
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Content-Type:", res.headers.get("content-type"));
        console.log("Body length:", text.length);
        console.log("Preview:", text.substring(0, 300));
    } catch (e) {
        console.error(e);
    }
})();
