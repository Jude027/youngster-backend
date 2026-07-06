// Generic Package Page - Works for any provider
// Loads provider name and logo from URL parameters

let providerName = '';

// Auto-detect theme from dashboard
function initializeTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
}

// Sidebar functionality
function initializeSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    if (!menuBtn || !sidebar || !overlay) {
        console.warn('Sidebar elements not found');
        return;
    }
    
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.classList.add('sidebar-open');
    });
    
    function closeSidebar() {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    }
    
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    
    // Dashboard link — navigate back to dashboard
    const dashboardLink = document.getElementById('dashboardMenuLink');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeSidebar();
            const slug = localStorage.getItem('storeSlug');
            const base = 'dashboard2.html';
            window.location.href = slug ? base + '?store=' + encodeURIComponent(slug) : base;
        });
    }
}

// Check authentication on page load
function checkAuthentication() {
    const isReferralVisit = window.location.pathname.includes('/referral/') ||
                        new URLSearchParams(window.location.search).get('store');
    if (isReferralVisit) return true;

    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const username = localStorage.getItem('username');
    
    if (isLoggedIn !== 'true' || !username) {
        console.log('No active session found. Redirecting to login...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 100);
        return false;
    }
    
    return true;
}

// Load provider logo and set page title
function loadProviderInfo() {
    const params = new URLSearchParams(window.location.search);
    providerName = params.get('provider') || 'Provider';
    const logoUrl = params.get('logo') || '';
    
    // Set page title and subtitle
    document.getElementById('pageTitle').textContent = `Purchase ${providerName} Bundle`;
    document.getElementById('pageSubtitle').textContent = `Get your ${providerName} data bundle now`;
    document.title = `Purchase ${providerName} Bundle`;
    
    // Set provider logo
    const logoDiv = document.getElementById('providerLogoDiv');
    if (logoUrl) {
        logoDiv.innerHTML = `<img src="${logoUrl}" alt="${providerName} Logo" style="width: 60px; height: 60px; object-fit: contain;">`;
    } else {
        // Default logo placeholder
        logoDiv.innerHTML = `<div style="width: 60px; height: 60px; background: var(--accent-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin: 0 auto;">${providerName.charAt(0).toUpperCase()}</div>`;
    }
}

// Function to load user's store branding
async function applyUserStoreBranding() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch('http://localhost:5000/api/store-settings', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) return;
        
        const store = await response.json();

        // Cache slug so dashboard link navigates back with ?store= param
        if (store.storeSlug) localStorage.setItem('storeSlug', store.storeSlug);

        // Apply store branding to sidebar
        const sidebarTitle = document.getElementById('sidebarTitle');
        if (sidebarTitle) sidebarTitle.textContent = store.storeName;

        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo && store.storeLogo) {
            sidebarLogo.innerHTML = `<img src="${store.storeLogo}" alt="${store.storeName} Logo" style="width:100%;height:100%;object-fit:contain;border-radius:6px;">`;
        } else if (sidebarLogo && store.storeName) {
            sidebarLogo.innerHTML = `<span style="font-size:18px;font-weight:700;color:#6a11cb;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${store.storeName.charAt(0).toUpperCase()}</span>`;
        }
    } catch (err) {
        console.warn('Could not load user store details:', err);
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking authentication...');
    
    // Check authentication first
    const isLoggedIn = checkAuthentication();
    if (!isLoggedIn) {
        return; // Stop initialization if not logged in
    }
    
    console.log('Authentication passed, initializing components...');
    
    initializeTheme();
    initializeSidebar();
    loadProviderInfo();
    applyUserStoreBranding();
    
    const bundleSelect = document.getElementById('bundle');
    const bundleDetails = document.getElementById('bundleDetails');
    const phoneInput = document.getElementById('phone');
    const purchaseBtn = document.getElementById('purchaseBundle');
    const portedCheckbox = document.getElementById('portedNetwork');
    const notificationMessage = document.getElementById('notificationMessage');
    
    // Load bundles for the provider
    async function loadBundles() {
        try {
            const prices = await loadPricesForProvider(providerName);
            
            bundleSelect.setAttribute('data-network', providerName);
            
            // Clear existing options
            while (bundleSelect.options.length > 1) {
                bundleSelect.remove(1);
            }
            
            if (prices.length === 0) {
                bundleSelect.innerHTML = '<option value="">No bundles available</option>';
                return;
            }
            
            // Sort by package size
            prices.sort((a, b) => {
                const aSize = parseInt(a.packageName) || 0;
                const bSize = parseInt(b.packageName) || 0;
                return aSize - bSize;
            });
            
            // Populate options from loaded prices
            prices.forEach((priceObj, index) => {
                const option = document.createElement('option');
                option.value = index + 1;
                option.setAttribute('data-price', priceObj.price.toFixed(2));
                option.setAttribute('data-validity', '90 days');
                option.setAttribute('data-network', providerName);
                option.textContent = `${priceObj.packageName} - ${priceObj.price.toFixed(2)} GHS`;
                bundleSelect.appendChild(option);
            });
        } catch (err) {
            console.error('Failed to load bundles:', err);
            bundleSelect.innerHTML = '<option value="">Error loading bundles</option>';
        }
    }
    
    // Load bundles on page load
    loadBundles();
    
    // Update bundle details when selection changes
    if (bundleSelect && bundleDetails) {
        bundleSelect.addEventListener('change', function() {
            if (this.value === '') {
                bundleDetails.style.display = 'none';
                return;
            }
            
            const selectedOption = this.options[this.selectedIndex];
            const price = selectedOption.getAttribute('data-price');
            const validity = selectedOption.getAttribute('data-validity');
            const bundleName = selectedOption.textContent.split(' - ')[0];
            const network = selectedOption.getAttribute('data-network');
            
            document.getElementById('bundleSize').textContent = bundleName;
            document.getElementById('bundlePrice').textContent = `${price} GHS`;
            document.getElementById('bundleValidity').textContent = validity;
            document.getElementById('bundleNetwork').textContent = network;
            document.getElementById('numberType').textContent = portedCheckbox?.checked ? 'Ported' : 'Normal';
            
            bundleDetails.style.display = 'block';
        });
    }
    
    // Update number type when ported checkbox changes
    if (portedCheckbox) {
        portedCheckbox.addEventListener('change', function() {
            if (bundleSelect.value !== '') {
                document.getElementById('numberType').textContent = this.checked ? 'Ported' : 'Normal';
            }
        });
    }
    
    // Handle purchase
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', async function() {
            const phone        = phoneInput?.value.trim();
            const bundleValue  = bundleSelect.value;
            const selectedOpt  = bundleSelect.options[bundleSelect.selectedIndex];
            const bundleText   = selectedOpt?.textContent;
            const price        = parseFloat(selectedOpt?.getAttribute('data-price') || '0');
            const bundleName   = bundleText?.split(' - ')[0] || bundleValue;

            if (!phone) {
                alert('Please enter a phone number');
                phoneInput?.focus();
                return;
            }
            if (!bundleValue) {
                alert(`Please select a ${(providerConfig.bundleLabel || 'package').toLowerCase()}`);
                bundleSelect.focus();
                return;
            }

            const originalHTML = purchaseBtn.innerHTML;
            purchaseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            purchaseBtn.disabled  = true;

            try {
                // 1. Record the order
                const { storeSlug, clientType } = (typeof getOrderContext === 'function')
                    ? getOrderContext()
                    : { storeSlug: localStorage.getItem('storeSlug') || '', clientType: localStorage.getItem('clientType') || 'Customers' };

                const orderRes = await fetch(`${API}/orders`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        beneficiary:  phone,
                        phoneNumber:  phone,
                        package:      providerName,
                        packageName:  bundleName,
                        bundleSize:   bundleName,
                        bundle_size:  bundleName,
                        amount:       price,
                        status:       'pending',
                        storeSlug:    storeSlug || null,
                        clientType:   clientType || 'Customers',
                        created:      new Date().toISOString()
                    })
                });

                // 2. Initiate payment — server returns redirectUrl (Moolre POS link)
                const payRes = await fetch(`${API}/payment/initiate`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gatewayName:  'Moolre',
                        phoneNumber:  phone,
                        beneficiary:  phone,
                        amount:       price,
                        provider:     providerName,
                        packageName:  bundleName,
                        bundle_size:  bundleName,
                        description:  `${providerName} ${bundleName}`,
                        storeSlug:    storeSlug || null,
                        clientType:   clientType || 'Customers'
                    })
                });

                const payData = payRes.ok ? await payRes.json() : null;
                const transactionId = payData?.transactionId;
                if (!payData?.success || !transactionId) {
                    throw new Error(payData?.message || 'Could not initiate payment. Please try again.');
                }

                localStorage.setItem('paymentTransactionId', transactionId);
                localStorage.setItem('pendingOrderData', JSON.stringify({
                    package:     providerName,
                    bundle_size: bundleName,
                    amount:      price,
                    beneficiary: phone,
                    phoneNumber: phone,
                    transactionId: transactionId,
                    storeSlug:    storeSlug || null,
                    clientType:   clientType || 'Customers'
                }));

                purchaseBtn.innerHTML = '<i class="fas fa-key"></i> Redirecting to OTP...';
                const returnUrl = `/Dashboard/payment-processing.html?transactionId=${transactionId}`;
                localStorage.setItem('otpTransactionId', transactionId);
                localStorage.setItem('otpPhoneNumber',   phone);
                localStorage.setItem('otpReturnUrl',     returnUrl);
                setTimeout(() => {
                    window.location.href = `./payment-otp.html?txid=${transactionId}&phone=${encodeURIComponent(phone)}&return=${encodeURIComponent(returnUrl)}`;
                }, 400);

            } catch (err) {
                console.error('Payment error:', err);
                alert('Could not initiate payment. Please try again.');
                purchaseBtn.innerHTML = originalHTML;
                purchaseBtn.disabled  = false;
            }
        });
    }
});
