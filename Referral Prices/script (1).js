// Referral Prices page – original prices are now role-specific (from BasePrice via /api/my-original-prices)
const API_BASE = 'http://localhost:5000/api';

function authHeaders() {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function checkAuth() {
    if (!localStorage.getItem('token')) {
        window.location.href = '../Registration-form/login_and_signup.html';
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

// ========== Theme & Sidebar ==========
function initializeTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.removeEventListener('click', themeToggleHandler);
        themeToggle.addEventListener('click', themeToggleHandler);
    }
}
function themeToggleHandler() {
    const cur = document.documentElement.getAttribute('data-theme');
    const newTheme = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) themeIcon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function initializeSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const logoutBtn = document.getElementById('logoutBtn');
    if (!menuBtn || !sidebar) return;
    const openSidebar = () => { sidebar.classList.add('open'); overlay?.classList.add('open'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay?.classList.remove('open'); };
    menuBtn.addEventListener('click', openSidebar);
    closeBtn?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Log out?')) { localStorage.clear(); window.location.href = '../Registration form/login_and_signup.html'; }
        });
    }
    document.querySelectorAll('.menu-item').forEach(i => i.addEventListener('click', closeSidebar));
}

function showNotification(message, type = 'success') {
    const existing = document.querySelector('.notification-global');
    if (existing) existing.remove();
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

// ========== Data Models ==========
let allProviders = [];
let allClientTypes = [];
let originalPrices = [];   // role-specific: [{ provider, packageName, originalPrice }]
let referralPrices = [];
let permittedClientTypes = [];

async function loadUserData() {
    try {
        const res = await fetch(`${API_BASE}/me`, { headers: authHeaders() });
        const user = await res.json();
        permittedClientTypes = user.permittedClientTypes || [];
    } catch (err) { console.error(err); }
}

async function loadClientTypes(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/client-types`, { headers: authHeaders(), cache: 'no-store' });
            let types = await res.json();
            if (!types || types.length === 0) {
                types = ['Dealers', 'Super-agents', 'Agents', 'Sub-agents', 'Customers'];
            }
            allClientTypes = types;
            return;
        } catch (err) {
            console.error(`Attempt ${attempt}/${retries} - Failed to load client types:`, err);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }
    allClientTypes = ['Dealers', 'Super-agents', 'Agents', 'Sub-agents', 'Customers'];
}

async function loadProviders(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/providers`, { headers: authHeaders(), cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                allProviders = data.map(p => ({ name: p.name, logoUrl: p.logoUrl || '' }));
                return;
            } else if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        } catch (err) {
            console.error(`Attempt ${attempt}/${retries} - Failed to load providers:`, err);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }
    // Derive providers from originalPrices as fallback
    if (originalPrices.length) {
        const unique = [...new Set(originalPrices.map(op => op.provider))];
        allProviders = unique.map(name => ({ name, logoUrl: '' }));
    } else {
        console.warn('Failed to load providers after all retries and no fallback available');
    }
}

// KEY CHANGE: load the role-specific original prices instead of master prices.
// The server looks up this user's role, finds the admin-configured BasePrice column,
// and returns [{ provider, packageName, originalPrice }].
// Includes retry logic for transient network failures.
async function loadOriginalPrices(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/my-original-prices`, { headers: authHeaders(), cache: 'no-store' });
            if (res.ok) {
                originalPrices = await res.json();
                return;
            } else if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
                continue;
            }
        } catch (err) {
            console.error(`Attempt ${attempt}/${retries} - Could not load original prices:`, err);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }
    console.warn('Failed to load original prices after all retries');
    originalPrices = [];
}

async function loadReferralPrices(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/referral-prices`, { headers: authHeaders(), cache: 'no-store' });
            referralPrices = await res.json();
            return;
        } catch (err) {
            console.error(`Attempt ${attempt}/${retries} - Failed to load referral prices:`, err);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }
    console.warn('Failed to load referral prices after all retries');
    referralPrices = [];
}

// ========== Build Tables ==========
function buildTables() {
    const container = document.getElementById('dynamicTablesContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!allProviders.length) {
        container.innerHTML = '<div class="alert" style="padding:20px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;color:#991b1b;"><i class="fas fa-exclamation-triangle"></i> No providers found. <button onclick="location.reload()" style="margin-left:10px;padding:6px 12px;background:#991b1b;color:white;border:none;border-radius:4px;cursor:pointer;">Retry</button></div>';
        return;
    }
    if (!allClientTypes.length) {
        container.innerHTML = '<div class="alert" style="padding:20px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;color:#991b1b;"><i class="fas fa-exclamation-triangle"></i> No client types defined. Contact admin.</div>';
        return;
    }
    if (!originalPrices.length) {
        container.innerHTML = '<div class="alert" style="padding:20px;background:#fef9c3;border:1px solid #fcd34d;border-radius:6px;color:#854d0e;"><i class="fas fa-info-circle"></i> No packages are currently available for your account. Please check back later or contact the administrator. <button onclick="location.reload()" style="margin-left:10px;padding:6px 12px;background:#854d0e;color:white;border:none;border-radius:4px;cursor:pointer;">Retry</button></div>';
        return;
    }

    for (let prov of allProviders) {
        const providerName = prov.name;
        // Use originalPrices (role-specific) to determine the package list
        const packages = [...new Set(originalPrices.filter(op => op.provider === providerName).map(op => op.packageName))];
        if (!packages.length) continue;

        const section = document.createElement('div');
        section.className = 'provider-section';

        let headerClass = 'provider-header';
        if (providerName.includes('MTN')) headerClass = 'mtn-header';
        else if (providerName.includes('Telecel')) headerClass = 'telecel-header';

        const headerDiv = document.createElement('div');
        headerDiv.className = headerClass;
        headerDiv.style.cssText = 'display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding:12px 20px;';
        const logoUrl = prov.logoUrl || '';
        headerDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <img src="${logoUrl}" style="width:40px; height:40px; object-fit:contain; border-radius:50%; background:#fff; padding:2px;" onerror="this.style.display='none'">
                <span style="font-weight:600;">${providerName}</span>
            </div>
            <i class="fas fa-chevron-down" style="transition:transform 0.3s;"></i>
        `;

        const tableDiv = document.createElement('div');
        tableDiv.className = 'dynamic-table-container';
        tableDiv.style.display = 'none';

        let tableHtml = `<table class="pricing-table"><thead><tr><th>Package</th><th>Original Price</th>`;
        for (let ct of allClientTypes) {
            tableHtml += `<th><div class="column-header"><div class="column-main">Set Prices (GHS)</div><div class="column-sub">(${ct})</div></div></th>`;
        }
        tableHtml += `</thead><tbody>`;

        for (let pkg of packages) {
            // Look up this package's original price for the current user's role
            const origEntry = originalPrices.find(op => op.provider === providerName && op.packageName === pkg);
            const originalPrice = origEntry ? origEntry.originalPrice.toFixed(2) : '—';

            tableHtml += `<tr>
                <td><div class="package-name">${pkg}</div></td>
                <td class="original-price">GHS ${originalPrice}</td>`;

            for (let ct of allClientTypes) {
                const saved = referralPrices.find(rp => rp.provider === providerName && rp.packageName === pkg && rp.clientType === ct);
                const priceValue = saved ? saved.price : '';
                tableHtml += `<td><div class="price-input-container"><input type="text" class="set-price-input" data-provider="${providerName}" data-package="${pkg}" data-client="${ct}" data-original="${origEntry ? origEntry.originalPrice : 0}" value="${priceValue}" placeholder="Enter price"></div></td>`;
            }
            tableHtml += `</tr>`;
        }
        tableHtml += `</tbody></table>`;
        tableDiv.innerHTML = tableHtml;
        section.appendChild(headerDiv);
        section.appendChild(tableDiv);
        container.appendChild(section);

        headerDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = tableDiv.style.display !== 'none';
            requestAnimationFrame(() => {
                tableDiv.style.display = isVisible ? 'none' : 'block';
                const icon = headerDiv.querySelector('.fa-chevron-down');
                if (icon) icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            });
        });
    }
}

// ========== Column Visibility ==========
function applyColumnVisibility() {
    const visibleTypes = permittedClientTypes.length > 0 ? permittedClientTypes : allClientTypes;
    document.querySelectorAll('.pricing-table').forEach(table => {
        const headers = table.querySelectorAll('thead th');
        for (let i = 2; i < headers.length; i++) {
            const sub = headers[i].querySelector('.column-sub');
            if (!sub) continue;
            const clientType = sub.innerText.replace(/[()]/g, '').trim();
            const shouldHide = !visibleTypes.includes(clientType);
            if (shouldHide) {
                headers[i].classList.add('hidden-col');
                table.querySelectorAll('tbody tr').forEach(row => {
                    if (row.cells[i]) row.cells[i].classList.add('hidden-col');
                });
            } else {
                headers[i].classList.remove('hidden-col');
                table.querySelectorAll('tbody tr').forEach(row => {
                    if (row.cells[i]) row.cells[i].classList.remove('hidden-col');
                });
            }
        }
    });
}

async function refreshAll() {
    await loadUserData();
    await loadClientTypes();
    await loadOriginalPrices();   // role-specific — replaces loadMasterPrices()
    await loadProviders();        // must come before buildTables so new packages appear immediately
    await loadReferralPrices();
    buildTables();
    applyColumnVisibility();
}

// ========== Saving Referral Prices ==========
async function saveAllPrices() {
    let hasError = false;
    document.querySelectorAll('.set-price-input').forEach(inp => {
        if (inp.closest('td')?.classList.contains('hidden-col')) return;
        const val = parseFloat(inp.value);
        const orig = parseFloat(inp.getAttribute('data-original'));
        if (inp.value && !isNaN(val) && orig > 0 && val <= orig) {
            inp.classList.add('error');
            hasError = true;
        } else inp.classList.remove('error');
    });
    if (hasError) {
        showNotification('Prices must be greater than the original price', 'error');
        return false;
    }

    const priceArray = [];
    document.querySelectorAll('.set-price-input').forEach(inp => {
        if (inp.closest('td')?.classList.contains('hidden-col')) return;
        const price = parseFloat(inp.value);
        const orig = parseFloat(inp.getAttribute('data-original'));
        if (!isNaN(price) && price > 0 && (orig === 0 || price > orig)) {
            priceArray.push({
                provider: inp.dataset.provider,
                packageName: inp.dataset.package,
                clientType: inp.dataset.client,
                price,
                originalPrice: orig
            });
        }
    });

    try {
        const res = await fetch(`${API_BASE}/referral-prices/bulk`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ prices: priceArray })
        });
        if (res.ok) {
            showNotification('Prices saved successfully!', 'success');
            return true;
        } else {
            showNotification('Failed to save', 'error');
        }
    } catch (err) {
        showNotification('Network error', 'error');
    }
    return false;
}

// ========== Store Settings & Live Preview ==========
async function loadSellerData() {
    try {
        const res = await fetch(`${API_BASE}/store-settings`, { headers: authHeaders() });
        const settings = await res.json();
        document.getElementById('business-name').value = settings.storeName || '';
        document.getElementById('seller-description').value = settings.storeDescription || '';
        document.getElementById('whatsapp-group-link').value = settings.whatsappGroupLink || '';
        document.getElementById('whatsapp-number').value = settings.whatsappNumber || '';
        const logoPreview = document.getElementById('logo-preview-img');
        if (settings.storeLogo && settings.storeLogo !== 'default-logo.png') {
            logoPreview.src = settings.storeLogo;
            document.getElementById('remove-logo-btn').style.display = 'inline-flex';
        } else {
            const sidebarLogo = document.querySelector('.brand-logo img')?.src;
            logoPreview.src = sidebarLogo || 'default-logo.png';
        }
        updatePreviewBadge();
    } catch (err) { console.error(err); }
}

// ========== Store Slug Refresh ==========
// Fetches the latest storeSlug from the server and updates localStorage.
// If the slug has changed (due to store name update), redirects to the new URL.
// Call this after any successful store settings save.
async function refreshUserStoreSlug() {
    try {
        const res = await fetch(`${API_BASE}/my-permitted-client-types`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (data.storeSlug) {
            // Get the old slug from localStorage
            const stored = localStorage.getItem('user');
            const user = stored ? JSON.parse(stored) : {};
            const oldSlug = user.storeSlug;
            
            // Update with new slug and store name
            user.storeSlug = data.storeSlug;
            user.storeName = data.storeName || user.storeName;
            localStorage.setItem('user', JSON.stringify(user));
            
            // If slug changed, check if we're on a referral page and redirect
            if (oldSlug && oldSlug !== data.storeSlug) {
                const isReferralPage = window.location.pathname.includes('/referral/') ||
                                     new URLSearchParams(window.location.search).get('store');
                if (isReferralPage) {
                    // Redirect to new slug URL
                    window.location.href = `/referral/${encodeURIComponent(data.storeSlug)}`;
                }
            }
        }
    } catch (err) {
        console.warn('refreshUserStoreSlug failed:', err);
    }
}

async function saveSellerData() {
    const storeName = document.getElementById('business-name').value;
    const storeDescription = document.getElementById('seller-description').value;
    const storeLogo = document.getElementById('logo-preview-img').src;
    const whatsappGroupLink = document.getElementById('whatsapp-group-link').value;
    const whatsappNumber = document.getElementById('whatsapp-number').value;
    if (!storeName) { showNotification('Store name required', 'warning'); return false; }
    if (!whatsappNumber) { showNotification('WhatsApp number required', 'warning'); return false; }
    try {
        const res = await fetch(`${API_BASE}/store-settings`, {
            method: 'PUT', headers: authHeaders(),
            body: JSON.stringify({ storeName, storeDescription, storeLogo, whatsappGroupLink, whatsappNumber })
        });
        if (res.ok) {
            showNotification('Store details saved', 'success');
            // Sync slug in DB to match new store name, then refresh localStorage
            await fetch(`${API_BASE}/sync-my-slug`, { headers: authHeaders() });
            await refreshUserStoreSlug();
            return true;
        }
    } catch (err) { console.error(err); }
    return false;
}

// ========== LIVE PREVIEW (keep your existing functions) ==========
function createPreviewSection() {
    const formBody = document.querySelector('.form-body');
    if (!formBody) return;
    if (document.getElementById('seller-preview-section')) return;
    const previewSection = document.createElement('div');
    previewSection.id = 'seller-preview-section';
    previewSection.className = 'seller-badge-preview';
    previewSection.innerHTML = `
        <h4><i class="fas fa-eye"></i> Live Preview – Your Store (Customer View)</h4>
        <div class="customer-preview-wrapper">
            <div class="preview-sidebar">
                <div class="preview-sidebar-header">
                    <div class="preview-sidebar-title" id="preview-sidebar-name">Youngster Data Shop</div>
                    <div class="preview-sidebar-logo"><img src="default-logo.png" alt="Logo" id="preview-sidebar-logo"></div>
                </div>
                <div class="preview-sidebar-menu">
                    <div class="preview-sidebar-item active"><i class="fas fa-tachometer-alt"></i> Dashboard</div>
                    <div class="preview-sidebar-item"><i class="fas fa-shopping-cart"></i> Orders</div>
                    <div class="preview-sidebar-item"><i class="fas fa-exchange-alt"></i> Transactions</div>
                </div>
            </div>
            <div class="customer-preview-container">
                <div class="preview-header"><div class="preview-header-title"><h1 class="preview-store-name" id="preview-business-name">Youngster Data Shop</h1><p class="preview-store-desc" id="preview-store-desc">Your trusted partner for data services</p></div></div>
                <div class="preview-content">
                    <h2 class="preview-section-title"><i class="fas fa-wifi"></i> Buy Data Bundles</h2>
                    <div class="preview-network-cards"><div class="preview-network-card"><div class="preview-network-logo"><img src="mtn-logo (1).png"></div><div class="preview-network-info"><div class="preview-network-name">MTNUP2U</div><div class="preview-network-tagline">Normal Delivery</div></div><i class="fas fa-chevron-right"></i></div>
                    <div class="preview-network-card"><div class="preview-network-logo"><img src="telecel.jpg"></div><div class="preview-network-info"><div class="preview-network-name">Telecel Data</div><div class="preview-network-tagline">Swift Delivery</div></div><i class="fas fa-chevron-right"></i></div>
                    <div class="preview-network-card"><div class="preview-network-logo"><img src="at.webp"></div><div class="preview-network-info"><div class="preview-network-name">AT Ishare</div><div class="preview-network-tagline">Instant Delivery</div></div><i class="fas fa-chevron-right"></i></div>
                    <div class="preview-network-card"><div class="preview-network-logo"><img src="at.webp"></div><div class="preview-network-info"><div class="preview-network-name">AT Bigtime</div><div class="preview-network-tagline">Normal Delivery</div></div><i class="fas fa-chevron-right"></i></div></div>
                    <h2 class="preview-section-title"><i class="fas fa-gift"></i> Special Offers</h2>
                    <div class="preview-special-offers">
                        <div class="preview-network-card"><div class="preview-network-logo"><img src="MTN-PR-15 (1).png"></div><div class="preview-network-info"><div class="preview-network-name">MTN AFA</div><div class="preview-network-tagline">Registration within 24 hours</div></div><i class="fas fa-chevron-right"></i></div>
                        <div class="preview-network-card"><div class="preview-network-logo"><i class="fas fa-exchange-alt"></i></div><div class="preview-network-info"><div class="preview-network-name">EVD/Airtime Transfer</div><div class="preview-network-tagline">Earn 1% commission on each transaction</div></div><i class="fas fa-chevron-right"></i></div>
                        <div class="preview-network-card"><div class="preview-network-logo"><i class="fas fa-bolt"></i></div><div class="preview-network-info"><div class="preview-network-name">MTN Instant Bundles</div><div class="preview-network-tagline">Order and receive instantly</div></div><i class="fas fa-chevron-right"></i></div>
                        <div class="preview-network-card"><div class="preview-network-logo"><i class="fas fa-store"></i></div><div class="preview-network-info"><div class="preview-network-name">Shop</div><div class="preview-network-tagline">Add your products and sell</div></div><i class="fas fa-chevron-right"></i></div>
                    </div>
                </div>
                <div class="preview-whatsapp-float">
                    <div class="preview-whatsapp-main-btn"><i class="fab fa-whatsapp"></i></div>
                    <div class="preview-whatsapp-options">
                        <a href="#" class="preview-wa-option join-group" id="preview-group-btn" target="_blank"><i class="fas fa-users"></i> Join Group</a>
                        <a href="#" class="preview-wa-option chat-admin" id="preview-chat-btn" target="_blank"><i class="fas fa-headset"></i> Chat Admin</a>
                    </div>
                </div>
            </div>
        </div>
    `;
    formBody.appendChild(previewSection);
}

function updatePreviewBadge() {
    const logoPreview = document.getElementById('logo-preview-img');
    const businessName = document.getElementById('business-name');
    const description = document.getElementById('seller-description');
    const groupLink = document.getElementById('whatsapp-group-link');
    const whatsappNumber = document.getElementById('whatsapp-number');

    const previewName = document.getElementById('preview-business-name');
    if (previewName && businessName) previewName.textContent = businessName.value.trim() || 'Youngster Data Shop';
    const previewDesc = document.getElementById('preview-store-desc');
    if (previewDesc && description) previewDesc.textContent = description.value.trim() || 'Your trusted partner for data services';
    const previewSidebarName = document.getElementById('preview-sidebar-name');
    if (previewSidebarName && businessName) previewSidebarName.textContent = businessName.value.trim() || 'Youngster Data Shop';
    const previewSidebarLogo = document.getElementById('preview-sidebar-logo');
    if (previewSidebarLogo && logoPreview && logoPreview.src && !logoPreview.src.includes('default-logo.png')) {
        previewSidebarLogo.src = logoPreview.src;
    } else if (previewSidebarLogo) {
        const sidebarLogo = document.querySelector('.brand-logo img')?.src;
        previewSidebarLogo.src = sidebarLogo || 'default-logo.png';
    }
    const previewGroupBtn = document.getElementById('preview-group-btn');
    if (previewGroupBtn && groupLink) {
        const link = groupLink.value.trim();
        previewGroupBtn.href = link && link !== 'https://chat.whatsapp.com/...' ? link : '#';
        previewGroupBtn.style.opacity = link ? '1' : '0.6';
        previewGroupBtn.style.pointerEvents = link ? 'auto' : 'none';
    }
    const previewChatBtn = document.getElementById('preview-chat-btn');
    if (previewChatBtn && whatsappNumber) {
        let number = whatsappNumber.value.trim();
        if (number) {
            let clean = number.replace(/\D/g, '');
            if (!clean.startsWith('233')) clean = '233' + clean;
            previewChatBtn.href = `https://wa.me/${clean}`;
            previewChatBtn.style.opacity = '1';
            previewChatBtn.style.pointerEvents = 'auto';
        } else {
            previewChatBtn.href = '#';
            previewChatBtn.style.opacity = '0.6';
            previewChatBtn.style.pointerEvents = 'none';
        }
    }
}

function initializeSellerForm() {
    const uploadBtn = document.getElementById('upload-logo-btn');
    const logoInput = document.getElementById('seller-logo');
    const logoPreview = document.getElementById('logo-preview-img');
    const removeBtn = document.getElementById('remove-logo-btn');
    const nameInput = document.getElementById('business-name');
    const descInput = document.getElementById('seller-description');
    const groupInput = document.getElementById('whatsapp-group-link');
    const numberInput = document.getElementById('whatsapp-number');
    if (uploadBtn && logoInput) {
        uploadBtn.addEventListener('click', () => logoInput.click());
        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    logoPreview.src = ev.target.result;
                    if (removeBtn) removeBtn.style.display = 'inline-flex';
                    updatePreviewBadge();
                };
                reader.readAsDataURL(file);
            }
        });
    }
    if (removeBtn) removeBtn.addEventListener('click', () => {
        logoInput.value = '';
        logoPreview.src = 'default-logo.png';
        removeBtn.style.display = 'none';
        updatePreviewBadge();
    });
    if (nameInput) nameInput.addEventListener('input', updatePreviewBadge);
    if (descInput) descInput.addEventListener('input', updatePreviewBadge);
    if (groupInput) groupInput.addEventListener('input', updatePreviewBadge);
    if (numberInput) numberInput.addEventListener('input', updatePreviewBadge);
    createPreviewSection();
    updatePreviewBadge();
}

function updateSaveButtonHandler() {
    const saveButton = document.getElementById('savePrices');
    if (!saveButton) return;
    const newBtn = saveButton.cloneNode(true);
    saveButton.parentNode.replaceChild(newBtn, saveButton);
    newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await saveSellerData()) await saveAllPrices();
    });
}

// ========== Refresh Mechanism ==========
async function refreshPricesData() {
    const container = document.getElementById('dynamicTablesContainer');
    if (container) {
        container.innerHTML = '<div style="text-align:center;padding:24px;opacity:.5;"><i class="fas fa-spinner fa-spin"></i> Loading packages...</div>';
    }
    
    await refreshAll();
    showNotification('Packages refreshed!', 'success');
}

function addRefreshButton() {
    // Check if button already exists
    if (document.getElementById('refreshPricesBtn')) return;

    const container = document.getElementById('dynamicTablesContainer');
    if (!container || !container.previousElementSibling) return;

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshPricesBtn';
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Packages';
    refreshBtn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        margin: 12px 0 12px 0;
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

        await refreshPricesData();

        refreshBtn.innerHTML = origText;
        refreshBtn.disabled = false;
    });

    // Insert before the tables container
    container.parentNode.insertBefore(refreshBtn, container);
}

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    initializeTheme();
    initializeSidebar();
    // Sync slug on every page load to ensure DB is always up to date
    await fetch(`${API_BASE}/sync-my-slug`, { headers: authHeaders() }).catch(() => {});
    await refreshAll();
    addRefreshButton();
    await loadSellerData();
    initializeSellerForm();
    updateSaveButtonHandler();
});
