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
    const ordersMenu = document.getElementById('ordersMenu');
    const ordersSubMenu = document.getElementById('ordersSubMenu');
    
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
    
    if (ordersMenu && ordersSubMenu) {
        ordersMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            ordersSubMenu.classList.toggle('open');
            
            const chevron = ordersMenu.querySelector('.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = ordersSubMenu.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
            }
        });
    }
    
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

// Logout functionality - UPDATED TO USE DASHBOARD LOGIC
function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    
    console.log('Looking for logout button...', logoutBtn); // Debug log
    
    if (logoutBtn) {
        console.log('Logout button found, adding event listener...'); // Debug log
        
        // Remove any existing event listeners first
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        
        // Add new event listener
        newLogoutBtn.addEventListener('click', handleLogout);
        
        // Also add event listener to original logout button (in case clone didn't work)
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        
        console.log('Event listener added to logout button'); // Debug log
    } else {
        console.error('Logout button not found! Check your HTML for id="logoutBtn"');
    }
}

// Separate logout handler function - UPDATED
function handleLogout(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Logout clicked!'); // Debug log
    
    // Use the same confirmation as dashboard
    if (confirm('Are you sure you want to log out?')) {
        console.log('User confirmed logout'); // Debug log
        
        // Clear login state (same as dashboard)
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
        
        // Optional: Clear other user-specific data
        localStorage.removeItem('userToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('authToken');
        localStorage.removeItem('session');
        
        // Show logout message
        showLogoutNotification();
        
        // Redirect to dashboard login page
        setTimeout(() => {
            window.location.href = '../index.html'; // Updated path
        }, 1500);
    }
}

// Simple logout notification
function showLogoutNotification() {
    // Create notification element
    const notification = document.createElement('div');
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
function checkAuthentication() {
    const isReferralVisit = window.location.pathname.includes('/referral/') ||
                        new URLSearchParams(window.location.search).get('store');
    if (isReferralVisit) return true;

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
function showNotificationToast(title, message, type = 'info') {
    const notification = document.getElementById('notificationToast');
    
    if (!notification) {
        console.warn('Notification toast element not found');
        return;
    }
    
    // Update content
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    if (toastTitle) toastTitle.textContent = title;
    if (toastMessage) toastMessage.innerHTML = message;
    
    // Style based on type
    if (type === 'success') {
        notification.style.background = '#4CAF50';
    } else if (type === 'error') {
        notification.style.background = '#f44336';
    } else if (type === 'warning') {
        notification.style.background = '#ff9800';
    } else if (type === 'info') {
        notification.style.background = '#2196F3';
    }
    
    // Show notification
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
    
    // Auto-hide after 6 seconds
    setTimeout(hideNotificationToast, 6000);
}

function hideNotificationToast() {
    const notification = document.getElementById('notificationToast');
    if (notification) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
    }
}

// Create error element for a field
function createErrorElement(fieldId) {
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.id = `${fieldId}Error`;
    errorElement.style.color = '#ef4444';
    errorElement.style.fontSize = '0.875rem';
    errorElement.style.marginTop = '0.25rem';
    errorElement.style.display = 'none';
    
    return errorElement;
}

// Show error for a specific field
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return false;
    
    // Create or get error element
    let errorElement = document.getElementById(`${fieldId}Error`);
    if (!errorElement) {
        errorElement = createErrorElement(fieldId);
        // Insert error after the input group
        const inputGroup = field.closest('.input-group') || field.parentNode;
        inputGroup.parentNode.insertBefore(errorElement, inputGroup.nextSibling);
    }
    
    // Show error
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    field.style.borderColor = '#ef4444';
    
    return true;
}

// Clear error for a specific field
function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.style.borderColor = '';
    }
    
    const errorElement = document.getElementById(`${fieldId}Error`);
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// Clear all field errors
function clearAllFieldErrors() {
    const fieldIds = ['fullname', 'phone', 'location', 'region', 'ghanaCard', 'dob'];
    fieldIds.forEach(fieldId => clearFieldError(fieldId));
}

// Validation rules for each field
function validateField(fieldId, value) {
    value = value.trim();
    
    switch(fieldId) {
        case 'fullname':
            if (!value) return 'Full name is required';
            const nameParts = value.split(' ').filter(part => part.length > 0);
            if (nameParts.length < 2) return 'Full name not complete (enter first and last name)';
            if (value.length < 3) return 'Name is too short';
            return '';
            
        case 'phone':
            if (!value) return 'Phone number is required';
            
            // Check if ported number checkbox is checked
            const isPorted = document.getElementById('portedNumber')?.checked;
            
            // Clean the phone number (remove spaces, dashes, etc.)
            const cleanPhone = value.replace(/[\s\-()]/g, '');
            
            if (!/^0\d{9}$/.test(cleanPhone)) {
                return 'Enter valid 10-digit Ghanaian number starting with 0';
            }
            
            // If NOT ported, check for MTN format
            if (!isPorted) {
                const mtnPrefixes = ['024', '054', '055', '059', '025', '053'];
                const prefix = cleanPhone.substring(0, 3);
                
                if (!mtnPrefixes.includes(prefix)) {
                    return 'Please enter a valid MTN number (starts with 024, 054, 055, 059, 025, 053)';
                }
            } else {
                // If ported, accept any valid Ghanaian number
                const ghanaPrefixes = ['020', '025', '023', '050', '024', '027', '026', '053', '054', '055', '056', '057', '059'];
                const phonePrefix = cleanPhone.substring(0, 3);
                
                if (!ghanaPrefixes.includes(phonePrefix)) {
                    return 'Please enter a valid Ghanaian mobile number';
                }
            }
            
            return '';
            
        case 'location':
            if (!value) return 'Location is required';
            if (value.length < 2) return 'Location is too short';
            return '';
            
        case 'region':
            if (!value) return 'Please select a region';
            return '';
            
        case 'ghanaCard':
            if (!value) return 'Ghana Card number is required';
            value = value.toUpperCase();
            
            if (!value.startsWith('GHA')) {
                return 'Ghana Card must start with "GHA"';
            }
            
            if (value.length !== 15) {
                return 'Ghana Card must be 13 characters long (format: GHA-123456789-0)';
            }
            
            if (!/^GHA-\d{9}-\d$/.test(value)) {
                return 'Invalid format. Use: GHA-123456789-0';
            }
            
            return '';
            
        case 'dob':
            if (!value) return 'Date of birth is required';
            const dob = new Date(value);
            const today = new Date();
            
            if (dob > today) return 'Date cannot be in the future';
            
        default:
            return '';
    }
}

// Validate entire form
function validateForm() {
    let isValid = true;
    const fieldIds = ['fullname', 'phone', 'location', 'region', 'ghanaCard', 'dob'];
    
    // Clear all previous errors
    clearAllFieldErrors();
    
    // Validate each field
    fieldIds.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        const value = field.value;
        const error = validateField(fieldId, value);
        
        if (error) {
            showFieldError(fieldId, error);
            isValid = false;
            
            // Focus on first invalid field
            if (isValid === false) {
                field.focus();
                isValid = null; // Set to null so only first field gets focused
            }
        }
    });
    
    return isValid === true;
}

// Phone formatting function
function formatPhoneInput() {
    const phoneInput = document.getElementById('phone');
    if (!phoneInput) return;
    
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        // Ensure it starts with 0
        if (value.length > 0 && value[0] !== '0') {
            value = '0' + value;
        }
        
        // Limit to 10 digits
        if (value.length > 10) {
            value = value.substring(0, 10);
        }
        
        // Add spacing for readability
        if (value.length > 3) {
            value = value.substring(0, 3) + ' ' + value.substring(3);
        }
        if (value.length > 7) {
            value = value.substring(0, 7) + ' ' + value.substring(7);
        }
        
        e.target.value = value;
        clearFieldError('phone');
    });
}

// Setup checkbox functionality
function setupCheckboxFunctionality() {
    const portedCheckbox = document.getElementById('portedNumber');
    const portedContainer = document.getElementById('portedCheckboxContainer');
    const portedHint = document.getElementById('portedNumberHint');
    const phoneInput = document.getElementById('phone');
    
    if (!portedCheckbox || !portedContainer || !portedHint) {
        console.warn('Ported checkbox elements not found');
        return;
    }
    
    // Update container class when checkbox changes
    portedCheckbox.addEventListener('change', function() {
        if (this.checked) {
            portedContainer.classList.add('checked');
            portedHint.textContent = "Accepting all Ghanaian numbers (MTN, Telecel, AirtelTigo)";
            if (phoneInput) phoneInput.placeholder = "Any Ghanaian number (024, 020, 027, etc.)";
        } else {
            portedContainer.classList.remove('checked');
            portedHint.textContent = "Check if your number was originally from another network";
            if (phoneInput) phoneInput.placeholder = "0241234567 (MTN only)";
        }
        
        // Re-validate phone number when checkbox changes
        if (phoneInput && phoneInput.value.trim()) {
            clearFieldError('phone');
            const error = validateField('phone', phoneInput.value);
            
            if (!error && phoneInput.value.trim()) {
                phoneInput.style.borderColor = '#10b981';
            } else if (error) {
                showFieldError('phone', error);
            } else {
                phoneInput.style.borderColor = '';
            }
        }
    });
    
    // Initial state
    if (portedCheckbox.checked) {
        portedContainer.classList.add('checked');
        if (portedHint) {
            portedHint.textContent = "Accepting all Ghanaian numbers (MTN, Telecel, AirtelTigo)";
        }
    }
}

// Network detection display
function setupNetworkDetection() {
    const phoneInput = document.getElementById('phone');
    const portedCheckbox = document.getElementById('portedNumber');
    
    if (!phoneInput || !portedCheckbox) return;
    
    // Create network display element if it doesn't exist
    let networkDisplay = document.getElementById('networkDisplay');
    if (!networkDisplay) {
        networkDisplay = document.createElement('div');
        networkDisplay.id = 'networkDisplay';
        networkDisplay.className = 'network-hint';
        networkDisplay.style.fontSize = '0.85rem';
        networkDisplay.style.color = '#666';
        networkDisplay.style.marginTop = '6px';
        networkDisplay.style.minHeight = '16px';
        
        // Insert after the checkbox container
        const checkboxContainer = document.getElementById('portedCheckboxContainer');
        if (checkboxContainer) {
            checkboxContainer.parentNode.insertBefore(networkDisplay, checkboxContainer.nextSibling);
        }
    }
    
    phoneInput.addEventListener('input', function() {
        const cleanValue = this.value.replace(/\D/g, '');
        updateNetworkDetection(cleanValue);
    });
    
    // Update when checkbox changes
    portedCheckbox.addEventListener('change', function() {
        if (phoneInput.value.trim()) {
            updateNetworkDetection(phoneInput.value.replace(/\D/g, ''));
        }
    });
    
    function updateNetworkDetection(phoneNumber) {
        const isPorted = portedCheckbox.checked;
        
        if (!networkDisplay || phoneNumber.length < 10) {
            if (networkDisplay) networkDisplay.style.display = 'none';
            return;
        }
        
        const prefix = phoneNumber.substring(0, 3);
        let network = '';
        let color = '#666';
        
        // Network detection
        const networkMap = {
            '020': 'Telecel', '050': 'Telecel',
            '024': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN', '053': 'MTN', '025': 'MTN',
            '027': 'AirtelTigo', '057': 'AirtelTigo',
            '026': 'AirtelTigo', '056': 'AirtelTigo', '023': 'AirtelTigo',       
        };
        
        if (networkMap[prefix]) {
            network = networkMap[prefix];
            
            if (isPorted) {
                color = '#28a745'; // Green for any Ghanaian network when ported
            } else if (['024', '054', '055', '059', '025', '053'].includes(prefix)) {
                color = '#28a745'; // Green for MTN when not ported
            } else {
                color = '#dc3545'; // Red for non-MTN when not ported
                network += ' - Check "ported number" option';
            }
        } else {
            network = 'Unknown network';
            color = '#dc3545';
        }
        
        networkDisplay.textContent = `Detected: ${network}`;
        networkDisplay.style.color = color;
        networkDisplay.style.display = 'block';
    }
}

// Setup real-time validation
function setupRealTimeValidation() {
    const fields = ['fullname', 'phone', 'location', 'ghanaCard'];
    
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        field.addEventListener('input', function() {
            clearFieldError(fieldId);
            
            // Optional formatting for Ghana Card
            if (fieldId === 'ghanaCard') {
                this.value = this.value.toUpperCase();
            }
            
            // Show validation feedback
            const error = validateField(fieldId, this.value);
            if (!error && this.value.trim()) {
                this.style.borderColor = '#10b981';
            } else {
                this.style.borderColor = '';
            }
        });
    });
    
    // For select and date fields
    const regionField = document.getElementById('region');
    if (regionField) {
        regionField.addEventListener('change', function() {
            clearFieldError('region');
            if (this.value && this.value !== '') {
                this.style.borderColor = '#10b981';
            }
        });
    }
    
    const dobField = document.getElementById('dob');
    if (dobField) {
        dobField.addEventListener('change', function() {
            clearFieldError('dob');
            if (this.value) {
                this.style.borderColor = '#10b981';
            }
        });
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

// Initialize everything when the page loads

// ── Moolre Payment Link helper ────────────────────────────────────────────────
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

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing components...'); // Debug log
    
    initializeTheme();
    initializeSidebar();
    applyUserStoreBranding(); // Load user's store branding
    
    // Set provider context for storefront-prices.js
    localStorage.setItem('providerName', 'MTN AFA');
    
    initializeLogout(); // Initialize logout separately
    
    // Update welcome message if username exists
    const username = localStorage.getItem('username');
    const welcomeElement = document.getElementById('welcomeMessage');
    if (welcomeElement && username) {
        welcomeElement.textContent = `Welcome, ${username}`;
    }
    
    console.log('All components initialized'); // Debug log
});

// Also add logout button listener when DOM is fully loaded (additional safety)
window.addEventListener('load', function() {
    console.log('Window loaded, double-checking logout button...'); // Debug log
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
        console.log('Logout button event listener added on window load'); // Debug log
    }
});

// ── Dynamic AFA price loading ─────────────────────────────────────────────────
// Fallback is the hardcoded 15 GHS — overwritten as soon as the API responds.
let afaPrice = 15;

async function loadAFAPrice() {
    const params     = new URLSearchParams(window.location.search);
    const store      = params.get('store')  || localStorage.getItem('storeSlug')  || '';
    const clientType = params.get('client') || localStorage.getItem('clientType') || 'Customers';

    // Only fetch if we're in a storefront context — otherwise the dealer is
    // viewing their own page and the hardcoded fallback is fine.
    if (!store) return;

    try {
        const res = await fetch(
            `http://localhost:5000/api/storefront-prices` +
            `?store=${encodeURIComponent(store)}` +
            `&clientType=${encodeURIComponent(clientType)}`
        );
        if (!res.ok) return;

        const allPrices = await res.json();

        // Find the MTN AFA entry — provider stored as "MTN AFA" in DB
        const afaEntry = allPrices.find(p =>
            (p.provider || '').trim().toLowerCase() === 'mtn afa'
        );

        if (!afaEntry) {
            console.warn('[MTN AFA] No price entry found for "MTN AFA" in storefront prices');
            return;
        }

        afaPrice = parseFloat(afaEntry.price);

        // Update the fee badge in the card header
        const feeEl = document.getElementById('registrationFee');
        if (feeEl) {
            feeEl.textContent = `Registration Fee: ${afaPrice.toFixed(2)} GHS`;
        }

        console.log(`[MTN AFA] Loaded registration price: ${afaPrice.toFixed(2)} GHS`);
    } catch (err) {
        console.warn('[MTN AFA] Could not load AFA price from storefront API:', err);
    }
}

// INITIALIZE MTN AFA REGISTRATION PAGE SPECIFIC CODE
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing MTN AFA Registration...');
    
    // First check if user is logged in
    const isLoggedIn = checkAuthentication();
    if (!isLoggedIn) {
        return; // Stop initialization if not logged in
    }

    // Load the dealer's price for this registration from the storefront API
    loadAFAPrice();
    
    const registrationForm = document.getElementById('registrationForm');
    if (!registrationForm) {
        console.warn('Registration form not found');
        return;
    }
    
    // Add date input restrictions
    const dobInput = document.getElementById('dob');
    if (dobInput) {
        const today = new Date().toISOString().split('T')[0];
        dobInput.max = today;
        
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - 100);
        dobInput.min = minDate.toISOString().split('T')[0];
    }
    
    // Setup functionality
    setupCheckboxFunctionality();
    formatPhoneInput();
    setupNetworkDetection();
    setupRealTimeValidation();
    
    // FORM SUBMISSION
    registrationForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Validate form
        const isValid = validateForm();
        
        if (!isValid) {
            console.log('Form validation failed');
            return;
        }
        
        // Form is valid - collect data
        const formData = {
            fullname: document.getElementById('fullname').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            location: document.getElementById('location').value.trim(),
            region: document.getElementById('region').value,
            ghanaCard: document.getElementById('ghanaCard').value.trim(),
            dob: document.getElementById('dob').value,
            isPorted: document.getElementById('portedNumber')?.checked || false,
            timestamp: new Date().toISOString()
        };
        
        // Submit order to backend
        const submitBtn = registrationForm.querySelector('.submit-btn');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;
        }

        const result = await submitOrder({
            beneficiary: formData.phone,
            package:     'MTN AFA',
            bundle_size: 'AFA Registration',
            amount:      afaPrice,
            isPorted:    formData.isPorted,
            extra:       { fullname: formData.fullname, location: formData.location,
                           region: formData.region, ghanaCard: formData.ghanaCard, dob: formData.dob },
        });

        if (!result.success) {
            if (submitBtn) { submitBtn.innerHTML = originalBtnText; submitBtn.disabled = false; }
            alert(result.message);
            return;
        }

        localStorage.setItem('paymentTransactionId', result.transactionId);
        localStorage.setItem('pendingOrderData', JSON.stringify({
            package:     'MTN AFA',
            bundle_size: 'AFA Registration',
            amount:      afaPrice,
            beneficiary: formData.phone,
            phoneNumber: formData.phone,
            transactionId: result.transactionId,
            storeSlug:   new URLSearchParams(window.location.search).get('store') || localStorage.getItem('storeSlug') || '',
            clientType:  localStorage.getItem('clientType') || 'Customers'
        }));

        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-key"></i> Redirecting to OTP...';
            submitBtn.disabled = true;
        }
        const returnUrl = `/Dashboard/payment-processing.html?transactionId=${result.transactionId}`;
        localStorage.setItem('otpTransactionId', result.transactionId);
        localStorage.setItem('otpPhoneNumber',   formData.phone);
        localStorage.setItem('otpReturnUrl',     returnUrl);
        setTimeout(() => {
            window.location.href = `../payment-otp.html?txid=${result.transactionId}&phone=${encodeURIComponent(formData.phone)}&return=${encodeURIComponent(returnUrl)}`;
        }, 600);

        // Show success notification
        showNotificationToast(`Registration successful!`, `Welcome ${formData.fullname.split(' ')[0]}`, 'success');
        
        // Clear form
        registrationForm.reset();
        clearAllFieldErrors();
        
        // Reset all field borders
        const allFields = document.querySelectorAll('#registrationForm input, #registrationForm select');
        allFields.forEach(field => {
            field.style.borderColor = '';
        });
        
        // Reset checkbox state
        const portedCheckbox = document.getElementById('portedNumber');
        const portedContainer = document.getElementById('portedCheckboxContainer');
        const portedHint = document.getElementById('portedNumberHint');
        
        if (portedCheckbox) portedCheckbox.checked = false;
        if (portedContainer) portedContainer.classList.remove('checked');
        if (portedHint) {
            portedHint.textContent = "Check if your number was originally from another network";
        }
        
        // Hide network display
        const networkDisplay = document.getElementById('networkDisplay');
        if (networkDisplay) {
            networkDisplay.style.display = 'none';
        }
    });
    
    // Add CSS for checkbox styling and error states
    const style = document.createElement('style');
    style.textContent = `
        .field-error {
            color: #ef4444;
            font-size: 0.875rem;
            margin-top: 0.25rem;
            display: none;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        input.error, select.error {
            border-color: #ef4444 !important;
            animation: shake 0.3s ease-in-out;
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        /* Checkbox styling */
        .ported-checkbox {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-top: 10px;
            padding: 12px;
            background-color: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #ffc107;
            transition: all 0.3s ease;
        }
        
        .ported-checkbox.checked {
            border-left-color: #28a745;
            background-color: #f0fff4;
        }
        
        .ported-checkbox input[type="checkbox"] {
            width: 20px;
            height: 20px;
            cursor: pointer;
            margin-top: 2px;
            accent-color: #ffc107;
        }
        
        .ported-checkbox.checked input[type="checkbox"] {
            accent-color: #28a745;
        }
        
        .ported-checkbox label {
            cursor: pointer;
            user-select: none;
            font-weight: 500;
            color: #333;
        }
        
        .ported-checkbox small {
            display: block;
            font-size: 0.85rem;
            color: #666;
            margin-top: 4px;
            line-height: 1.4;
        }
        
        .network-hint {
            font-size: 0.85rem;
            margin-top: 6px;
            min-height: 16px;
        }
    `;
    document.head.appendChild(style);
    
    console.log('MTN AFA Registration initialized successfully');
});