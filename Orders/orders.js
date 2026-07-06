// orders.js – All Orders page
const API_BASE = (() => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000/api' : `http://${h}:5000/api`;
})();
let allOrders = []; // Global collection array holding all state elements

function authHeaders() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Theme initialization helper
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

// Sidebar Navigation controller
function initializeSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar) return;
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay?.classList.add('open');
    });
    const closeSidebar = () => {
        sidebar.classList.remove('open');
        overlay?.classList.remove('open');
    };
    closeBtn?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
    // Exclude dashboardMenuLink — it handles its own navigation
    document.querySelectorAll('.menu-item:not(#dashboardMenuLink)').forEach(item =>
        item.addEventListener('click', closeSidebar)
    );

    // Dashboard link — navigate to default dashboard
    const dashboardLink = document.getElementById('dashboardMenuLink');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeSidebar();
            window.location.href = '../Dashboard/dashboard2.html';
        });
    }
}

// Logout controller
function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to log out?')) {
            localStorage.clear();
            window.location.href = '../Registration%20form/login_and_signup.html';
        }
    });
}

// Async API pull for orders data records
async function fetchOrders() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
        // Fetch user's orders from the API
        const res = await fetch(`${API_BASE}/user/orders`, { headers: authHeaders() });
        if (res.status === 401 || res.status === 403) {
            localStorage.clear();
            alert('Session expired. Please log in again.');
            window.location.href = '../Registration%20form/login_and_signup.html';
            return;
        }
        if (!res.ok) throw new Error('Failed to capture orders from API data backend');
        allOrders = await res.json();
        renderOrders(allOrders);
    } catch (err) {
        console.error('Failed to load orders:', err);
        renderOrders([]); // Show empty state — no fake demo data
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// Helper — format a date value as "M/D/YYYY, H:MM AM/PM"
function formatDateTime(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d)) return '-';
    const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${date}, ${time}`;
}

function normalizeStatusDisplay(status) {
    const raw = String(status || 'Pending').trim();
    if (!raw) return 'Pending';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Dom Builder Engine
function renderOrders(ordersList) {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (!ordersList || ordersList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center !important; padding: 40px 20px; white-space:normal;"><div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text-secondary);"><i class="fas fa-box-open" style="font-size: 2rem;"></i><p>No matching orders found.</p></div></td></tr>`;
        return;
    }

    const WA_NUMBER = '0501784283'; // Default report WhatsApp number

    tbody.innerHTML = ordersList.map(order => {
        const createdDate   = formatDateTime(order.created);
        const completedDate = formatDateTime(order.completed);

        // packageName comes from referral prices (e.g. "1GB", "2GB")
        // Only accept values that look like a data size — reject description strings
        const _pkg = order.packageName || order.bundle_size || order.bundleSize || '';
        const bundleSize = /\d/.test(_pkg) && !/payment|purchase|bundle|for\s/i.test(_pkg) ? _pkg : '-';
        
        const statusDisplay = normalizeStatusDisplay(order.status);
        const statusKey = statusDisplay;
        const statusRaw = statusDisplay.toLowerCase();

        // Status badge colour
        const statusStyle = {
            'Completed':  'background:#dcfce7;color:#16a34a;',
            'Complete':   'background:#dcfce7;color:#16a34a;',
            'Processing': 'background:#dbeafe;color:#1d4ed8;',
            'Pending':    'background:#fef9c3;color:#854d0e;',
            'Failed':     'background:#fee2e2;color:#dc2626;',
            'Cancelled/refunded':  'background:#f3f4f6;color:#6b7280;',
            'Resolved':   'background:#ede9fe;color:#7c3aed;',
        }[statusKey] || 'background:#f3f4f6;color:#374151;';

        // WhatsApp report button — only active when order is completed
        const isCompleted = statusKey === 'Completed' || statusKey === 'Complete';
        const waMsg = encodeURIComponent(
            `Hello, I'd like a report for my order:\nBeneficiary: ${order.beneficiary || '-'}\nPackage: ${order.package || '-'} ${bundleSize}\nAmount: GHS ${parseFloat(order.amount || 0).toFixed(2)}\nDate: ${createdDate}\nStatus: ${statusDisplay}`
        );
        const waHref  = `https://wa.me/233${WA_NUMBER.replace(/^0/, '')}?text=${waMsg}`;
        const waBtn   = isCompleted
            ? `<a href="${waHref}" target="_blank" class="action-btn" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;background:#25d366;color:#fff;padding:6px 12px;border-radius:6px;font-size:0.8rem;font-weight:600;">
                   <i class="fab fa-whatsapp"></i> Report
               </a>`
            : `<button class="action-btn" disabled title="Only available after order is completed" style="opacity:0.4;cursor:not-allowed;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;font-size:0.8rem;">
                   <i class="fab fa-whatsapp"></i> Report
               </button>`;

        return `
            <tr>
                <td data-label="BENEFICIARY">${order.beneficiary || '-'}</td>
                <td data-label="PACKAGE">${order.package || '-'}</td>
                <td data-label="AMOUNT">${parseFloat(order.amount || 0).toFixed(2)} GHS</td>
                <td data-label="BUNDLE SIZE">${bundleSize}</td>
                <td data-label="CREATED">${createdDate}</td>
                <td data-label="COMPLETED">${completedDate}</td>
                <td data-label="STATUS"><span class="status-badge" style="${statusStyle}border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:600;">${statusDisplay}</span></td>
                <td data-label="REPORT">${waBtn}</td>
            </tr>
        `;
    }).join('');
}

// Filters implementation core hook layout
function initializeFilters() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    const resetBtn = document.getElementById('resetFiltersBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    
    if (!applyBtn) return;

    applyBtn.addEventListener('click', () => {
        const statusVal = document.getElementById('statusFilter')?.value || '';
        const packageVal = document.getElementById('packageFilter')?.value || '';
        const sortVal = document.getElementById('sortFilter')?.value || 'newest';
        const dateFromVal = document.getElementById('dateFrom')?.value || '';
        const dateToVal = document.getElementById('dateTo')?.value || '';

        let filtered = [...allOrders];

        if (statusVal) {
            filtered = filtered.filter(o => (o.status || '').toLowerCase() === statusVal.toLowerCase());
        }
        if (packageVal) {
            filtered = filtered.filter(o => (o.package || '').toLowerCase().includes(packageVal.toLowerCase()));
        }
        if (dateFromVal) {
            filtered = filtered.filter(o => o.created && new Date(o.created) >= new Date(dateFromVal));
        }
        if (dateToVal) {
            filtered = filtered.filter(o => o.created && new Date(o.created) <= new Date(dateToVal));
        }

        // Sorting evaluation logic handlers
        if (sortVal === 'newest') {
            filtered.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
        } else if (sortVal === 'oldest') {
            filtered.sort((a, b) => new Date(a.created || 0) - new Date(b.created || 0));
        } else if (sortVal === 'amount-high') {
            filtered.sort((a, b) => parseFloat(b.amount || 0) - parseFloat(a.amount || 0));
        } else if (sortVal === 'amount-low') {
            filtered.sort((a, b) => parseFloat(a.amount || 0) - parseFloat(b.amount || 0));
        }

        renderOrders(filtered);
    });
    
    // Reset filters button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            document.getElementById('statusFilter').value = '';
            document.getElementById('packageFilter').value = '';
            document.getElementById('sortFilter').value = 'newest';
            document.getElementById('dateFrom').value = '';
            document.getElementById('dateTo').value = '';
            renderOrders(allOrders);
        });
    }
    
    // Clear filters button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('statusFilter').value = '';
            document.getElementById('packageFilter').value = '';
            document.getElementById('sortFilter').value = 'newest';
            document.getElementById('dateFrom').value = '';
            document.getElementById('dateTo').value = '';
            renderOrders(allOrders);
        });
    }
}

// Search utility with toggle functionality
function initializeSearch() {
    // Handle mobile search bar toggle
    const searchBtn = document.getElementById('searchBtn');
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.querySelector('#searchBar .search-input');
    
    // Toggle search bar on mobile
    if (searchBtn && searchBar) {
        searchBtn.addEventListener('click', () => {
            searchBar.classList.toggle('open');
            if (searchBar.classList.contains('open')) {
                searchInput?.focus();
            }
        });
    }
    
    // Handle desktop search
    const searchBtnDesktop = document.getElementById('searchBtnDesktop');
    const searchBarDesktop = document.getElementById('searchBarDesktop');
    const searchInputDesktop = document.querySelector('#searchBarDesktop .search-input');
    
    if (searchBtnDesktop && searchBarDesktop) {
        searchBtnDesktop.addEventListener('click', () => {
            searchBarDesktop.classList.toggle('open');
            if (searchBarDesktop.classList.contains('open')) {
                searchInputDesktop?.focus();
            }
        });
    }

    // Search input listeners for both mobile and desktop
    const allSearchInputs = document.querySelectorAll('.search-input');
    allSearchInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                renderOrders(allOrders);
                return;
            }

            const filtered = allOrders.filter(o => 
                (o.beneficiary || '').toLowerCase().includes(term) || 
                (o.package || '').toLowerCase().includes(term) ||
                (o.status || '').toLowerCase().includes(term)
            );
            renderOrders(filtered);
        });
    });
}

function initializeRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchOrders();
        });
    }
}

// Bootstrapper listener setup execution
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) {
        alert('Session expired. Please log in again.');
        window.location.href = '../Registration%20form/login_and_signup.html';
        return;
    }
    initializeTheme();
    initializeSidebar();
    initializeLogout();
    initializeSearch();
    initializeFilters();
    initializeRefreshButton();
    fetchOrders();
});