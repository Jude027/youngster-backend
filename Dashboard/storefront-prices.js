/**
 * storefront-prices.js
 * Fetches the dealer's saved referral prices for this customer's client type
 * and populates/patches the bundle dropdown on package pages.
 *
 * Must be the LAST <script> tag in the page (after storefront-inject.js).
 *
 * How it works:
 *   1. Reads ?provider= from URL — set by handlePackageCardClick in dashboard.js
 *      (e.g. "MTN", "MTN EXPRESS", "Telecel", "AT Ishare", "AT Bigtime", "MTN AFA")
 *   2. Reads store slug from ?store= (URL) or localStorage.storeSlug
 *   3. Reads client type from ?client= (URL) or localStorage.clientType
 *   4. Fetches matching prices from /api/storefront-prices
 *   5. Builds dropdown options from those prices
 *      — If the dropdown already has options, patches their data-price
 *      — If empty (just a placeholder), builds options from scratch
 *   6. Hides any bundle size that has no price set by the dealer
 */

(function () {

    const API = 'http://localhost:5000/api';

    // Validity labels per provider — shown in the bundle details panel
    const VALIDITY = {
        'mtn':         '90 days',
        'telecel':     '60 days',
        'at ishare':   'Non Expiry',
        'at bigtime':  'Non Expiry',
        'mtn afa':     'Lifetime',
    };

    function getContext() {
        const p = new URLSearchParams(window.location.search);
        return {
            store:      p.get('store')    || localStorage.getItem('storeSlug')  || '',
            clientType: p.get('client')   || localStorage.getItem('clientType') || '',
            provider:   p.get('provider') || localStorage.getItem('providerName') || '',   // e.g. "MTN", "MTN EXPRESS"
        };
    }

    function getValidity(provider) {
        return VALIDITY[provider.toLowerCase()] || '—';
    }

    // Normalize provider name: trim, lowercase, and collapse multiple spaces
    function normalizeProviderName(name) {
        return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    // Build GB→price map from API response filtered to the requested provider
    function buildGbMap(allPrices, provider) {
        const providerNorm = normalizeProviderName(provider);
        
        // 1. Exact match (normalised) — fastest, most accurate
        let matching = allPrices.filter(p => 
            normalizeProviderName(p.provider) === providerNorm
        );

        // 2. Prefix match: DB entry is a shorter form of the requested provider.
        //    e.g. DB stores "AT" but the page requests "AT Bigtime"
        if (matching.length === 0) {
            matching = allPrices.filter(p => {
                const dbNorm = normalizeProviderName(p.provider);
                // "at bigtime".startsWith("at ") → true, but won't cross-match siblings
                return providerNorm.startsWith(dbNorm + ' ');
            });
        }

        // 3. Specific-keyword fallback: use the LONGEST word in the provider name.
        //    This prevents "at bigtime" from falling back to the generic keyword "at"
        //    and accidentally matching "at ishare" prices (and vice-versa).
        //    Only words longer than 2 chars are considered — short words like "at"
        //    are too ambiguous when multiple providers share the same prefix.
        if (matching.length === 0) {
            const words = providerNorm.split(' ').filter(w => w.length > 2);
            // Sort longest → shortest; pick the most distinctive word
            const specificWord = words.sort((a, b) => b.length - a.length)[0]
                              || providerNorm.split(' ')[0]; // last resort: first word
            matching = allPrices.filter(p => 
                normalizeProviderName(p.provider).includes(specificWord)
            );
        }

        const gbToPrice = {};
        for (const entry of matching) {
            // packageName is stored as e.g. "1 GB", "2 GB" — extract leading number
            const m = String(entry.packageName).match(/(\d+(?:\.\d+)?)/);
            if (m) gbToPrice[m[1]] = parseFloat(entry.price);
        }
        return gbToPrice;
    }

    // Patch existing options (dropdown pre-populated with hardcoded options)
    function patchExistingOptions(bundleSelect, gbToPrice, provider) {
        for (const opt of bundleSelect.options) {
            if (!opt.value) continue;
            const gb = opt.value; // "1", "2", "3" or possibly "1 GB"
            // Match by numeric prefix so "1 GB" and "1" both hit the same map entry
            const numKey = String(gb).match(/^(\d+(?:\.\d+)?)/)?.[1];
            const price  = gbToPrice[gb] !== undefined ? gbToPrice[gb]
                         : (numKey && gbToPrice[numKey] !== undefined ? gbToPrice[numKey] : undefined);
            if (price !== undefined) {
                const label = numKey ? `${numKey} GB` : gb; // normalise to "1 GB"
                opt.value    = label; // full label — picked up by submitOrder as bundle_size
                opt.setAttribute('data-price',    price.toFixed(2));
                opt.setAttribute('data-validity',  getValidity(provider));
                opt.setAttribute('data-network',   provider);
                opt.textContent  = `${label} - ${price.toFixed(2)} GHS`;
                opt.style.display = '';
                opt.disabled      = false;
            } else {
                opt.style.display = 'none';
                opt.disabled      = true;
            }
        }
    }

    // Build options from scratch (dropdown was empty — just placeholder)
    function buildOptionsFromScratch(bundleSelect, gbToPrice, provider) {
        // Remove all non-placeholder options first
        while (bundleSelect.options.length > 1) bundleSelect.remove(1);

        const sizes = Object.keys(gbToPrice).sort((a, b) => parseFloat(a) - parseFloat(b));

        if (sizes.length === 0) {
            const empty = document.createElement('option');
            empty.value    = '';
            empty.textContent = 'No bundles available';
            empty.disabled = true;
            bundleSelect.appendChild(empty);
            return;
        }

        sizes.forEach((gb, i) => {
            const price = gbToPrice[gb].toFixed(2);
            const label = `${gb} GB`; // full label e.g. "1 GB"
            const opt   = document.createElement('option');
            opt.value   = label;       // full label stored as value — used by submitOrder
            opt.setAttribute('data-price',    price);
            opt.setAttribute('data-validity',  getValidity(provider));
            opt.setAttribute('data-network',   provider);
            opt.textContent = `${label} - ${price} GHS`;
            bundleSelect.appendChild(opt);
        });
    }

    // Refresh the bundle details panel to show the currently selected option's price
    function refreshDetailsPanel(bundleSelect) {
        const priceEl    = document.getElementById('bundlePrice');
        const sizeEl     = document.getElementById('bundleSize');
        const validityEl = document.getElementById('bundleValidity');
        const networkEl  = document.getElementById('bundleNetwork');
        if (!priceEl) return;

        const sel = bundleSelect.options[bundleSelect.selectedIndex];
        if (sel && sel.value) {
            if (priceEl)    priceEl.textContent    = (sel.getAttribute('data-price')    || '—') + ' GHS';
            if (sizeEl)     sizeEl.textContent     = sel.value; // value is already full label e.g. '1 GB'
            if (validityEl) validityEl.textContent = sel.getAttribute('data-validity')  || '—';
            if (networkEl)  networkEl.textContent  = sel.getAttribute('data-network')   || '—';
        }
    }

    async function run() {
        const { store, clientType, provider } = getContext();

        // Nothing to do if no store context or no provider
        if (!store || !provider) {
            console.warn('[storefront-prices] Missing store or provider context', { store, provider });
            return;
        }

        // If no clientType, default to 'Customers' for referral visits
        const resolvedClientType = clientType || 'Customers';

        const bundleSelect = document.getElementById('bundle');
        if (!bundleSelect) {
            console.warn('[storefront-prices] bundle dropdown not found');
            return;
        }

        // Fetch all prices for this store + client type
        let allPrices = [];
        try {
            const res = await fetch(
                `${API}/storefront-prices` +
                `?store=${encodeURIComponent(store)}` +
                `&clientType=${encodeURIComponent(resolvedClientType)}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            allPrices = await res.json();
        } catch (err) {
            console.warn('[storefront-prices] fetch failed:', err);
            return;
        }

        console.log('[storefront-prices] Loaded for store:', store, '| clientType:', resolvedClientType);
        console.log('[storefront-prices] Provider being matched:', provider);
        console.log('[storefront-prices] All available prices from API:', allPrices);
        console.log('[storefront-prices] Available providers in API response:', [...new Set(allPrices.map(p => p.provider))]);
        console.log(
            allPrices
                .filter(p => p.provider.toLowerCase().includes('at'))
                .map(p => ({
                provider: p.provider,
                packageName: p.packageName,
                price: p.price
            }))
        );
        const gbToPrice = buildGbMap(allPrices, provider);
        console.log('[storefront-prices] Built price map:', gbToPrice);

        if (Object.keys(gbToPrice).length === 0) {
            console.warn('[storefront-prices] ⚠️ No prices found for provider:', provider, 
                'This means the provider name might not match exactly, or no prices have been set for this provider');
            // Show a helpful message to the user
            const placeholder = bundleSelect.options[0];
            if (placeholder) {
                placeholder.textContent = 'No prices available - Contact seller';
                placeholder.disabled = false;
            }
            return;
        }

        // Decide whether to patch existing options or build from scratch
        const hasExistingOptions = Array.from(bundleSelect.options).some(o => o.value);
        if (hasExistingOptions) {
            patchExistingOptions(bundleSelect, gbToPrice, provider);
        } else {
            buildOptionsFromScratch(bundleSelect, gbToPrice, provider);
        }

        // Refresh details panel if something is already selected
        refreshDetailsPanel(bundleSelect);

        // Keep details panel in sync on every change
        bundleSelect.addEventListener('change', () => refreshDetailsPanel(bundleSelect));
    }

    // Run after DOM is ready, deferred slightly so storefront-inject.js
    // (which sets localStorage.storeSlug/clientType) has time to complete
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(run, 100));
    } else {
        setTimeout(run, 100);
    }

})();