// transactions.js – Wallet Top‑Up orders
const API_BASE = (() => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000/api' : `http://${h}:5000/api`;
})();

function authHeaders() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

let allTransactions = [];

function getTransactionNumber(txn) {
    return txn.paymentPhoneNumber || txn.payment_phone || txn.phoneNumber || txn.beneficiary_phone || '-';
}

function getStatusDisplay(status = '') {
    const normalized = String(status).trim().toLowerCase();
    if (normalized === 'complete' || normalized === 'completed') {
        return { text: 'Completed', className: 'status-completed' };
    }
    if (normalized === 'failed') {
        return { text: 'Failed', className: 'status-failed' };
    }
    if (normalized === 'processing') {
        return { text: 'Processing', className: 'status-processing' };
    }
    if (normalized === 'pending') {
        return { text: 'Pending', className: 'status-pending' };
    }

    const text = status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : 'Pending';
    return { text, className: 'status-pending' };
}

function isOrderTransaction(txn) {
    return Boolean(txn.orderId) || /bundle purchase/i.test(txn.description || '');
}

async function fetchTransactions() {
    try {
        const res = await fetch(`${API_BASE}/transactions`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        allTransactions = (await res.json()).filter(isOrderTransaction);
        renderTransactions(allTransactions);
    } catch (err) {
        console.error(err);
        renderTransactions([]);
    }
}

function renderTransactions(transactions) {
    const tbody = document.querySelector('.orders-table tbody');
    const mobileContainer = document.querySelector('.mobile-cards');
    if (!tbody) return;
    if (!transactions.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No transactions</div></td></tr>`;
        if (mobileContainer) mobileContainer.innerHTML = `<div class="order-card empty-card">No transactions</div>`;
        return;
    }
    // Desktop table
    let html = '';
    transactions.forEach(txn => {
        const status = getStatusDisplay(txn.status);
        const transactionNumber = getTransactionNumber(txn);
        const date = new Date(txn.created).toLocaleString();
        html += `<tr>
            <td>${transactionNumber}</td>
            <td>${txn.description || 'Wallet Topup'}</td>
            <td>GHC ${txn.amount}</td>
            <td>${txn.method || '-'}</td>
            <td>${date}</td>
            <td><span class="status-badge ${status.className}">${status.text}</span></td>
            <td><a href="#" class="action-btn refresh-txn" data-id="${txn._id}"><i class="fa-solid fa-rotate"></i> Refresh</a></td>
        </tr>`;
    });
    tbody.innerHTML = html;
    // Mobile cards
    if (mobileContainer) {
        let cards = '';
        transactions.forEach(txn => {
            const status = getStatusDisplay(txn.status);
            const transactionNumber = getTransactionNumber(txn);
            cards += `<div class="order-card">
                <div class="card-row"><span class="card-label">NUMBER:</span><span class="card-value">${transactionNumber}</span></div>
                <div class="card-row"><span class="card-label">DESCRIPTION:</span><span class="card-value">${txn.description || 'Wallet Topup'}</span></div>
                <div class="card-row"><span class="card-label">AMOUNT:</span><span class="card-value">GHC ${txn.amount}</span></div>
                <div class="card-row"><span class="card-label">METHOD:</span><span class="card-value">${txn.method || '-'}</span></div>
                <div class="card-row"><span class="card-label">DATE:</span><span class="card-value">${new Date(txn.created).toLocaleString()}</span></div>
                <div class="card-row"><span class="card-label">STATUS:</span><span class="card-value"><span class="status-badge ${status.className}">${status.text}</span></span></div>
                <div class="card-row"><span class="card-label">ACTIONS:</span><span class="card-value"><a href="#" class="action-btn refresh-txn" data-id="${txn._id}"><i class="fa-solid fa-rotate"></i> Refresh</a></span></div>
            </div>`;
        });
        mobileContainer.innerHTML = cards;
    }
    // Attach refresh action
    document.querySelectorAll('.refresh-txn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Re-verify functionality would call: POST /api/transactions/reverify/' + btn.dataset.id);
            // Optional: you can implement a separate endpoint
        });
    });
}

function filterTransactions(searchTerm) {
    const filtered = allTransactions.filter(t => 
        (getTransactionNumber(t).toLowerCase().includes(searchTerm) ||
         t.description?.toLowerCase().includes(searchTerm))
    );
    renderTransactions(filtered);
}

// Initialize theme
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

// Initialize sidebar with branded dashboard link
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
    // Exclude dashboardMenuLink — it handles its own navigation + close
    document.querySelectorAll('.menu-item:not(#dashboardMenuLink)').forEach(item => item.addEventListener('click', closeSidebar));


}

// Initialize logout
function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', () => {
        if (confirm('Log out?')) {
            localStorage.clear();
            window.location.href = '../Registration%20form/login_and_signup.html';
        }
    });
}


function initializeSearch() {
    const searchBtn = document.getElementById('searchBtn');
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.querySelector('.search-input');

    // Toggle search bar open/closed when the search icon is clicked
    if (searchBtn && searchBar) {
        searchBtn.addEventListener('click', () => {
            searchBar.classList.toggle('open');
            if (searchBar.classList.contains('open')) {
                searchInput?.focus();
            }
        });
    }

    // Filter transactions as user types
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterTransactions(e.target.value.toLowerCase()));
    }
}
function initializeRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchTransactions());
}

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) window.location.href = '../Registration%20form/login_and_signup.html';
    initializeTheme();
    initializeSidebar();
    initializeLogout();
    initializeSearch();
    initializeRefresh();
    fetchTransactions();
});
