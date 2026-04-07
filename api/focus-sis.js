export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { baseUrl, username, password } = req.body;
        if (!baseUrl || !username || !password) {
            return res.status(400).json({ error: 'Missing baseUrl, username, or password' });
        }

        const focusUrl = baseUrl.endsWith('/focus/') ? baseUrl : baseUrl.replace(/\/?$/, '/focus/');

        // Step 1: Get a session cookie
        const initRes = await fetch(focusUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            redirect: 'manual',
        });

        const initCookies = initRes.headers.getSetCookie?.() || [];
        const sessionCookie = initCookies.find(c => c.startsWith('PHPSESSID='));
        if (!sessionCookie) {
            return res.status(502).json({ error: 'Could not establish session with Focus SIS.' });
        }
        const phpSessionId = sessionCookie.split(';')[0];

        // Collect all cookies from init
        const allInitCookies = initCookies.map(c => c.split(';')[0]).join('; ');

        // Step 2: Login via POST (same format as Focus SIS login.js formHandler)
        const loginData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const loginRes = await fetch(focusUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': allInitCookies,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': focusUrl,
            },
            body: `login=true&data=${encodeURIComponent(loginData)}`,
            redirect: 'manual',
        });

        let loginBody;
        try { loginBody = await loginRes.json(); } catch { loginBody = null; }

        if (!loginBody?.success) {
            const errMsg = loginBody?.error || 'Login failed. Check your credentials.';
            return res.status(401).json({ error: errMsg });
        }

        // Collect session cookies after login
        const loginCookies = loginRes.headers.getSetCookie?.() || [];
        const updatedCookies = [...initCookies, ...loginCookies].map(c => c.split(';')[0]);
        const cookieStr = [...new Set(updatedCookies)].join('; ');

        // Step 3: Fetch the grades page
        const gradesUrl = `${focusUrl}Modules.php?modname=Grades/StudentGBGrades.php`;
        const gradesRes = await fetch(gradesUrl, {
            method: 'GET',
            headers: {
                'Cookie': cookieStr,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': focusUrl,
            },
            redirect: 'follow',
        });

        const gradesHtml = await gradesRes.text();

        // If redirected to login page, session didn't stick
        if (gradesHtml.includes('login-html') || gradesHtml.includes('login_page')) {
            return res.status(401).json({ error: 'Session expired. Please try again.' });
        }

        return res.status(200).json({ html: gradesHtml });
    } catch (error) {
        console.error('Focus SIS Proxy Error:', error);
        return res.status(500).json({
            error: 'Failed to connect to Focus SIS',
            details: error.message,
        });
    }
}
