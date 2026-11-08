// Vercel proxy for DataMart verification.
// Render cannot reach api.datamartgh.shop directly (IP blocked).
// Render calls this endpoint, Vercel forwards it to DataMart.
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Secret');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Simple shared secret so only your Render backend can use this proxy
    const proxySecret = process.env.PROXY_SECRET || '';
    if (proxySecret && req.headers['x-proxy-secret'] !== proxySecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phoneNumber, apiKey, baseUrl } = req.body || {};
    if (!phoneNumber || !apiKey || !baseUrl) {
        return res.status(400).json({ error: 'phoneNumber, apiKey and baseUrl are required' });
    }

    console.log('[DataMart Proxy] Forwarding request:', {
        baseUrl,
        phoneSuffix: String(phoneNumber).slice(-4)
    });

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}/verify-number`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ phoneNumber }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const text = await response.text();
        console.log('[DataMart Proxy] DataMart response:', {
            status: response.status,
            contentType: response.headers.get('content-type'),
            body: text.slice(0, 300)
        });

        let data;
        try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

        return res.status(response.status).json(data);
    } catch (error) {
        const timedOut = error?.name === 'AbortError';
        console.error('[DataMart Proxy] Error:', {
            timedOut,
            message: error.message,
            code: error?.code || null
        });
        return res.status(503).json({
            success: false,
            code: timedOut ? 'DATAMART_TIMEOUT' : 'DATAMART_UNAVAILABLE',
            message: timedOut ? 'DataMart timed out.' : error.message
        });
    }
};
