/**
 * GET /api/storefront-prices
 * Public endpoint — no auth token needed.
 *
 * Query params:
 *   store      — required  — dealer's storeSlug
 *   clientType — optional  — if provided, filters prices to that client type
 *                            if absent, returns ALL prices for the store
 *                            (so links without ?client= still work)
 */
app.get('/api/storefront-prices', async (req, res) => {
    const { store, clientType } = req.query;

    if (!store) {
        return res.status(400).json({ error: 'store param is required' });
    }

    try {
        const user = await User.findOne({ storeSlug: store }).lean();
        if (!user) return res.status(404).json({ error: 'Store not found' });

        // Build query — clientType filter is optional
        const query = { userId: user._id };
        if (clientType) query.clientType = clientType;

        const prices = await ReferralPrice.find(query)
            .select('provider packageName price -_id')
            .lean();

        return res.json(prices.filter(p => p.price > 0));

    } catch (err) {
        console.error('[storefront-prices]', err);
        return res.status(500).json({ error: 'Server error' });
    }
});