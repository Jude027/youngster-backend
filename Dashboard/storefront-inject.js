// storefront-inject.js
// Runs after dashboard.js on dashboard2.html.
// When the page is visited via a referral link (/referral/<slug>),
// fetches the dealer's StoreSettings from the public API and
// injects their branding — store name, description, logo, WhatsApp links —
// into the existing dashboard IDs.
// When visited normally (no slug), does nothing — defaults remain.

const STOREFRONT_API = 'http://localhost:5000/api';

// ─── Detect slug ──────────────────────────────────────────────────────────────
// Supports:
//   /referral/kwame-data-hub          (Express serves dashboard2.html here)
//   /dashboard2.html?store=kwame-data-hub  (fallback for static hosting)
function detectStoreSlug() {
    // 1. Query string: ?store=<slug> (works on all sub-pages)
    const params = new URLSearchParams(window.location.search);
    if (params.get('store')) return params.get('store');
    // 2. Path: /referral/<slug>
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[parts.length - 2] === 'referral') return parts[parts.length - 1];
    if (parts[0] === 'referral' && parts.length >= 2) return parts[1];
    return null;
}

// ─── Capture referral context ─────────────────────────────────────────────────
// When a customer arrives via a referral link like:
//   dashboard2.html?store=youngster-data-shop&client=Customers
// we immediately persist both values to localStorage so every bundle page
// (mtn.html, telecel.html, etc.) can read clientType without it ever
// appearing in their URLs.
(function captureReferralContext() {
    const params     = new URLSearchParams(window.location.search);
    const store      = params.get('store') || detectStoreSlug();
    const clientType = params.get('client');
    if (store)      localStorage.setItem('storeSlug',  store);
    if (clientType) localStorage.setItem('clientType', clientType);
})();

// ─── Apply branding ───────────────────────────────────────────────────────────
function applyStoreBranding(store) {
    const {
        storeName         = '',
        storeDescription  = '',
        storeLogo         = '',
        whatsappGroupLink = '',
        whatsappNumber    = ''
    } = store;

    if (storeName) {
        document.title = storeName;
        const el = document.getElementById('headerStoreName');
        if (el) el.textContent = storeName;
        const sb = document.getElementById('sidebarTitle');
        if (sb) sb.textContent = storeName;
        const ft = document.getElementById('footerStoreName');
        if (ft) ft.textContent = storeName;
    }

    if (storeDescription) {
        const el = document.getElementById('headerStoreDesc');
        if (el) el.textContent = storeDescription;
    }

    // Sidebar logo — image if available, else coloured initial
    const logoEl = document.getElementById('sidebarLogo');
    if (logoEl) {
        if (storeLogo) {
            logoEl.innerHTML = `<img src="${storeLogo}" alt="${storeName} Logo"
                style="width:100%;height:100%;object-fit:contain;border-radius:6px;">`;
        } else if (storeName) {
            logoEl.innerHTML = `<span style="
                font-size:18px;font-weight:700;color:#6a11cb;
                width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                ${storeName.charAt(0).toUpperCase()}
            </span>`;
        }
    }

    // WhatsApp group link
    const waGroup = document.getElementById('waGroupLink');
    if (waGroup) {
        if (whatsappGroupLink) {
            waGroup.href = whatsappGroupLink;
        } else {
            waGroup.style.display = 'none';
        }
    }

    // WhatsApp admin / reseller number
    const waNumber = whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}` : null;
    const waAdmin = document.getElementById('waAdminLink');
    if (waAdmin) {
        if (waNumber) waAdmin.href = waNumber;
        else waAdmin.style.display = 'none';
    }
    const resellerLink = document.getElementById('resellerLink');
    if (resellerLink && waNumber) resellerLink.href = waNumber;

    // Update dashboard menu link to preserve store slug across sub-pages
    const dashboardLink = document.getElementById('dashboardMenuLink');
    if (dashboardLink) {
        const slugToUse = store.storeSlug || '';
        if (slugToUse) dashboardLink.href = `/Dashboard/dashboard2?store=${encodeURIComponent(slugToUse)}`;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const slug = detectStoreSlug();
    if (!slug) return; 

    try {
        // Added ?t= timestamp to destroy any browser memory/cache of the old details
        const res = await fetch(`${STOREFRONT_API}/storefront/${encodeURIComponent(slug)}?t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (!res.ok) {
            console.warn(`Storefront: no store found for slug "${slug}"`);
            return;
        }
        const store = await res.json();
        
        // If the dealer modified the store name, redirect automatically to the new URL path
        if (store.storeSlug && store.storeSlug !== slug) {
            if (window.location.pathname.includes('/referral/')) {
                window.location.replace(`/referral/${store.storeSlug}${window.location.search}`);
                return;
            }
        }
        
        applyStoreBranding(store);

        // ── Patch all bundle-page links on the dashboard to carry ?store= ──
        // This ensures mtn.html, telecel.html etc. know which dealer's prices
        // to load. clientType flows via localStorage (set above), so it never
        // appears in these sub-page URLs.
        // Note: handlePackageCardClick links use onclick= and href="#" — those
        // are handled inside dashboard.js which reads store/client from
        // localStorage directly. Only patch real href links here.
        const resolvedSlug = store.storeSlug || slug;
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            // Skip anchor-only, external, and already-patched links
            if (!href || href === '#' || href.startsWith('http') || href.includes('?store=')) return;
            // Only target relative links to .html pages
            if (!href.includes('.html')) return;
            const sep = href.includes('?') ? '&' : '?';
            a.setAttribute('href', href + sep + 'store=' + encodeURIComponent(resolvedSlug));
        });

    } catch (err) {
        console.error('Storefront inject error:', err);
    }
});