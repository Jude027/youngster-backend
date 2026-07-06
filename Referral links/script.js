// referral links page – connected to backend API
const API_BASE = 'http://localhost:5000/api';

// ─── Auth helpers ────────────────────────────────────────────────────────────
function authHeaders() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../Registration form/login_and_signup.html';
        return false;
    }
    return true;
}

/**
 * Wrapper for fetch() that automatically detects 401 responses and logs out the user.
 * If the token has expired or is invalid, this will clear localStorage and redirect to login.
 */
async function authFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // If we get a 401 (Unauthorized), the token is invalid/expired
        if (response.status === 401) {
            console.warn('[Auth] Received 401 - token expired. Logging out...');
            localStorage.clear();
            showNotification('Your session has expired. Please log in again.', 'error');
            setTimeout(() => {
                window.location.href = '../Registration form/login_and_signup.html';
            }, 1500);
            return null;
        }
        
        return response;
    } catch (err) {
        console.error('[authFetch] Network error:', err);
        throw err;
    }
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function initializeTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.checked = currentTheme === 'dark';
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const newTheme = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.checked = newTheme === 'dark';
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function initializeSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar) return;
    const openSidebar  = () => { sidebar.classList.add('open');    overlay?.classList.add('open'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay?.classList.remove('open'); };
    menuBtn.addEventListener('click', openSidebar);
    closeBtn?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
    document.querySelectorAll('.menu-item:not(#ordersMenu)').forEach(i => i.addEventListener('click', closeSidebar));
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to log out?')) {
            localStorage.clear();
            showNotification('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = '../Registration form/login_and_signup.html';
            }, 1500);
        }
    });
}

// ─── Toast notification ───────────────────────────────────────────────────────
function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `notification-global notification-${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i><span>${message}</span>`;
    Object.assign(toast.style, {
        position: 'fixed', top: '20px', right: '20px', padding: '12px 20px',
        borderRadius: '8px', background: type === 'success' ? '#4CAF50' : '#2196F3',
        color: 'white', zIndex: '10000', animation: 'fadeIn 0.3s'
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ─── Current user ─────────────────────────────────────────────────────────────
let currentUser = null;

// ─── IMPORTANT: set this to your actual production domain ─────────────────────
// This is the base URL used to build referral links.
// Referral links open dashboard2.html with a ?store= query param.
// storefront-inject.js reads the slug from the query string and injects the dealer's branding.
// e.g. 'https://youngsterdatashop.com/Dashboard/dashboard2?store=kwame-data-hub'
const referralBaseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? window.location.origin + '/Dashboard/dashboard2?store='   // local dev
    : 'https://youngsterdatashop.com/Dashboard/dashboard2?store=';     // ← replace with your real domain

async function loadCurrentUser() {
    try {
        const res = await fetch(`${API_BASE}/me`, { headers: authHeaders(), cache: 'no-store' });
        if (res.ok) {
            currentUser = await res.json();
            localStorage.setItem('user', JSON.stringify(currentUser));
        }
    } catch (err) {
        console.error('Failed to load user:', err);
    }
}

async function loadReferralBalance() {
    const balanceEl = document.getElementById('commissionEarnedValue');
    if (!balanceEl) return;

    try {
        const res = await authFetch(`${API_BASE}/balance`, { headers: authHeaders(), cache: 'no-store' });
        if (!res || !res.ok) {
            balanceEl.textContent = 'GHS 0.00';
            return;
        }

        const data = await res.json();
        const availableBalance = Number(data.availableBalance || 0);
        balanceEl.textContent = `GHS ${availableBalance.toFixed(2)}`;
    } catch (err) {
        console.error('Failed to load referral balance:', err);
        balanceEl.textContent = 'GHS 0.00';
    }
}

function formatDateLabel(date) {
    if (!date) return 'No orders yet';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderReferralList(listId, referrals, emptyText) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    if (!Array.isArray(referrals) || referrals.length === 0) {
        listEl.innerHTML = `<li style="padding:12px 0;color:#6b7280;">${emptyText}</li>`;
        return;
    }

    listEl.innerHTML = referrals.map(ref => {
        const label = ref.label || 'Anonymous referral';
        const orderCount = ref.orderCount || 0;
        const lastOrder = ref.lastOrder ? formatDateLabel(ref.lastOrder) : 'No recent order';
        return `
            <li style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                    <span style="font-weight:700;color:#111827;">${label}</span>
                    <span style="font-size:0.92rem;color:#6b7280;">${orderCount} order${orderCount === 1 ? '' : 's'}</span>
                </div>
                <div style="margin-top:6px;font-size:0.92rem;color:#4b5563;">Last order: ${lastOrder}</div>
            </li>`;
    }).join('');
}

async function loadReferralMetrics() {
    const totalEl = document.getElementById('totalReferralsValue');
    const activeStatEl = document.getElementById('activeReferralsValue');
    const inactiveStatEl = document.getElementById('inactiveReferralsValue');
    const referredCountEl = document.getElementById('referredUsersCount');

    try {
        const res = await authFetch(`${API_BASE}/referral-metrics`, { headers: authHeaders(), cache: 'no-store' });
        if (!res || !res.ok) {
            if (totalEl) totalEl.textContent = '0';
            if (activeStatEl) activeStatEl.textContent = '0';
            if (inactiveStatEl) inactiveStatEl.textContent = '0';
            if (referredCountEl) referredCountEl.textContent = '(0)';
            renderReferralList('activeReferralsList', [], 'No active referrals yet.');
            renderReferralList('inactiveReferralsList', [], 'No inactive referrals yet.');
            return;
        }

        const data = await res.json();
        if (totalEl) totalEl.textContent = String(data.totalReferrals || 0);
        if (activeStatEl) activeStatEl.textContent = String(data.activeReferrals || 0);
        if (inactiveStatEl) inactiveStatEl.textContent = String(data.inactiveReferrals || 0);
        if (referredCountEl) referredCountEl.textContent = `(${data.totalReferrals || 0})`;

        renderReferralList('activeReferralsList', data.activeReferralsList || [], 'No active referrals in the last 30 days.');
        renderReferralList('inactiveReferralsList', data.inactiveReferralsList || [], 'No inactive referrals yet.');
    } catch (err) {
        console.error('Failed to load referral metrics:', err);
        if (totalEl) totalEl.textContent = '0';
        if (activeStatEl) activeStatEl.textContent = '0';
        if (inactiveStatEl) inactiveStatEl.textContent = '0';
        if (referredCountEl) referredCountEl.textContent = '(0)';
        renderReferralList('activeReferralsList', [], 'No active referrals in the last 30 days.');
        renderReferralList('inactiveReferralsList', [], 'No inactive referrals yet.');
    }
}

/**
 * Build the referral link.
 * Uses the store slug when available (e.g. "jd-youngster-enterprise"),
 * falling back to the raw user ID only if no slug could be derived.
 */
function buildReferralLink(storeSlugOrId, clientType) {
    const base = referralBaseUrl + (storeSlugOrId || 'unknown');
    return clientType ? base + '&client=' + encodeURIComponent(clientType) : base;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (err) {
        console.error(err);
        return false;
    }
}

async function copyReferralLink(linkTextEl, copyBtn) {
    // Display shows only the slug; the full URL is stored in data-copy-url
    const fullUrl = linkTextEl.dataset.copyUrl || linkTextEl.textContent;
    const success = await copyToClipboard(fullUrl);
    if (success) {
        showNotification('Referral link copied!', 'success');
        if (copyBtn) {
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
        }
        linkTextEl.classList.add('copied');
        setTimeout(() => linkTextEl.classList.remove('copied'), 2000);
    } else {
        showNotification('Failed to copy', 'error');
    }
}

// ─── Copy button wiring (called after DOM is built) ───────────────────────────
function setupCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const section  = btn.closest('.referral-section');
            const linkText = section?.querySelector('.link-text') || document.querySelector('.link-text');
            if (linkText) await copyReferralLink(linkText, btn);
        });
    });

    document.querySelectorAll('.link-text').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', async function () {
            const section = this.closest('.referral-section');
            const copyBtn = section?.querySelector('.copy-btn');
            await copyReferralLink(this, copyBtn);
        });
    });
}

// ─── Referral link sections ───────────────────────────────────────────────────
/**
 * Fetch the user's permittedClientTypes and storeSlug from the backend.
 * Returns { permittedClientTypes: string[], storeSlug: string }.
 * Includes retry logic for transient network failures.
 */
async function loadPermittedClientTypes(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/my-permitted-client-types`, { headers: authHeaders(), cache: 'no-store' });
            if (!res.ok) {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 500 * attempt));
                    continue;
                }
                return { permittedClientTypes: [], storeSlug: '' };
            }
            const data = await res.json();
            return {
                permittedClientTypes: Array.isArray(data.permittedClientTypes) ? data.permittedClientTypes : [],
                storeSlug: data.storeSlug || ''
            };
        } catch (err) {
            console.error(`Attempt ${attempt}/${retries} - Failed to load permitted client types:`, err);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }
    console.error('All retries failed for loadPermittedClientTypes');
    return { permittedClientTypes: [], storeSlug: '' };
}

/**
 * Descriptive captions per client type.
 * Add an entry here whenever a new client type is created in the admin panel
 * to give it a friendly subtitle on the referral links page.
 * If a type has no entry here, a generic caption is used — so new types work
 * automatically without requiring changes to this file.
 */
const CLIENT_TYPE_CAPTIONS = {
    'Super-Agents': 'Share with your super-agents. They sell — you earn!',
    'Agents':       'Share with your agents. They sell — you earn!',
    'Customers':    'Share your link. When someone buys through it, you earn commissions automatically.',
    'Retailers':    'Share with retailers. Every sale through your link earns you a commission.',
    'Resellers':    'Share with resellers. They grow your network — you earn on every order.',
    'Sub-Dealers':  'Share with your sub-dealers. The bigger their sales, the more you earn.',
};

function captionFor(clientType) {
    return CLIENT_TYPE_CAPTIONS[clientType]
        || `Share this link with your ${clientType}. Every purchase earns you a commission.`;
}

/**
 * Build and inject one `.referral-section` block per permitted client type.
 * Each section shows a TinyURL short link — fully clickable, domain hidden.
 * Clears any existing static sections in `#referralLinksContainer` first.
 *
 * HTML structure expected in dealers_referral_program.html:
 *   <div id="referralLinksContainer"></div>
 */
function renderReferralLinkSections(permittedTypes, storeSlug) {
    const container = document.getElementById('referralLinksContainer');
    if (!container) return;

    container.innerHTML = ''; // clear previous / static content

    if (!permittedTypes || permittedTypes.length === 0) {
        container.innerHTML = `
            <div class="no-links-notice" style="text-align:center;padding:32px 16px;background:#fef9c3;border:1px solid #fcd34d;border-radius:6px;color:#854d0e;">
                <i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:8px;display:block;"></i>
                <p><strong>No referral link types available yet.</strong><br>
                Contact the administrator to enable referral types for your account, or <button onclick="document.getElementById('refreshLinksBtn')?.click()" style="padding:6px 12px;background:#854d0e;color:white;border:none;border-radius:4px;cursor:pointer;margin-left:8px;margin-top:8px;display:inline-block;">try again</button></p>
            </div>`;
        return;
    }

    // Render one section per permitted client type
    // Each link gets its own &client= param so storefront-prices.js knows
    // which price column to load when the customer opens a bundle page.
    permittedTypes.forEach(clientType => {
        const fullLink = buildReferralLink(storeSlug, clientType);
        const section = document.createElement('div');
        section.className = 'referral-section';
        section.dataset.clientType = clientType;
        section.innerHTML = `
            <h3 class="referral-title">${escapeHtml(clientType)} Referral Link</h3>
            <div class="referral-link">
                <span class="link-text" data-copy-url="${escapeHtml(fullLink)}">
                    <a href="${escapeHtml(fullLink)}" target="_blank" rel="noopener noreferrer"
                        style="color:inherit;text-decoration:underline;word-break:break-all;"
                    >${escapeHtml(fullLink)}</a>
                </span>
                <button class="copy-btn"><i class="fas fa-copy"></i> Copy</button>
            </div>
            <p>${escapeHtml(captionFor(clientType))}</p>`;
        container.appendChild(section);
    });

    // Wire copy buttons now that the DOM is fully populated
    setupCopyButtons();
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

// ─── Main init ────────────────────────────────────────────────────────────────
async function initializeAndLoadLinks() {
    const container = document.getElementById('referralLinksContainer');
    if (container) {
        container.innerHTML = '<div style="text-align:center;padding:24px;opacity:.5;"><i class="fas fa-spinner fa-spin"></i> Loading your referral links...</div>';
    }

    // Load user first, then permitted types in parallel
    await loadCurrentUser();

    const { permittedClientTypes, storeSlug } = await loadPermittedClientTypes();

    // Load live balance and referral metrics for the dashboard.
    await loadReferralBalance();
    await loadReferralMetrics();

    // Render the correct link sections based on admin-configured permissions.
    renderReferralLinkSections(permittedClientTypes, storeSlug);
}

function addRefreshButton() {
    const container = document.getElementById('referralLinksContainer');
    if (!container) return;

    // Check if refresh button already exists
    if (document.getElementById('refreshLinksBtn')) return;

    const headerSection = document.querySelector('.description') || container.parentElement;
    if (!headerSection) return;

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshLinksBtn';
    refreshBtn.className = 'refresh-button';
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Links';
    refreshBtn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        margin: 12px 0;
        background: #3498db;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.95rem;
        transition: all 0.3s;
    `;

    refreshBtn.addEventListener('mouseenter', function() {
        this.style.background = '#2980b9';
    });
    refreshBtn.addEventListener('mouseleave', function() {
        this.style.background = '#3498db';
    });

    refreshBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        refreshBtn.disabled = true;
        const origText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';

        await initializeAndLoadLinks();

        refreshBtn.innerHTML = origText;
        refreshBtn.disabled = false;
        showNotification('Links refreshed!', 'success');
    });

    // Insert button after description
    const description = document.querySelector('.description');
    if (description && description.nextSibling) {
        description.parentNode.insertBefore(refreshBtn, description.nextSibling);
    } else if (headerSection) {
        headerSection.appendChild(refreshBtn);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    initializeTheme();
    initializeSidebar();
    initializeLogout();

    // Theme toggle binding
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // Add refresh button
    addRefreshButton();

    // Load and display links
    await initializeAndLoadLinks();
});