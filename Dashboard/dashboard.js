// Theme Management
function initializeTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    
    // Check for saved theme preference or default to light
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeUI(currentTheme);
    
    // Toggle theme
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeUI(newTheme);
    });
    
    function updateThemeUI(theme) {
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun theme-icon';
            themeToggle.title = 'Toggle Light Mode';
        } else {
            themeIcon.className = 'fas fa-moon theme-icon';
            themeToggle.title = 'Toggle Dark Mode';
        }
    }
}

function handlePackageCardClick(packageName) {
    const nameKey = packageName.toLowerCase().trim();
    let targetFolder = '';
    let targetFile = 'index.html';
    let provider = '';

    if (nameKey.includes('mtn up2u') || nameKey === 'mtn' || nameKey.includes('mtn express')) {
        targetFolder = 'MTN';
        targetFile = 'mtn.html';
        provider = packageName; // Pass the exact package name — 'MTN' or 'MTN EXPRESS'
    } else if (nameKey.includes('telecel')) {
        targetFolder = 'Telecel';
        targetFile = 'telecel.html';
        provider = 'Telecel';
    } else if (nameKey.includes('at ishare')) {
        targetFolder = 'AT Ishare';
        targetFile = 'at_ishare.html';
        provider = 'AT Ishare';
    } else if (nameKey.includes('at bigtime')) {
        targetFolder = 'AT Bigtime';
        targetFile = 'at_bigtime.html';
        provider = 'AT Bigtime';
    } else if (nameKey.includes('mtn afa')) {
        targetFolder = 'MTN AFA';
        targetFile = 'mtn_afa.html';
        provider = 'MTN AFA';
    }

    if (targetFolder) {
        // Build URL with provider name
        let urlPath = `./${targetFolder}/${targetFile}?provider=${encodeURIComponent(provider)}`;

        // Carry ?store= and ?client= from the current page so bundle pages
        // know which dealer's prices to load and for which client type
        const currentParams = new URLSearchParams(window.location.search);
        const store      = currentParams.get('store')  || localStorage.getItem('storeSlug');
        const clientType = currentParams.get('client') || localStorage.getItem('clientType');
        if (store)      urlPath += `&store=${encodeURIComponent(store)}`;
        if (clientType) urlPath += `&client=${encodeURIComponent(clientType)}`;

        window.location.href = urlPath;
    }
}

// Load providers from API and add dynamic cards
async function loadDynamicProviders() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return; // Only load for logged-in users
        
        const res = await fetch('http://localhost:5000/api/providers', {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) return;
        
        const providers = await res.json();

        // List of hardcoded providers that have dedicated pages.
        // Normalised (lowercase, trimmed, collapsed whitespace) so "telecel",
        // " Telecel ", "TELECEL" etc. are all correctly recognised as duplicates.
        const hardcodedProviders = ['MTN', 'MTN EXPRESS', 'Telecel', 'AT Ishare', 'AT Bigtime', 'MTN AFA'];
        const normalise = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const hardcodedNormalised = hardcodedProviders.map(normalise);

        // Filter out hardcoded providers (by normalised match) to get only new/dynamic ones.
        // Also de-duplicate the dynamic list itself in case the same provider was
        // saved more than once with different casing/spacing.
        const seen = new Set(hardcodedNormalised);
        const newProviders = [];
        for (const p of providers) {
            const key = normalise(p.name);
            if (seen.has(key)) continue;
            seen.add(key);
            newProviders.push(p);
        }

        if (newProviders.length === 0) return; // No new providers

        // Add new providers to the network-cards section
        const networkCardsContainer = document.querySelector('.network-cards');
        if (!networkCardsContainer) return;

        // Also guard against cards that may already exist in the DOM
        // (e.g. if this function somehow runs twice, or a card was server-rendered)
        const existingCardNames = new Set(
            Array.from(networkCardsContainer.querySelectorAll('.network-name'))
                .map(el => normalise(el.textContent))
        );
        
        newProviders.forEach(provider => {
            if (existingCardNames.has(normalise(provider.name))) return; // already on page — skip
            const card = document.createElement('a');
            card.href = '#';
            card.className = 'network-card';
            card.onclick = function() {
                handleDynamicProviderClick(provider.name, provider.logoUrl);
                return false;
            };
            
            card.innerHTML = `
                <div class="network-logo">
                    <img src="${provider.logoUrl || 'https://via.placeholder.com/50?text=' + provider.name}" alt="${provider.name} Logo" style="object-fit: contain;">
                </div>
                <div class="network-info">
                    <div class="network-name">${provider.name}</div>
                    <div class="network-tagline">Dynamic Package</div>
                </div>
                <i class="fas fa-chevron-right"></i>
            `;
            
            networkCardsContainer.appendChild(card);
        });
    } catch (err) {
        console.warn('Could not load dynamic providers:', err);
    }
}

// Handle clicks on dynamic provider cards
function handleDynamicProviderClick(providerName, logoUrl) {
    // Navigate to a generic package page for dynamic providers
    // For now, we'll create a generic URL or redirect to a dynamic page handler
    const provider = encodeURIComponent(providerName);
    const logo = encodeURIComponent(logoUrl || '');
    
    // Navigate to a generic package page that can handle any provider
    window.location.href = `./generic-package.html?provider=${provider}&logo=${logo}`;
}

// Apply user store branding to dashboard
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
        
        // Update document title
        if (store.storeName) {
            document.title = store.storeName;
        }
        
        // Update store name in header
        const headerStoreName = document.getElementById('headerStoreName');
        if (headerStoreName) headerStoreName.textContent = store.storeName;
        
        // Update store description in header
        const headerStoreDesc = document.getElementById('headerStoreDesc');
        if (headerStoreDesc && store.storeDescription) {
            headerStoreDesc.textContent = store.storeDescription;
        }
        
        // Update store logo
        const storeLogo = document.getElementById('storeLogo');
        if (storeLogo && store.storeLogo) {
            storeLogo.src = store.storeLogo;
            storeLogo.alt = store.storeName;
        }
        
        // Update footer store name
        const footerStoreName = document.getElementById('footerStoreName');
        if (footerStoreName) footerStoreName.textContent = store.storeName;
        
        // Update sidebar branding
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeSidebar();
    initializeTheme();
    loadDynamicProviders(); // Load providers from API
    
    // Check if user is logged in.
    // Skip the check entirely when this is a public referral/storefront visit —
    // customers visiting via a referral link are not logged in and should not be redirected.
    const isReferralVisit = window.location.pathname.includes('/referral/') ||
                            new URLSearchParams(window.location.search).get('store');

    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (!isReferralVisit && (!isLoggedIn || isLoggedIn !== 'true')) {
        window.location.href = 'login.html';
    } else {
        // Ensure WhatsApp button is visible
        const whatsappFloat = document.getElementById('whatsappFloat');
        if (whatsappFloat) {
            whatsappFloat.style.display = 'block';
        }
        
        // Apply user store branding if logged in (not a public referral visit)
        if (isLoggedIn === 'true') {
            applyUserStoreBranding();
        }
    }
    
    // Handle iOS viewport height fix
    function setVH() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);
});

// Sidebar functionality
function initializeSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (!menuBtn || !closeBtn || !sidebar || !overlay) {
        console.log('Some sidebar elements not found');
        return;
    }
    
    // Toggle sidebar
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    });
    
    // Close sidebar
    function closeSidebar() {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    
    // Logout functionality - WITH FLASHY NOTIFICATION
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to log out?')) {
                // Show logout notification
                showLogoutNotification();
                
                // Clear login state and redirect after delay
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    localStorage.removeItem('username');
                    
                    // Redirect to login page
                    window.location.href = 'login.html';
                }, 1500); // Wait for notification to show
            }
        });
    }
    
    // Close sidebar when clicking on menu items (except logout)
    document.querySelectorAll('.menu-item').forEach(item => {
        if (!item.classList.contains('logout') && !item.id === 'logoutBtn') {
            item.addEventListener('click', () => {
                closeSidebar();
            });
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeSidebar();
        }
    });
}

// Fix for copy button reference (only run if element exists)
const copyBtn = document.querySelector('.copy-btn');
if (copyBtn) {
    copyBtn.addEventListener('click', function() {
        const linkText = document.querySelector('.link-text').textContent;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(linkText).then(() => {
                showCopyFeedback(this);
            });
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = linkText;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showCopyFeedback(this);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
            document.body.removeChild(textArea);
        }
    });
}

function showCopyFeedback(button) {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.style.background = '#28a745';
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
    }, 2000);
}

// Logout Notification Function (FLASHY VERSION)
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

// Add active state to menu items
document.querySelectorAll('.menu-item').forEach(item => {
    if (!item.classList.contains('logout')) {
        item.addEventListener('click', function() {
            document.querySelectorAll('.menu-item').forEach(i => {
                i.classList.remove('active');
            });
            this.classList.add('active');
        });
    }
});

// Handle touch events for better mobile UX
document.querySelectorAll('.menu-btn, .theme-toggle, .close-btn, .network-card, .copy-btn').forEach(element => {
    element.addEventListener('touchstart', function() {
        this.style.transform = 'scale(0.95)';
    }, { passive: true });
    
    element.addEventListener('touchend', function() {
        this.style.transform = '';
    }, { passive: true });
});

// Prevent default behavior on iOS for form inputs
document.querySelectorAll('input, textarea, select').forEach(element => {
    element.addEventListener('touchstart', function(e) {
        e.stopPropagation();
    }, { passive: true });
});

// WhatsApp Floating Button Functionality
document.addEventListener('DOMContentLoaded', function() {
    const whatsappFloat = document.getElementById('whatsappFloat');
    const whatsappBtn = document.getElementById('whatsappBtn');
    const whatsappOptions = document.getElementById('whatsappOptions');
    const whatsappClose = document.getElementById('whatsappClose');
    
    if (whatsappBtn && whatsappFloat) {
        // Toggle WhatsApp options
        whatsappBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            whatsappFloat.classList.toggle('active');
        });
        
        // Close options when clicking the close button
        if (whatsappClose) {
            whatsappClose.addEventListener('click', function(e) {
                e.stopPropagation();
                whatsappFloat.classList.remove('active');
            });
        }
        
        // Close options when clicking outside
        document.addEventListener('click', function(e) {
            if (whatsappFloat && !whatsappFloat.contains(e.target)) {
                whatsappFloat.classList.remove('active');
            }
        });
        
        // Close options on mobile when option is clicked (optional)
        const whatsappLinks = document.querySelectorAll('.whatsapp-option');
        whatsappLinks.forEach(link => {
            link.addEventListener('click', function() {
                // Small delay to allow navigation before closing (optional)
                setTimeout(() => {
                    if (whatsappFloat) {
                        whatsappFloat.classList.remove('active');
                    }
                }, 300);
            });
        });
        
        // Prevent options from closing when clicking inside them
        if (whatsappOptions) {
            whatsappOptions.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
    }
});