// withdrawal page – real API calls
const API_BASE = (() => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000/api' : `http://${h}:5000/api`;
})();

function authHeaders() {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function checkAuth() {
    if (!localStorage.getItem('token')) {
        window.location.href = '../Registration%20form/login_and_signup.html';
        return false;
    }
    return true;
}

// Theme, sidebar, logout (same functions as before – keep them)
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

function initializeSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!menuBtn || !sidebar) return;

    const openSidebar = () => {
        sidebar.classList.add('open');
        overlay?.classList.add('open');
    };
    const closeSidebar = () => {
        sidebar.classList.remove('open');
        overlay?.classList.remove('open');
    };

    menuBtn.addEventListener('click', openSidebar);
    closeBtn?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
    document.querySelectorAll('.menu-item:not(.logout)').forEach(item => {
        item.addEventListener('click', closeSidebar);
    });
}

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

// Show toast notification
function showNotification(message, type = 'success') {
    const toast = document.getElementById('notificationToast');
    const toastMessage = document.getElementById('toastMessage');
    if (toast && toastMessage) {
        toastMessage.innerHTML = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 6000);
    } else {
        alert(message);
    }
}
function hideNotification() {
    document.getElementById('notificationToast')?.classList.add('hidden');
}
window.hideNotification = hideNotification;

// Fetch balance and pending withdrawals
async function loadBalanceAndInfo() {
    try {
        const res = await fetch(`${API_BASE}/balance`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const balanceElement = document.querySelector('.balance-amount');
        if (balanceElement) {
            let pendingText = data.pendingWithdrawals > 0 ? `<span class="balance-change">(GHS ${data.pendingWithdrawals.toFixed(2)} pending)</span>` : '';
            balanceElement.innerHTML = `GHS ${data.availableBalance.toFixed(2)} ${pendingText}`;
        }
        return data.availableBalance;
    } catch (err) {
        console.error(err);
        const balanceElement = document.querySelector('.balance-amount');
        if (balanceElement) balanceElement.innerHTML = 'GHS 0.00';
        return 0;
    }
}

// Submit withdrawal request
async function submitWithdrawal(amount, provider, phoneNumber, accountName) {
    try {
        const res = await fetch(`${API_BASE}/withdrawals`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ amount, provider, phoneNumber, accountName })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(`✅ Withdrawal request for GHS ${amount.toFixed(2)} submitted!`, 'success');
            loadBalanceAndInfo(); // refresh balance
            return true;
        } else {
            showNotification(data.message || 'Withdrawal failed', 'error');
            return false;
        }
    } catch (err) {
        console.error(err);
        showNotification('Network error. Please try again.', 'error');
        return false;
    }
}

// Form handling (same as before but with real submission)
function initializeWithdrawalForm() {
    const form = document.getElementById('withdrawalForm');
    const withdrawBtn = document.getElementById('withdrawBtn');
    const btnContent = document.getElementById('btnContent');
    const btnLoader = document.getElementById('btnLoader');
    const amountInput = document.getElementById('amount');
    const phoneInput = document.getElementById('phoneNumber');
    const accountNameInput = document.getElementById('accountName');
    let selectedProvider = 'mtn';
    if (!form || !withdrawBtn || !btnContent || !btnLoader || !amountInput || !phoneInput || !accountNameInput) return;
    
    const providerOptions = document.querySelectorAll('.provider-option');
    providerOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            providerOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedProvider = opt.dataset.provider;
        });
    });
    
    // Phone number formatting
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 10) val = val.slice(0,10);
            e.target.value = val;
        });
    }
    
    // Amount validation
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            const val = parseFloat(amountInput.value);
            if (val < 50 || val > 5000) amountInput.style.borderColor = '#ef4444';
            else amountInput.style.borderColor = '#10b981';
        });
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(amountInput.value);
        const phoneNumber = phoneInput.value.trim();
        const accountName = accountNameInput.value.trim();
        
        if (isNaN(amount) || amount < 50) return showNotification('Minimum GHS 50', 'error');
        if (amount > 5000) return showNotification('Maximum GHS 5,000', 'error');
        if (!phoneNumber || phoneNumber.length !== 10) return showNotification('Valid 10‑digit phone number required', 'error');
        if (!accountName) return showNotification('Name on account required', 'error');
        
        // Show loading
        btnContent.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        withdrawBtn.disabled = true;
        
        const success = await submitWithdrawal(amount, selectedProvider, phoneNumber, accountName);
        
        btnContent.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        withdrawBtn.disabled = false;
        
        if (success) form.reset();
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    initializeTheme();
    initializeSidebar();
    initializeLogout();
    initializeWithdrawalForm();
    await loadBalanceAndInfo();
});
