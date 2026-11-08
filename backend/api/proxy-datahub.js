// Vercel proxy for DataHub verification.
// Render cannot reach user.datahubgh.com directly (IP blocked).
// Render calls this endpoint, Vercel forwards it to DataHub.
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

    const { phoneNumber, isPortedNumber, apiKey, baseUrl, networkKey } = req.body || {};
    if (!phoneNumber || !apiKey || !baseUrl) {
        return res.status(400).json({ error: 'phoneNumber, apiKey and baseUrl are required' });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(`${baseUrl}/purchases/verify-number`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                phone: phoneNumber,
                is_ported_number: isPortedNumber === true
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

        return res.status(response.status).json(data);
    } catch (error) {
        const timedOut = error?.name === 'AbortError';
        return res.status(503).json({
            success: false,
            code: timedOut ? 'DATAHUB_TIMEOUT' : 'DATAHUB_UNAVAILABLE',
            message: timedOut ? 'DataHub timed out.' : error.message
        });
    }
};
