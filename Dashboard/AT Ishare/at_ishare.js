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
    
    // Check if essential elements exist
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
    
    // Logout functionality - UPDATED TO SHOW NOTIFICATION
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent any default behavior
            e.stopPropagation(); // Stop event bubbling
            
            if (confirm('Are you sure you want to log out?')) {
                // Clear login state
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('username');
                
                // Show logout notification
                showLogoutNotification();
                
                // Redirect to login page after notification delay
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 1500); // Redirect after 1.5 seconds (notification shows for 3 seconds)
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
function checkUserSession() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const username = localStorage.getItem('username');
    
    if (isLoggedIn !== 'true' || !username) {
        console.log('No active session found. Redirecting to login...');
        
        // Show logout notification before redirecting
        showLogoutNotification();
        
        // Redirect to login page after delay
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 1500);
        return false;
    }
    
    return true;
}

// Check authentication on page load
function checkAuthentication() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const username = localStorage.getItem('username');
    
    if (isLoggedIn !== 'true' || !username) {
        console.log('No active session found. Redirecting to login...');
        // Redirect to dashboard login page
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 100);
        return false;
    }
    
    return true;
}

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

// Excel template download functionality
function initializeExcelTemplateDownload() {
    const downloadExcelTemplate = document.getElementById('downloadExcelTemplate');
    
    if (!downloadExcelTemplate) return;
    
    downloadExcelTemplate.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Create a simple Excel file content for AT
        const templateData = [
            ['Recipient', 'Volume'],
            ['0261234567', '1'],
            ['0569876543', '2'],
            ['0275551234', '3'],
            ['', ''],
            ['NOTE:'],
            ['1. Phone numbers must be 10 digits (026, 056, 027, 057, 023)'],
            ['2. Volume should be numbers only (1, 2, 3, 4, or 5)'],
            ['3. Save file as .xlsx or .csv format'],
            ['4. Remove any empty rows before uploading'],
            ['5. For ported numbers, tick the ported checkbox above']
        ];
        
        // Convert to CSV format
        let csvContent = "data:text/csv;charset=utf-8,";
        templateData.forEach(row => {
            csvContent += row.map(cell => `"${cell}"`).join(",") + "\r\n";
        });
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "at-bulk-template.csv");
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        document.body.removeChild(link);
        
        // Show custom notification for template download
        const notification = document.getElementById('notification');
        if (notification) {
            const notificationIcon = notification.querySelector('.notification-icon');
            const notificationTitle = notification.querySelector('.notification-title');
            const notificationMessage = notification.querySelector('.notification-message');
            
            if (notificationIcon) {
                notificationIcon.innerHTML = '<i class="fas fa-file-download"></i>';
                notificationIcon.style.background = '#3498db';
            }
            if (notificationTitle) notificationTitle.textContent = 'Template Downloaded!';
            if (notificationMessage) notificationMessage.textContent = 'AT Excel template downloaded successfully. Fill in your data and upload.';
            
            // Show the notification
            notification.classList.add('show');
            
            // Auto hide after 5 seconds
            setTimeout(() => {
                notification.classList.remove('show');
            }, 5000);
        }
    });
}

// Valid AT prefixes
const validATPrefixes = ['026', '056', '027', '057', '023'];

// Function to validate phone number based on ported checkbox status
function validatePhoneNumber(phoneNumber, isPorted = false) {
    // Remove any non-numeric characters
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Check if it's a valid Ghanaian number (10 digits starting with 0)
    if (!/^0\d{9}$/.test(cleanNumber)) {
        return {
            isValid: false,
            error: 'Invalid Ghanaian number. Must be 10 digits starting with 0'
        };
    }
    
    // If ported network is checked, accept all number formats
    if (isPorted) {
        return {
            isValid: true,
            error: null
        };
    }
    
    // Check if number starts with valid AT prefix
    const prefix = cleanNumber.substring(0, 3);
    if (!validATPrefixes.includes(prefix)) {
        return {
            isValid: false,
            error: `Invalid AT Phone Number Format. Must start with: ${validATPrefixes.join(', ')} or if the number is ported then please tick the 'Ported' option.`
        };
    }
    
    return {
        isValid: true,
        error: null
    };
}

// Function to update the number type in bundle details
function updateNumberType() {
    const portedCheckbox = document.getElementById('portedNetwork');
    const numberTypeElement = document.getElementById('numberType');
    
    if (portedCheckbox && numberTypeElement) {
        if (portedCheckbox.checked) {
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


// ── Moolre Payment Link helper ────────────────────────────────────────────────
// Fetches the current POS link from the gateway config so the admin can update
// it without changing code. Falls back to the hardcoded link if API fails.
async function getMoolrePaymentLink() {
    try {
        const h = window.location.hostname;
        const api = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000/api' : `http://${h}:5000/api`;
        const res = await fetch(`${api}/payment-gateways`);
        if (res.ok) {
            const gateways = await res.json();
            const moolre = gateways.find(g => /moolre/i.test(g.name));
            if (moolre?.posLink) return moolre.posLink;
        }
    } catch {}
    return 'https://pos.moolre.com/OBsl0jRg95WiLfytc7Tu33434';
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
                    orderProvider:  orderDetails.package || 'AT Ishare',
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
    console.log('DOM loaded, initializing page...');
    
    // Initialize theme, sidebar, and notification
    initializeTheme();
    initializeSidebar();
    applyUserStoreBranding(); // Load user's store branding
    
    // Set provider context for storefront-prices.js to inject referral prices
    localStorage.setItem('providerName', 'AT Ishare');
    
    const { showNotification } = initializeNotification();
    initializeExcelTemplateDownload();
    
    // Define bundle offers with their prices (data quantity in GB -> price)
    const bundleOffers = {
        '1': 4.70,
        '2': 9.30,
        '3': 13.80,
        '4': 18.00,
        '5': 22.50,
    };
    
    // Get DOM elements
    const phoneInput = document.getElementById('phone');
    const portedCheckbox = document.getElementById('portedNetwork');
    const portedCheckboxContainer = document.getElementById('portedCheckbox');
    const customCheckbox = document.getElementById('customCheckbox');
    const bundleSelect = document.getElementById('bundle');
    const bundleDetails = document.getElementById('bundleDetails');
    const bundleSize = document.getElementById('bundleSize');
    const bundlePrice = document.getElementById('bundlePrice');
    const bundleValidity = document.getElementById('bundleValidity');
    const bundleNetwork = document.getElementById('bundleNetwork');
    
    // Make only the checkbox clickable, not the entire area
    if (customCheckbox && portedCheckbox) {
        customCheckbox.addEventListener('click', function(e) {
            e.stopPropagation();
            portedCheckbox.checked = !portedCheckbox.checked;
            updateCheckboxState();
            updateNumberType(); // Update number type when checkbox changes
        });
    }
    
    // Update checkbox state function
    function updateCheckboxState() {
        if (portedCheckbox && portedCheckboxContainer) {
            if (portedCheckbox.checked) {
                portedCheckboxContainer.classList.add('checked');
                if (phoneInput) phoneInput.placeholder = "Enter any Ghanaian phone number";
            } else {
                portedCheckboxContainer.classList.remove('checked');
                if (phoneInput) phoneInput.placeholder = "Enter AT phone number ";
            }
            
            // Re-validate phone number when checkbox state changes
            if (phoneInput && phoneInput.value) {
                const validation = validatePhoneNumber(phoneInput.value, portedCheckbox.checked);
                if (!validation.isValid) {
                    phoneInput.style.borderColor = '#e74c3c';
                    phoneInput.style.boxShadow = '0 0 0 3px rgba(231, 76, 60, 0.2)';
                } else {
                    phoneInput.style.borderColor = '';
                    phoneInput.style.boxShadow = '';
                }
            }
        }
    }
    
    // Initialize checkbox state and number type
    updateCheckboxState();
    updateNumberType();
    
    // Bundle dropdown functionality
    if (bundleSelect && bundleDetails && bundleSize && bundlePrice && bundleValidity && bundleNetwork) {
        bundleSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            
            if (selectedOption && selectedOption.value) {
                const rawSize = selectedOption.value;
                bundleSize.textContent = rawSize.toLowerCase().includes('gb') ? rawSize : rawSize + ' GB';
                bundlePrice.textContent = (selectedOption.getAttribute('data-price') || '0') + ' GHS';
                bundleValidity.textContent = selectedOption.getAttribute('data-validity') || 'N/A';
                bundleNetwork.textContent = selectedOption.getAttribute('data-network') || 'AT';
                bundleDetails.classList.add('active');
            } else {
                bundleDetails.classList.remove('active');
            }
        });
    }
    
    // Phone number input validation
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            // Remove any non-numeric characters
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Validate the phone number
            if (this.value.length > 0) {
                const isPorted = portedCheckbox ? portedCheckbox.checked : false;
                const validation = validatePhoneNumber(this.value, isPorted);
                
                if (validation.isValid) {
                    this.style.borderColor = '#4CAF50';
                    this.style.boxShadow = '0 0 0 3px rgba(76, 175, 80, 0.2)';
                } else {
                    this.style.borderColor = '#e74c3c';
                    this.style.boxShadow = '0 0 0 3px rgba(231, 76, 60, 0.2)';
                }
            } else {
                this.style.borderColor = '';
                this.style.boxShadow = '';
            }
        });
        
        // Phone number blur validation (remove error message display)
        phoneInput.addEventListener('blur', function() {
            if (this.value.length > 0) {
                const isPorted = portedCheckbox ? portedCheckbox.checked : false;
                const validation = validatePhoneNumber(this.value, isPorted);
                
                if (!validation.isValid) {
                    this.style.borderColor = '#e74c3c';
                    this.style.boxShadow = '0 0 0 3px rgba(231, 76, 60, 0.2)';
                } else {
                    this.style.borderColor = '#4CAF50';
                    this.style.boxShadow = '0 0 0 3px rgba(76, 175, 80, 0.2)';
                }
            }
        });
    }
    
    // Numeric-only input for paste orders textarea
    const ordersTextarea = document.getElementById('ordersTextarea');
    const portedCheckboxModal = document.getElementById('portedNetworkModal');
    const portedCheckboxModalContainer = document.getElementById('portedCheckboxModal');
    
    // Toggle ported checkbox styling in modal
    if (portedCheckboxModal && portedCheckboxModalContainer) {
        portedCheckboxModal.addEventListener('change', function() {
            if (this.checked) {
                portedCheckboxModalContainer.classList.add('checked');
            } else {
                portedCheckboxModalContainer.classList.remove('checked');
            }
            updateOrdersPreview();
        });
    }
    
    if (ordersTextarea) {
        ordersTextarea.addEventListener('input', function(e) {
            const cursorPosition = this.selectionStart;
            const originalValue = this.value;
            
            // Process each line separately
            const lines = originalValue.split('\n');
            const processedLines = lines.map(line => {
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    // Keep only numbers in the phone part
                    parts[0] = parts[0].replace(/[^0-9]/g, '');
                    // Keep only numbers in the data quantity part
                    parts[1] = parts[1].replace(/[^0-9]/g, '');
                } else if (parts.length === 1) {
                    // If only phone number, keep only numbers
                    parts[0] = parts[0].replace(/[^0-9]/g, '');
                }
                return parts.join(' ');
            });
            
            this.value = processedLines.join('\n');
            
            // Restore cursor position
            this.setSelectionRange(cursorPosition, cursorPosition);
            updateOrdersPreview();
        });
    }
    
    // Paste Orders Modal functionality
    const pasteOrders = document.getElementById('pasteOrders');
    const pasteOrdersModal = document.getElementById('pasteOrdersModal');
    const cancelPaste = document.getElementById('cancelPaste');
    const proceedToPay = document.getElementById('ProceedToPay');
    const ordersPreview = document.getElementById('ordersPreview');
    const previewList = document.getElementById('previewList');
    const ordersCount = document.getElementById('ordersCount');
    const totalAmount = document.getElementById('totalAmount');
    const totalValue = document.getElementById('totalValue');
    
    if (pasteOrders && pasteOrdersModal) {
        pasteOrders.addEventListener('click', function() {
            pasteOrdersModal.classList.add('active');
            // Clear the textarea when modal opens
            if (ordersTextarea) ordersTextarea.value = '';
            if (portedCheckboxModal) {
                const isChecked = portedCheckbox ? portedCheckbox.checked : false;
                portedCheckboxModal.checked = isChecked;
                if (portedCheckboxModalContainer) {
                    if (isChecked) {
                        portedCheckboxModalContainer.classList.add('checked');
                    } else {
                        portedCheckboxModalContainer.classList.remove('checked');
                    }
                }
            }
            updateOrdersPreview();
        });
    }
    
    if (cancelPaste && pasteOrdersModal) {
        cancelPaste.addEventListener('click', function() {
            pasteOrdersModal.classList.remove('active');
        });
    }
    
    if (proceedToPay) {
        proceedToPay.addEventListener('click', function() {
            if (!ordersTextarea) return;
            
            const ordersText = ordersTextarea.value.trim();
            if (!ordersText) {
                alert('Please enter some orders');
                return;
            }
            
            // Process the orders
            const isPorted = portedCheckboxModal ? portedCheckboxModal.checked : false;
            const orders = parseOrders(ordersText, isPorted);
            if (orders.length === 0) {
                alert('No valid orders found. Please check the format.');
                return;
            }
            
            // Check for invalid orders
            const invalidOrders = orders.filter(order => !order.isValid);
            if (invalidOrders.length > 0) {
                alert(`Found ${invalidOrders.length} invalid orders. Please fix them before proceeding.`);
                return;
            }
            
            // Calculate total cost
            const totalCost = calculateTotalAmount(orders);
            
            // Show confirmation with order details and total amount
            const orderSummary = orders.map(order => 
                `${order.phone} - ${order.dataQuantity} GB (${order.price} GHS)`
            ).join('\n');
            
            if (confirm(`Add these ${orders.length} orders to cart?\n\n${orderSummary}\n\nTotal Amount: ${totalCost.toFixed(2)} GHS`)) {
                // Show success notification
                showNotification();
                if (pasteOrdersModal) pasteOrdersModal.classList.remove('active');
            }
        });
    }
    
    function updateOrdersPreview() {
        if (!ordersTextarea || !previewList || !ordersCount || !totalValue || !ordersPreview || !totalAmount) return;
        
        const ordersText = ordersTextarea.value.trim();
        previewList.innerHTML = '';
        
        if (!ordersText) {
            ordersPreview.classList.remove('active');
            totalAmount.classList.remove('active');
            ordersCount.textContent = '0';
            totalValue.textContent = '0.00 GHS';
            return;
        }
        
        const isPorted = portedCheckboxModal ? portedCheckboxModal.checked : false;
        const orders = parseOrders(ordersText, isPorted);
        
        if (orders.length === 0) {
            ordersPreview.classList.remove('active');
            totalAmount.classList.remove('active');
            ordersCount.textContent = '0';
            totalValue.textContent = '0.00 GHS';
            return;
        }
        
        ordersPreview.classList.add('active');
        ordersCount.textContent = orders.length;
        
        // Calculate and display total amount
        const totalCost = calculateTotalAmount(orders);
        totalValue.textContent = totalCost.toFixed(2) + ' GHS';
        totalAmount.classList.add('active');
        
        orders.forEach(order => {
            const li = document.createElement('li');
            
            li.innerHTML = `
                <div>
                    <span style="color: ${order.isValid ? '#333' : '#e74c3c'}">${order.phone}</span>
                    <span style="color: ${order.isValid ? '#333' : '#e74c3c'}"> - ${order.dataQuantity} GB</span>
                    ${!order.isValid ? `<div class="order-error">${order.error || 'Invalid order'}</div>` : ''}
                </div>
                <div style="color: #6200ff; font-weight: 600;">
                    ${order.isValid ? order.price.toFixed(2) + ' GHS' : 'Invalid'}
                </div>
            `;
            previewList.appendChild(li);
        });
    }
    
    function parseOrders(text, isPorted = false) {
        const lines = text.split('\n');
        const orders = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            const parts = trimmedLine.split(/\s+/);
            if (parts.length >= 2) {
                const phone = parts[0];
                const dataQuantity = parts[1];
                
                // Validate phone number
                const phoneValidation = validatePhoneNumber(phone, isPorted);
                
                // Validate data quantity
                const isValidDataQuantity = bundleOffers.hasOwnProperty(dataQuantity);
                const dataQuantityError = !isValidDataQuantity ? 'Invalid data quantity. Use: 1, 2, 3, 4, or 5' : null;
                
                // Get price from bundle offers
                const price = isValidDataQuantity ? bundleOffers[dataQuantity] : 0;
                
                // Determine if order is valid
                const isValid = phoneValidation.isValid && isValidDataQuantity;
                const error = phoneValidation.error || dataQuantityError;
                
                orders.push({
                    phone: phone,
                    dataQuantity: dataQuantity,
                    price: price,
                    isValid: isValid,
                    error: error
                });
            }
        }
        
        return orders;
    }
    
    function calculateTotalAmount(orders) {
        return orders.reduce((total, order) => {
            return order.isValid ? total + order.price : total;
        }, 0);
    }
    
    // Excel Upload functionality
    const excelFormat = document.getElementById('excelFormat');
    const excelUploadModal = document.getElementById('excelUploadModal');
    const excelUploadArea = document.getElementById('excelUploadArea');
    const excelUploadInput = document.getElementById('excelUploadInput');
    const cancelExcel = document.getElementById('cancelExcel');
    const uploadExcel = document.getElementById('uploadExcel');
    const fileInfo = document.getElementById('fileInfo');
    const fileDetails = document.getElementById('fileDetails');
    const excelOrdersPreview = document.getElementById('excelOrdersPreview');
    const excelPreviewList = document.getElementById('excelPreviewList');
    const excelOrdersCount = document.getElementById('excelOrdersCount');
    const excelTotalAmount = document.getElementById('excelTotalAmount');
    const excelTotalValue = document.getElementById('excelTotalValue');
    const portedCheckboxExcelModal = document.getElementById('portedNetworkExcelModal');
    const portedCheckboxExcelModalContainer = document.getElementById('portedCheckboxExcelModal');
    
    // Toggle ported checkbox styling in excel modal
    if (portedCheckboxExcelModal && portedCheckboxExcelModalContainer) {
        portedCheckboxExcelModal.addEventListener('change', function() {
            if (this.checked) {
                portedCheckboxExcelModalContainer.classList.add('checked');
            } else {
                portedCheckboxExcelModalContainer.classList.remove('checked');
            }
            // Re-process any existing orders in preview
            const existingOrders = excelPreviewList ? excelPreviewList.querySelectorAll('li') : [];
            if (existingOrders.length > 0) {
                displayExcelOrders(getMockOrdersWithValidation(this.checked));
            }
        });
    }
    
    if (excelFormat && excelUploadModal) {
        excelFormat.addEventListener('click', function() {
            excelUploadModal.classList.add('active');
            if (portedCheckboxExcelModal) {
                const isChecked = portedCheckbox ? portedCheckbox.checked : false;
                portedCheckboxExcelModal.checked = isChecked;
                if (portedCheckboxExcelModalContainer) {
                    if (isChecked) {
                        portedCheckboxExcelModalContainer.classList.add('checked');
                    } else {
                        portedCheckboxExcelModalContainer.classList.remove('checked');
                    }
                }
            }
            resetExcelUpload();
        });
    }
    
    if (excelUploadArea && excelUploadInput) {
        excelUploadArea.addEventListener('click', function() {
            excelUploadInput.click();
        });
        
        excelUploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            excelUploadArea.style.backgroundColor = '#fff0cc';
        });
        
        excelUploadArea.addEventListener('dragleave', function() {
            excelUploadArea.style.backgroundColor = '#fff9e6';
        });
        
        excelUploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            excelUploadArea.style.backgroundColor = '#fff9e6';
            
            if (e.dataTransfer.files.length) {
                handleExcelFile(e.dataTransfer.files[0]);
            }
        });
        
        excelUploadInput.addEventListener('change', function(e) {
            if (e.target.files.length) {
                handleExcelFile(e.target.files[0]);
            }
        });
    }
    
    if (cancelExcel && excelUploadModal) {
        cancelExcel.addEventListener('click', function() {
            excelUploadModal.classList.remove('active');
            resetExcelUpload();
        });
    }
    
    if (uploadExcel) {
        uploadExcel.addEventListener('click', function() {
            const fileName = excelUploadInput?.files[0]?.name || 'uploaded file';
            
            // Get mock orders with validation
            const isPorted = portedCheckboxExcelModal ? portedCheckboxExcelModal.checked : false;
            const mockOrders = getMockOrdersWithValidation(isPorted);
            
            // Filter only valid orders
            const validOrders = mockOrders.filter(order => order.isValid);
            const invalidOrders = mockOrders.filter(order => !order.isValid);
            
            if (validOrders.length === 0) {
                alert('No valid orders found in the file.');
                return;
            }
            
            if (invalidOrders.length > 0) {
                if (!confirm(`Found ${invalidOrders.length} invalid orders. Only ${validOrders.length} valid orders will be processed. Continue?`)) {
                    return;
                }
            }
            
            const totalCost = calculateTotalAmount(validOrders);
            const orderSummary = validOrders.map(order => 
                `${order.phone} - ${order.dataQuantity} GB (${order.price} GHS)`
            ).join('\n');
            
            if (confirm(`Process these ${validOrders.length} orders?\n\n${orderSummary}\n\nTotal Amount: ${totalCost.toFixed(2)} GHS`)) {
                // Show success notification
                showNotification();
                if (excelUploadModal) excelUploadModal.classList.remove('active');
                resetExcelUpload();
            }
        });
    }
    
    function handleExcelFile(file) {
        if (!file) return;
        
        // Validate file type
        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];
        
        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/)) {
            alert('Please upload a valid Excel file (.xlsx, .xls, .csv)');
            return;
        }
        
        // Display file info
        if (fileDetails && fileInfo) {
            fileDetails.innerHTML = `
                <li><strong>File Name:</strong> ${file.name}</li>
                <li><strong>File Size:</strong> ${(file.size / 1024).toFixed(2)} KB</li>
                <li><strong>File Type:</strong> ${file.type || 'Unknown'}</li>
            `;
            fileInfo.classList.add('active');
        }
        
        // Simulate parsing Excel file and extracting orders
        setTimeout(() => {
            const isPorted = portedCheckboxExcelModal ? portedCheckboxExcelModal.checked : false;
            const mockOrders = getMockOrdersWithValidation(isPorted);
            displayExcelOrders(mockOrders);
            if (uploadExcel) uploadExcel.disabled = false;
        }, 1500);
    }
    
    function getMockOrders() {
        return [
            { phone: '0261234567', dataQuantity: '1' },
            { phone: '0569876543', dataQuantity: '2' },
            { phone: '0275551234', dataQuantity: '3' },
            { phone: '0238884567', dataQuantity: '4' },
            { phone: '0501112222', dataQuantity: '5' } // Invalid prefix for AT
        ];
    }
    
    function getMockOrdersWithValidation(isPorted = false) {
        const mockOrders = getMockOrders();
        
        return mockOrders.map(order => {
            const phoneValidation = validatePhoneNumber(order.phone, isPorted);
            const isValidDataQuantity = bundleOffers.hasOwnProperty(order.dataQuantity);
            const dataQuantityError = !isValidDataQuantity ? 'Invalid data quantity' : null;
            
            const isValid = phoneValidation.isValid && isValidDataQuantity;
            const error = phoneValidation.error || dataQuantityError;
            const price = isValidDataQuantity ? bundleOffers[order.dataQuantity] : 0;
            
            return {
                ...order,
                price: price,
                isValid: isValid,
                error: error
            };
        });
    }
    
    function displayExcelOrders(orders) {
        if (!excelPreviewList || !excelOrdersCount || !excelTotalValue || !excelOrdersPreview || !excelTotalAmount) return;
        
        excelPreviewList.innerHTML = '';
        
        if (orders.length === 0) {
            excelOrdersPreview.classList.remove('active');
            excelTotalAmount.classList.remove('active');
            excelOrdersCount.textContent = '0';
            excelTotalValue.textContent = '0.00 GHS';
            return;
        }
        
        excelOrdersPreview.classList.add('active');
        
        // Count valid orders
        const validOrdersCount = orders.filter(order => order.isValid).length;
        excelOrdersCount.textContent = `${validOrdersCount}/${orders.length}`;
        
        // Calculate and display total amount for valid orders
        const totalCost = orders.reduce((total, order) => {
            return order.isValid ? total + order.price : total;
        }, 0);
        excelTotalValue.textContent = totalCost.toFixed(2) + ' GHS';
        excelTotalAmount.classList.add('active');
        
        orders.forEach(order => {
            const li = document.createElement('li');
            
            li.innerHTML = `
                <div>
                    <span style="color: ${order.isValid ? '#333' : '#e74c3c'}">${order.phone}</span>
                    <span style="color: ${order.isValid ? '#333' : '#e74c3c'}"> - ${order.dataQuantity} GB</span>
                    ${!order.isValid ? `<div class="order-error">${order.error || 'Invalid order'}</div>` : ''}
                </div>
                <div style="color: #6200ff; font-weight: 600;">
                    ${order.isValid ? order.price.toFixed(2) + ' GHS' : 'Invalid'}
                </div>
            `;
            excelPreviewList.appendChild(li);
        });
    }
    
    function resetExcelUpload() {
        if (excelUploadInput) excelUploadInput.value = '';
        if (fileInfo) fileInfo.classList.remove('active');
        if (excelOrdersPreview) excelOrdersPreview.classList.remove('active');
        if (excelTotalAmount) excelTotalAmount.classList.remove('active');
        if (uploadExcel) uploadExcel.disabled = true;
    }
    
    // Form submission
    const purchaseBundle = document.getElementById('purchaseBundle');
    
    if (purchaseBundle && phoneInput && bundleSelect) {
        purchaseBundle.addEventListener('click', async function() {
            const phoneNumber = phoneInput.value.trim();
            const selectedBundle = bundleSelect.value;
            const selectedBundlePrice = bundleSelect.options[bundleSelect.selectedIndex]?.getAttribute('data-price');
            
            if (!phoneNumber) {
                alert('Please enter a phone number');
                phoneInput.focus();
                return;
            }
            
            // Validate phone number
            const isPorted = portedCheckbox ? portedCheckbox.checked : false;
            const validation = validatePhoneNumber(phoneNumber, isPorted);
            if (!validation.isValid) {
                alert(validation.error);
                phoneInput.focus();
                return;
            }
            
            if (!selectedBundle) {
                alert('Please select a bundle');
                bundleSelect.focus();
                return;
            }
            
            const selectedOption = bundleSelect.options[bundleSelect.selectedIndex];
            const bundleSize = selectedOption ? selectedOption.text.split(' - ')[0].trim() : '';
            const amount = parseFloat(selectedOption?.getAttribute('data-price')) || 0;
            const portedEl = document.getElementById('portedNetwork');

            showPaymentModal({
                beneficiary: phoneInput.value.trim(),
                package:     new URLSearchParams(window.location.search).get('provider') || 'AT Ishare',
                bundle_size: bundleSize,
                amount:      amount,
                isPorted:    portedEl ? portedEl.checked : false,
            });
        });
    }
});
