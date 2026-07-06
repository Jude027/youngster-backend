// Auto-detect theme from dashboard
function initializeTheme() {
    // Check for saved theme preference or default to light
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
}

// Sidebar functionality
function initializeSidebar() {
    // Get DOM elements
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const ordersMenu = document.getElementById('ordersMenu');
    const ordersSubMenu = document.getElementById('ordersSubMenu');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Check if elements exist
    if (!menuBtn || !sidebar) return;
    
    // Toggle sidebar
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('open');
        document.body.classList.add('sidebar-open');
    });
    
    // Close sidebar
    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    }
    
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
    
    // Toggle orders sub-menu
    if (ordersMenu && ordersSubMenu) {
        ordersMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            ordersSubMenu.classList.toggle('open');
            
            // Rotate chevron icon
            const chevron = ordersMenu.querySelector('.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = ordersSubMenu.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
            }
        });
    }
    
    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm('Are you sure you want to log out?')) {
                // Clear login state
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('username');
                
                // Show logout notification
                showLogoutNotification();
                
                // Redirect to login page after notification delay
                setTimeout(() => {
                }, 1500);
            }
        });
    }
    
    // Close sidebar when clicking on a menu item (except orders with submenu)
    document.querySelectorAll('.menu-item:not(#ordersMenu)').forEach(item => {
        item.addEventListener('click', () => {
            closeSidebar();
        });
    });

    // Dashboard link — navigate back to branded store dashboard with slug
    const dashboardLink = document.getElementById('dashboardMenuLink');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeSidebar();
            const slug = localStorage.getItem('storeSlug');
            const base = '../../Dashboard/dashboard2.html';
            window.location.href = slug ? base + '?store=' + encodeURIComponent(slug) : base;
        });
    }
}

// Simple logout notification
function showLogoutNotification() {
    // Remove any existing notifications first
    const existingNotifications = document.querySelectorAll('.logout-notification');
    existingNotifications.forEach(notification => {
        if (notification.parentNode) {
            document.body.removeChild(notification);
        }
    });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'logout-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            animation: notificationSlideIn 0.3s ease;
            font-size: 14px;
        ">
            <i class="fas fa-check-circle"></i> You have been logged out successfully!
        </div>
    `;
    
    // Add notification styles if not already added
    if (!document.querySelector('#logout-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'logout-notification-styles';
        style.textContent = `
            @keyframes notificationSlideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes notificationSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'notificationSlideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Check authentication on page load


// Notification functionality
function initializeNotification() {
    const notification = document.getElementById('notification');
    const notificationClose = document.getElementById('notificationClose');
    
    if (!notification) return { showNotification: () => {}, hideNotification: () => {} };
    
    // Function to show notification
    function showNotification() {
        notification.classList.add('show');
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            hideNotification();
        }, 5000);
    }
    
    // Function to hide notification
    function hideNotification() {
        notification.classList.remove('show');
    }
    
    // Close notification when close button is clicked
    if (notificationClose) {
        notificationClose.addEventListener('click', hideNotification);
    }
    
    return { showNotification, hideNotification };
}

// Phone validation functions
function validateMTNPhoneNumber(phone, allowAllFormats = false) {
    // Remove any non-numeric characters
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    
    // Check if it's a 10-digit number
    if (cleanPhone.length !== 10) {
        return { isValid: false, message: 'Phone number must be 10 digits' };
    }
    
    // If ported number checkbox is checked, allow all formats
    if (allowAllFormats) {
        return { isValid: true, message: '' };
    }
    
    // Check if it starts with valid MTN prefixes
    const validPrefixes = ['024', '054', '055', '059', '025', '053'];
    const prefix = cleanPhone.substring(0, 3);
    
    if (!validPrefixes.includes(prefix)) {
        return { 
            isValid: false, 
            message: `Invalid MTN Number format. Must start with: ${validPrefixes.join(', ')} or if the number is ported then please tick the 'Ported' option.` 
        };
    }
    
    return { isValid: true, message: '' };
}

// Custom checkbox functionality
function initializeCustomCheckboxes() {
    // Main ported number checkbox
    const portedNumberContainer = document.getElementById('portedNumberContainer');
    const portedNumberCheckbox = document.getElementById('portedNumber');
    const portedNumberBox = document.getElementById('portedNumberBox');
    
    if (portedNumberContainer && portedNumberCheckbox && portedNumberBox) {
        portedNumberContainer.addEventListener('click', function(e) {
            e.preventDefault();
            portedNumberCheckbox.checked = !portedNumberCheckbox.checked;
            portedNumberBox.classList.toggle('checked', portedNumberCheckbox.checked);
            
            // Update the number type in bundle details
            updateNumberType();
        });
        
        // Initialize the box state
        portedNumberBox.classList.toggle('checked', portedNumberCheckbox.checked);
    }
}

// Function to update the number type in bundle details
function updateNumberType() {
    const portedNumberCheckbox = document.getElementById('portedNumber');
    const numberTypeElement = document.getElementById('numberType');
    
    if (portedNumberCheckbox && numberTypeElement) {
        if (portedNumberCheckbox.checked) {
            numberTypeElement.textContent = 'Ported';
        } else {
            numberTypeElement.textContent = 'Normal';
        }
    }
}

// Function to load and apply user's store branding
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


// ── Moolre Payment Modal ──────────────────────────────────────────────────────
// Shows a modal asking for the customer's MoMo number, initiates the
// Moolre USSD push via the backend, then polls for confirmation.

function showPaymentModal(orderDetails) {
    // Remove any existing modal
    const existing = document.getElementById('moolrePayModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'moolrePayModal';
    modal.innerHTML = `
        <div style="
            position:fixed; inset:0; background:rgba(0,0,0,0.6);
            display:flex; align-items:center; justify-content:center;
            z-index:99999; padding:16px;">
            <div style="
                background:#fff; border-radius:16px; padding:28px 24px;
                max-width:380px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.3);
                font-family:inherit;">

                <!-- Header -->
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="width:56px;height:56px;background:linear-gradient(135deg,#6a11cb,#2575fc);
                        border-radius:50%;display:flex;align-items:center;justify-content:center;
                        margin:0 auto 12px;">
                        <i class="fas fa-mobile-alt" style="color:#fff;font-size:22px;"></i>
                    </div>
                    <h2 style="margin:0;font-size:18px;color:#1a1a2e;">Mobile Money Payment</h2>
                    <p style="margin:6px 0 0;color:#666;font-size:13px;">
                        Enter the MoMo number to charge
                    </p>
                </div>

                <!-- Order summary -->
                <div style="background:#f8f9ff;border-radius:10px;padding:12px 16px;margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="color:#666;font-size:13px;">Bundle</span>
                        <span style="font-weight:600;font-size:13px;">${orderDetails.bundle_size}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="color:#666;font-size:13px;">Recipient</span>
                        <span style="font-weight:600;font-size:13px;">${orderDetails.beneficiary}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;border-top:1px solid #e0e0e0;padding-top:8px;margin-top:4px;">
                        <span style="color:#666;font-size:14px;font-weight:600;">Amount</span>
                        <span style="font-weight:700;font-size:16px;color:#6a11cb;">GHS ${parseFloat(orderDetails.amount).toFixed(2)}</span>
                    </div>
                </div>

                <!-- MoMo phone input -->
                <div id="payModalStep1">
                    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px;">
                        <div>
                            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">Select Network</label>
                            <select id="momoNetwork" style="width:100%;padding:12px 14px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;background:#fff;outline:none;">
                                <option value="MTN">MTN</option>
                                <option value="Telecel">Telecel</option>
                                <option value="AirtelTigo">AirtelTigo</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">MoMo Phone Number</label>
                            <input type="tel" id="momoPhone" placeholder="024 XXX XXXX"
                                inputmode="numeric" maxlength="10"
                                style="width:100%;padding:12px 14px;border:2px solid #e0e0e0;
                                border-radius:8px;font-size:15px;outline:none;">
                        </div>
                    </div>
                    <p style="font-size:12px;color:#888;margin:0 0 16px;">
                        A payment prompt will be sent to this number. Enter your MoMo PIN to confirm.
                    </p>
                    <button id="momoPayBtn" style="
                        width:100%;padding:14px;background:linear-gradient(135deg,#6a11cb,#2575fc);
                        color:#fff;border:none;border-radius:10px;font-size:15px;
                        font-weight:600;cursor:pointer;letter-spacing:0.3px;">
                        <i class="fas fa-paper-plane"></i> Send Payment Prompt
                    </button>
                    <button id="momoCancel" style="
                        width:100%;padding:10px;background:transparent;color:#888;
                        border:none;font-size:13px;cursor:pointer;margin-top:8px;">
                        Cancel
                    </button>
                </div>

                <!-- Waiting screen (hidden initially) -->
                <div id="payModalStep2" style="display:none;text-align:center;">
                    <div style="margin-bottom:16px;">
                        <i class="fas fa-spinner fa-spin" style="font-size:36px;color:#6a11cb;"></i>
                    </div>
                    <h3 style="margin:0 0 8px;color:#1a1a2e;">Waiting for payment...</h3>
                    <p id="payModalMsg" style="color:#666;font-size:13px;margin:0 0 16px;">
                        Check your phone and enter your MoMo PIN to approve the payment.
                    </p>
                    <button id="momoCancelWait" style="
                        padding:10px 24px;background:transparent;color:#e74c3c;
                        border:1px solid #e74c3c;border-radius:8px;font-size:13px;cursor:pointer;">
                        Cancel
                    </button>
                </div>

                <!-- Result screen (hidden initially) -->
                <div id="payModalStep3" style="display:none;text-align:center;">
                    <div id="payResultIcon" style="font-size:48px;margin-bottom:12px;"></div>
                    <h3 id="payResultTitle" style="margin:0 0 8px;"></h3>
                    <p id="payResultMsg" style="color:#666;font-size:13px;margin:0 0 20px;"></p>
                    <button id="payResultClose" style="
                        padding:12px 32px;background:linear-gradient(135deg,#6a11cb,#2575fc);
                        color:#fff;border:none;border-radius:10px;font-size:14px;
                        font-weight:600;cursor:pointer;">
                        Done
                    </button>
                </div>

            </div>
        </div>`;

    document.body.appendChild(modal);

    const step1 = document.getElementById('payModalStep1');
    const step2 = document.getElementById('payModalStep2');
    const step3 = document.getElementById('payModalStep3');
    const momoPhone = document.getElementById('momoPhone');
    const momoNetwork = document.getElementById('momoNetwork');

    // Pre-fill phone if beneficiary is on same network
    momoPhone.value = orderDetails.beneficiary || '';

    // Numeric only
    momoPhone.addEventListener('input', () => {
        momoPhone.value = momoPhone.value.replace(/[^0-9]/g, '');
    });

    // Cancel
    document.getElementById('momoCancel').addEventListener('click', () => modal.remove());
    document.getElementById('momoCancelWait').addEventListener('click', () => modal.remove());
    document.getElementById('payResultClose').addEventListener('click', () => modal.remove());

    // Send payment prompt
    document.getElementById('momoPayBtn').addEventListener('click', async () => {
        const phone = momoPhone.value.trim();
        const network = momoNetwork.value;

        if (!phone || phone.length !== 10) {
            momoPhone.style.border = '2px solid #e74c3c';
            momoPhone.focus();
            return;
        }
        momoPhone.style.border = '2px solid #e0e0e0';

        // Show waiting screen
        step1.style.display = 'none';
        step2.style.display = 'block';

        const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:5000/api' : `https://${window.location.hostname}/api`;

        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let transactionId = null;
        let pollTimer = null;

        try {
            const res = await fetch(`${API_BASE}/payment/initiate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    gatewayName:  'Moolre',
                    phoneNumber:  phone,
                    beneficiary:  orderDetails.beneficiary,
                    amount:       orderDetails.amount,
                    provider:     network,
                    paymentNetwork: network,
                    orderProvider:  orderDetails.package || 'MTN',
                    description:  `${orderDetails.package} ${orderDetails.bundle_size}`,
                    packageName:  orderDetails.bundle_size,
                    bundle_size:  orderDetails.bundle_size,
                    storeSlug:    new URLSearchParams(window.location.search).get('store') || localStorage.getItem('storeSlug') || '',
                    clientType:   localStorage.getItem('clientType') || 'Customers',
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Payment initiation failed');
            }

            transactionId = data.transactionId;

            localStorage.setItem('paymentTransactionId', transactionId);
            localStorage.setItem('pendingOrderData', JSON.stringify({
                package:     orderDetails.package,
                bundle_size: orderDetails.bundle_size,
                amount:      orderDetails.amount,
                beneficiary: orderDetails.beneficiary,
                phoneNumber: phone,
                transactionId: transactionId,
                storeSlug:   new URLSearchParams(window.location.search).get('store') || localStorage.getItem('storeSlug') || '',
                clientType:  localStorage.getItem('clientType') || 'Customers'
            }));

            const returnUrl = `/Dashboard/payment-processing.html?transactionId=${transactionId}`;
            localStorage.setItem('otpTransactionId', transactionId);
            localStorage.setItem('otpPhoneNumber',   phone);
            localStorage.setItem('otpReturnUrl',     returnUrl);
            window.location.href = `../payment-otp.html?txid=${transactionId}&phone=${encodeURIComponent(phone)}&return=${encodeURIComponent(returnUrl)}`;

        } catch (err) {
            step2.style.display = 'none';
            step1.style.display = 'block';
            alert(err.message || 'Could not initiate payment. Please try again.');
        }

        function showResult(success, icon, title, message) {
            step2.style.display = 'none';
            step3.style.display = 'block';
            document.getElementById('payResultIcon').textContent = icon;
            document.getElementById('payResultTitle').textContent = title;
            document.getElementById('payResultTitle').style.color = success ? '#27ae60' : '#e74c3c';
            document.getElementById('payResultMsg').textContent = message;
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme, sidebar, and notification
    initializeTheme();
    initializeSidebar();
    applyUserStoreBranding(); // Load user's store branding
    
    // Set provider context for storefront-prices.js
    localStorage.setItem('providerName', 'MTN');
    
    const { showNotification } = initializeNotification();
    initializeCustomCheckboxes();
    
    // Bundle dropdown functionality
    const bundleSelect = document.getElementById('bundle');
    const bundleDetails = document.getElementById('bundleDetails');
    const bundleSize = document.getElementById('bundleSize');
    const bundlePrice = document.getElementById('bundlePrice');
    const bundleValidity = document.getElementById('bundleValidity');
    const bundleNetwork = document.getElementById('bundleNetwork');
    
    // Load prices dynamically
    async function loadAndPopulateBundles() {
        try {
            // Get provider from URL parameter or default to MTN
            const params = new URLSearchParams(window.location.search);
            const provider = params.get('provider') || 'MTN';
            console.log('Loading prices for provider:', provider);
            console.log('Current URL:', window.location.href);
            
            const prices = await loadPricesForProvider(provider);
            console.log('Loaded prices:', prices);
            
            // Update data-network attribute on the select element
            bundleSelect.setAttribute('data-network', provider);
            
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
                option.setAttribute('data-network', provider);
                option.textContent = `${priceObj.packageName} - ${priceObj.price.toFixed(2)} GHS`;
                bundleSelect.appendChild(option);
            });
            
            bundleSelect.innerHTML = bundleSelect.innerHTML; // Trigger UI update
        } catch (err) {
            console.error('Failed to load bundles:', err);
            bundleSelect.innerHTML = '<option value="">Error loading bundles</option>';
        }
    }
    
    // Load bundles on page load
    loadAndPopulateBundles();
    
    if (bundleSelect && bundleDetails) {
        bundleSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            
            if (selectedOption.value && bundleSize && bundlePrice && bundleValidity && bundleNetwork) {
                bundleSize.textContent = selectedOption.text.split(' - ')[0]; // Extract package size from text
                bundlePrice.textContent = selectedOption.getAttribute('data-price') + ' GHS';
                bundleValidity.textContent = selectedOption.getAttribute('data-validity');
                bundleNetwork.textContent = selectedOption.getAttribute('data-network');
                bundleDetails.classList.add('active');
            } else {
                bundleDetails.classList.remove('active');
            }
        });
    }
    
    // Ported number checkbox
    const portedNumberCheckbox = document.getElementById('portedNumber');
    
    // Numeric-only input for phone number field
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            // Remove any non-numeric characters
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Validate phone number
            const validation = validateMTNPhoneNumber(this.value, portedNumberCheckbox ? portedNumberCheckbox.checked : false);
            if (!validation.isValid && this.value.length > 0) {
                // Show validation error
                console.log(validation.message);
            }
        });
    }
    
    // Form submission
    const orderBtn = document.getElementById('purchaseBundle');
    
    if (orderBtn && phoneInput && bundleSelect) {
        orderBtn.addEventListener('click', async function() {
            const phoneNumber = phoneInput.value.trim();
            const selectedBundle = bundleSelect.value;
            const selectedBundlePrice = bundleSelect.options[bundleSelect.selectedIndex]?.getAttribute('data-price');
            
            if (!phoneNumber) {
                alert('Please enter a phone number');
                phoneInput.focus();
                return;
            }
            
            // Validate phone number
            const validation = validateMTNPhoneNumber(phoneNumber, portedNumberCheckbox ? portedNumberCheckbox.checked : false);
            if (!validation.isValid) {
                alert(validation.message);
                phoneInput.focus();
                return;
            }
            
            if (!selectedBundle) {
                alert('Please select a bundle');
                bundleSelect.focus();
                return;
            }

            const selectedOption = bundleSelect.options[bundleSelect.selectedIndex];
            const bundleName = selectedOption ? selectedOption.text.split(' - ')[0].trim() : '';
            const amount = parseFloat(selectedOption?.getAttribute('data-price')) || parseFloat(selectedBundlePrice) || 0;
            const params = new URLSearchParams(window.location.search);
            const provider = params.get('provider') || 'MTN';

            // Open Moolre payment modal — customer enters their MoMo number
            // and gets a USSD push prompt to approve the payment
            showPaymentModal({
                beneficiary: phoneNumber,
                package:     provider,
                bundle_size: bundleName,
                amount:      amount,
                isPorted:    portedNumberCheckbox ? portedNumberCheckbox.checked : false,
            });
        });
    }
});
