export default async function handler(req, res) {
    // Enable CORS preflight for browser clients
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { targetUrl, soapPayload } = req.body;

        if (!targetUrl || !soapPayload) {
            return res.status(400).json({ error: 'Missing targetUrl or soapPayload' });
        }

        // Older StudentVUE servers often reject requests without a standard User-Agent 
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://edupoint.com/webservices/ProcessWebServiceRequest',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Accept': '*/*, text/xml',
                'Connection': 'keep-alive'
            },
            body: soapPayload
        });

        const xmlText = await response.text();

        // Vercel Serverless automatically applies CORS headers if configured in vercel.json, 
        // but we can explicitly set them here just to be safe.
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');

        return res.status(200).send(xmlText);
    } catch (error) {
        console.error('Serverless Proxy Error:', error);
        return res.status(500).json({
            error: 'Failed to proxy request to StudentVUE',
            details: error.message,
            cause: error.cause ? error.cause.message : 'No detailed cause',
            stack: error.stack
        });
    }
}
