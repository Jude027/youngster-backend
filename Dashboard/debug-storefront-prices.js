/**
 * debug-storefront-prices.js
 * Temporarily replace storefront-prices.js with this to see exactly
 * what is happening at every step. Open browser DevTools → Console.
 * Remove after fixing.
 */

(function () {
    const API = 'http://localhost:5000/api';

    async function run() {
        console.group('%c[storefront-prices DEBUG]', 'color:orange;font-weight:bold');

        // ── Step 1: What context do we have? ─────────────────────────────────
        const p          = new URLSearchParams(window.location.search);
        const store      = p.get('store')  || localStorage.getItem('storeSlug')  || '';
        const clientType = p.get('client') || localStorage.getItem('clientType') || '';

        console.log('URL params:',      Object.fromEntries(p.entries()));
        console.log('localStorage storeSlug:', localStorage.getItem('storeSlug'));
        console.log('localStorage clientType:', localStorage.getItem('clientType'));
        console.log('Resolved store:', store);
        console.log('Resolved clientType:', clientType);

        if (!store)      { console.error('❌ No store slug found — referral link missing ?store= and localStorage empty'); console.groupEnd(); return; }
        if (!clientType) { console.error('❌ No clientType found — referral link missing ?client= and localStorage empty'); console.groupEnd(); return; }

        // ── Step 2: Bundle select ─────────────────────────────────────────────
        const bundleSelect = document.getElementById('bundle');
        if (!bundleSelect) { console.error('❌ No #bundle select found on page'); console.groupEnd(); return; }

        let pageProvider = null;
        for (const opt of bundleSelect.options) {
            const net = opt.getAttribute('data-network');
            if (net) { pageProvider = net.trim(); break; }
        }
        console.log('Detected page provider (from data-network):', pageProvider);
        if (!pageProvider) { console.error('❌ No data-network attribute found on any <option>'); console.groupEnd(); return; }

        // ── Step 3: API call ──────────────────────────────────────────────────
        const url = `${API}/storefront-prices?store=${encodeURIComponent(store)}&clientType=${encodeURIComponent(clientType)}`;
        console.log('Fetching:', url);

        let allPrices = [];
        try {
            const res = await fetch(url);
            console.log('Response status:', res.status);
            const text = await res.text();
            console.log('Raw response body:', text);

            if (!res.ok) {
                console.error('❌ API returned error:', res.status, text);
                console.groupEnd();
                return;
            }

            try {
                allPrices = JSON.parse(text);
            } catch (e) {
                console.error('❌ Response is not valid JSON:', text);
                console.groupEnd();
                return;
            }
        } catch (err) {
            console.error('❌ Fetch failed (network error / CORS / wrong port?):', err);
            console.groupEnd();
            return;
        }

        console.log('All prices from API:', allPrices);

        // ── Step 4: Provider filtering ────────────────────────────────────────
        const providerPrices = allPrices.filter(
            p => p.provider.trim().toLowerCase() === pageProvider.toLowerCase()
        );
        console.log(`Prices matching provider "${pageProvider}":`, providerPrices);

        if (!providerPrices.length) {
            console.warn('⚠️ No prices matched this provider. Providers in API response:', [...new Set(allPrices.map(p => p.provider))]);
            console.groupEnd();
            return;
        }

        // ── Step 5: Build GB map ──────────────────────────────────────────────
        const gbToPrice = {};
        for (const entry of providerPrices) {
            const m = String(entry.packageName).match(/^(\d+(?:\.\d+)?)/);
            if (m) gbToPrice[m[1]] = parseFloat(entry.price);
            else console.warn('⚠️ Could not extract GB number from packageName:', entry.packageName);
        }
        console.log('GB → Price map:', gbToPrice);

        // ── Step 6: Patch options ─────────────────────────────────────────────
        console.log('Bundle options before patch:');
        for (const opt of bundleSelect.options) {
            if (!opt.value) continue;
            console.log(`  option value="${opt.value}" text="${opt.textContent.trim()}" data-price="${opt.getAttribute('data-price')}"`);
        }

        for (const opt of bundleSelect.options) {
            if (!opt.value) continue;
            const gb = opt.value;
            if (Object.prototype.hasOwnProperty.call(gbToPrice, gb)) {
                const price = gbToPrice[gb].toFixed(2);
                opt.setAttribute('data-price', price);
                opt.textContent = `${gb} GB - ${price} GHS`;
                opt.style.display = '';
                opt.disabled = false;
                console.log(`  ✅ Patched option ${gb} GB → ${price} GHS`);
            } else {
                opt.style.display = 'none';
                opt.disabled = true;
                console.log(`  ⚠️ Hidden option ${gb} GB (no price set)`);
            }
        }

        console.log('%c✅ Patch complete', 'color:green;font-weight:bold');
        console.groupEnd();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(run, 0));
    } else {
        setTimeout(run, 0);
    }
})();
