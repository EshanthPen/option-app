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

        // Extract the base URL just in case the client hardcoded the wrong suffix
        let baseUrl = targetUrl
            .replace(/\/Service\/PXPCommunication\.asmx$/i, '')
            .replace(/\/SVUE\/Service\/PXPCommunication\.asmx$/i, '')
            .replace(/\/PXP2\/Service\/PXPCommunication\.asmx$/i, '');

        const candidateEndpoints = [
            `${baseUrl}/Service/PXPCommunication.asmx`,
            `${baseUrl}/SVUE/Service/PXPCommunication.asmx`,
            `${baseUrl}/PXP2/Service/PXPCommunication.asmx`
        ];

        let xmlText = '';
        let successfulResponse = null;

        for (const endpoint of candidateEndpoints) {
            try {
                const response = await fetch(endpoint, {
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

                const text = await response.text();
                // A valid SOAP response will rarely start with HTML unless it's an error page (like a 404 or SSO redirect)
                if (!text.trimStart().toLowerCase().startsWith('<!doctype') && !text.trimStart().toLowerCase().startsWith('<html')) {
                    xmlText = text;
                    successfulResponse = response;
                    break;
                }
            } catch (err) {
                console.warn(`Endpoint ${endpoint} failed:`, err.message);
            }
        }

        if (!xmlText) {
            return res.status(502).json({ error: 'Failed to find a valid StudentVUE proxy endpoint for this district.' });
        }

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
