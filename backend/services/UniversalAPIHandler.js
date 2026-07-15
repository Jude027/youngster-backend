// Admin panel â€“ full management (including Role Price Mapping)
const API_BASE = 'https://youngster-backend-production.up.railway.app/api';
let token = localStorage.getItem('token');

if (!token) {
    window.location.href = '../Registration%20form/login_and_signup.html';
}

function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function normalizeStatusDisplay(status) {
    const normalized = String(status || 'pending').trim().toLowerCase();
    if (!normalized) return 'Pending';
    if (normalized === 'complete') return 'Completed';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// ========== Helper: Show Modal ==========
let modal, modalTitle, modalFields, editForm, modalCallback;

function initializeModal() {
    modal = document.getElementById('editModal');
    modalTitle = document.getElementById('modalTitle');
    modalFields = document.getElementById('modalFields');
    editForm = document.getElementById('editForm');
    modalCallback = null;

    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (modalCallback) modalCallback();
            modal.style.display = 'none';
        });
    }

    const modalClose = document.querySelector('.modal .close');
    if (modalClose) {
        modalClose.addEventListener('click', () => modal.style.display = 'none');
    }

    window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

function showModal(title, fieldsHtml, onSave) {
    modalTitle.innerText = title;
    modalFields.innerHTML = fieldsHtml;
    modal.style.display = 'block';
    modalCallback = onSave;
}

// ========== Check Admin ==========
async function checkAdmin() {
    try {
        const res = await fetch(`${API_BASE}/me`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const user = await res.json();
        if (user.role !== 'admin') {
            alert('Admin access required');
            window.location.href = '../Registration%20form/login_and_signup.html';
        }
        document.getElementById('adminName').innerText = user.username;
    } catch (err) {
        console.error(err);
        alert('Could not verify admin status. Please log in again.');
        window.location.href = '../Registration%20form/login_and_signup.html';
    }
}

// ========== Tab Switching - Initialize when DOM is ready ==========
function initializeTabSwitching() {
    console.log('[DEBUG] initializeTabSwitching called');
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-content');
    console.log('[DEBUG] Found', navBtns.length, 'nav buttons and', tabs.length, 'tabs');

    if (navBtns.length === 0) {
        console.error('[ERROR] No nav buttons found!');
        return;
    }

    navBtns.forEach((btn, idx) => {
        console.log(`[DEBUG] Attaching listener to button ${idx}:`, btn.dataset.tab);
        btn.addEventListener('click', (e) => {
            console.log('[DEBUG] Nav button clicked:', e.currentTarget.dataset.tab);
            const tabId = btn.dataset.tab;
            if (!tabId) return;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabs.forEach(tab => tab.classList.remove('active'));
            const tabIdMap = {
                'payment-gateways': 'paymentGatewaysTab',
                'base-prices': 'base-pricesTab',
                'master-prices': 'master-pricesTab',
                'role-price-mapping': 'role-price-mappingTab',
                'provider-api': 'provider-apiTab'
            };
            const tabElId = tabIdMap[tabId] || (tabId + 'Tab');
            const tabEl = document.getElementById(tabElId);
            if (tabEl) tabEl.classList.add('active');
            document.getElementById('pageTitle').innerText = btn.innerText.trim();
            if (tabId === 'dashboard') loadStats();
            else if (tabId === 'users') loadUsers();
            else if (tabId === 'orders') loadOrders();
            else if (tabId === 'transactions') loadTransactions();
            else if (tabId === 'prices') loadPrices();
            else if (tabId === 'master-prices') loadMasterPrices();
            else if (tabId === 'provider-api') loadProvidersForAPI();
            else if (tabId === 'payment-gateways') loadPaymentGateways();
            else if (tabId === 'base-prices') loadBasePrices();
            else if (tabId === 'withdrawals') loadWithdrawals();
            else if (tabId === 'stores') loadStores();
            else if (tabId === 'role-price-mapping') loadRoleMappings();
        });
    });
    console.log('[DEBUG] initializeTabSwitching complete');
}

// ========== DASHBOARD STATS ==========
async function loadStats() {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '<p style="padding:20px;color:#aaa;">Loadingâ€¦</p>';
    try {
        const res = await fetch(`${API_BASE}/admin/stats`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const stats = await res.json();
        const revenue = ((stats.totalRevenue ?? stats.totalVolume) || 0).toFixed(2);
        const commission = (stats.totalCommission || 0).toFixed(2);
        grid.innerHTML = `
            <div class="stat-card"><div class="stat-info"><h3>${stats.totalUsers ?? 0}</h3><p>Total Users</p></div><div class="stat-icon"><i class="fas fa-users"></i></div></div>
            <div class="stat-card"><div class="stat-info"><h3>${stats.totalOrders ?? 0}</h3><p>Orders</p></div><div class="stat-icon"><i class="fas fa-shopping-cart"></i></div></div>
            <div class="stat-card"><div class="stat-info"><h3>${stats.pendingWithdrawals ?? 0}</h3><p>Pending Withdrawals</p></div><div class="stat-icon"><i class="fas fa-clock"></i></div></div>
            <div class="stat-card"><div class="stat-info"><h3>GHS ${revenue}</h3><p>Total Revenue</p></div><div class="stat-icon"><i class="fas fa-chart-line"></i></div></div>
            <div class="stat-card"><div class="stat-info"><h3>GHS ${commission}</h3><p>Total Commission</p></div><div class="stat-icon"><i class="fas fa-coins"></i></div></div>
        `;
    } catch (err) {
        console.error('loadStats:', err);
        grid.innerHTML = `<p style="padding:20px;color:#e74c3c;"><i class="fas fa-exclamation-triangle"></i> ${err.message}</p>`;
    }
}

// ========== USERS ==========
let allClientTypes = [];

async function loadUsers() {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
        const users = await res.json();
        tbody.innerHTML = '';
        users.forEach(user => {
            const row = tbody.insertRow();
            row.insertCell(0).innerText = user._id.slice(-6);
            row.insertCell(1).innerText = user.username;
            row.insertCell(2).innerText = user.email;
            row.insertCell(3).innerText = user.businessName || '-';
            row.insertCell(4).innerText = `GHS ${(user.availableBalance || 0).toFixed(2)}`;
            row.insertCell(5).innerHTML = `<span class="status-badge">${user.role}</span>`;
            row.insertCell(6).innerHTML = `
                <button class="action-btn edit-btn" onclick="editUser('${user._id}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete-btn" onclick="deleteUser('${user._id}')"><i class="fas fa-trash"></i></button>
            `;
        });
    } catch (err) { console.error(err); }
}

// ========== CLIENT TYPES (roles) ==========
async function loadClientTypes() {
    try {
        const res = await fetch(`${API_BASE}/client-types`, { headers: authHeaders() });
        if (res.ok) {
            const types = await res.json();
            allClientTypes = types.length ? types : ['Dealers', 'Super-agents', 'Agents', 'Sub-agents', 'Customers'];
        } else {
            allClientTypes = ['Dealers', 'Super-agents', 'Agents', 'Sub-agents', 'Customers'];
        }
    } catch (err) {
        allClientTypes = ['Dealers', 'Super-agents', 'Agents', 'Sub-agents', 'Customers'];
    }
    window.allClientTypesGlobal = allClientTypes;
    return allClientTypes;
}

window.editUser = async (id) => {
    await loadClientTypes();
    const userRes = await fetch(`${API_BASE}/admin/users/${id}`, { headers: authHeaders() });
    const user = await userRes.json();
    const typesRes = await fetch(`${API_BASE}/admin/users/${id}/permitted-types`, { headers: authHeaders() });
    const permitted = await typesRes.json();
    const selectedTypes = permitted.permittedClientTypes || [];
    const checkboxes = allClientTypes.map(type => `
        <label style="display: inline-block; margin-right: 15px; margin-bottom: 8px;">
            <input type="checkbox" name="permittedType" value="${type}" ${selectedTypes.includes(type) ? 'checked' : ''}>
            ${type}
        </label>
    `).join('');
    showModal('Edit User', `
        <div class="input-group"><label>Role (used to determine original price column)</label>
            <select id="role">${allClientTypes.map(ct => `<option value="${ct}" ${user.role === ct ? 'selected' : ''}>${ct}</option>`).join('')}
            </select>
        </div>
        <div class="input-group"><label>Available Balance (GHS)</label><input type="number" id="balance" step="0.01" value="${user.availableBalance || 0}"></div>
        <div class="input-group"><label>Store Name</label><input type="text" id="storeName" value="${user.storeName || ''}"></div>
        <div class="input-group"><label>Permitted Columns (priceâ€‘entry fields on Referral Prices page)</label><br><div id="permittedCheckboxes">${checkboxes}</div></div>
    `, async () => {
        const role = document.getElementById('role').value;
        const availableBalance = parseFloat(document.getElementById('balance').value);
        const storeName = document.getElementById('storeName').value;
        const selectedPermitted = Array.from(document.querySelectorAll('#permittedCheckboxes input:checked')).map(cb => cb.value);
        await fetch(`${API_BASE}/admin/users/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ role, availableBalance, storeName }) });
        await fetch(`${API_BASE}/admin/users/${id}/permitted-types`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ permittedClientTypes: selectedPermitted }) });
        loadUsers();
    });
};

window.deleteUser = async (id) => {
    if (confirm('Delete this user?')) {
        await fetch(`${API_BASE}/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() });
        loadUsers();
    }
};

// ========== ORDERS ==========
async function loadOrders() {
    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/admin/orders`, { headers: authHeaders() });
    const orders = await res.json();
    tbody.innerHTML = '';

    const fmtDT = v => {
        if (!v) return '-';
        const d = new Date(v);
        return isNaN(d) ? '-' : d.toLocaleDateString('en-US') + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };
    const esc = v => String(v || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
    const badgeStyle = {
        completed: 'background:#dcfce7;color:#16a34a;',
        complete: 'background:#dcfce7;color:#16a34a;',
        processing: 'background:#dbeafe;color:#1d4ed8;',
        pending: 'background:#fef9c3;color:#854d0e;',
        failed: 'background:#fee2e2;color:#dc2626;',
        cancelled: 'background:#f3f4f6;color:#6b7280;',
        'cancelled/refunded': 'background:#f3f4f6;color:#6b7280;',
        resolved: 'background:#ede9fe;color:#7c3aed;',
    };

    orders.forEach(order => {
        const bundle = order.packageName || order.bundle_size || order.bundleSize || order.bundle || '-';
        const st = (order.status || 'pending').toLowerCase();
        const bStyle = (badgeStyle[st] || 'background:#f3f4f6;color:#374151;') + 'border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:600;display:inline-block;';
        const row = tbody.insertRow();
        row.insertCell(0).innerText = order._id.slice(-6);
        row.insertCell(1).innerText = order.userId?.username || '-';
        row.insertCell(2).innerText = order.beneficiary || '-';
        row.insertCell(3).innerText = order.package || '-';
        row.insertCell(4).innerText = bundle;
        row.insertCell(5).innerText = `GHS ${parseFloat(order.amount || 0).toFixed(2)}`;
        const reportNote = order.report
            ? `<div style="margin-top:6px;color:#b45309;font-size:0.75rem;line-height:1.25;max-width:220px;white-space:normal;">${esc(order.report)}</div>`
            : '';
        row.insertCell(6).innerHTML = `<span style="${bStyle}">${order.status || 'pending'}</span>${reportNote}`;
        row.insertCell(7).innerText = fmtDT(order.created);
        row.insertCell(8).innerText = fmtDT(order.completed);
        row.insertCell(9).innerHTML = `<button class="action-btn edit-btn" onclick="editOrder('${order._id}')"><i class="fas fa-edit"></i></button>`;
    });
}

window.editOrder = async (id) => {
    const res = await fetch(`${API_BASE}/admin/orders/${id}`, { headers: authHeaders() });
    const order = await res.json();
    showModal('Edit Order', `
        <div class="input-group"><label>Status</label><select id="status">
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled/refunded">Cancelled</option>
        </select></div>
        <div class="input-group"><label>Report</label><textarea id="report" rows="3"></textarea></div>
    `, async () => {
        const status = document.getElementById('status').value;
        const report = document.getElementById('report').value;
        await fetch(`${API_BASE}/admin/orders/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status, report }) });
        loadOrders();
    });
    document.getElementById('status').value = order.status;
    document.getElementById('report').value = order.report || '';
};

// ========== TRANSACTIONS ==========
async function loadTransactions() {
    const tbody = document.querySelector('#transactionsTable tbody');
    tbody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/admin/transactions`, { headers: authHeaders() });
    const txns = await res.json();
    tbody.innerHTML = '';
    txns.forEach(txn => {
        const displayStatus = normalizeStatusDisplay(txn.status);
        const row = tbody.insertRow();
        row.insertCell(0).innerText = txn._id.slice(-6);
        row.insertCell(1).innerText = txn.userId?.username || '-';
        row.insertCell(2).innerText = txn.description;
        row.insertCell(3).innerText = `GHS ${txn.amount}`;
        row.insertCell(4).innerText = txn.method;
        row.insertCell(5).innerHTML = `<span class="status-badge status-${displayStatus.toLowerCase()}">${displayStatus}</span>`;
        row.insertCell(6).innerText = new Date(txn.created).toLocaleString();
        row.insertCell(7).innerHTML = `<button class="action-btn edit-btn" onclick="editTransaction('${txn._id}')"><i class="fas fa-edit"></i></button>`;
    });
}

window.editTransaction = async (id) => {
    const res = await fetch(`${API_BASE}/admin/transactions/${id}`, { headers: authHeaders() });
    const txn = await res.json();
    showModal('Edit Transaction', `
        <div class="input-group"><label>Status</label><select id="status">
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
        </select></div>
    `, async () => {
        const status = document.getElementById('status').value;
        await fetch(`${API_BASE}/admin/transactions/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status }) });
        loadTransactions();
    });
    const normalizedValue = String(txn.status || 'pending').trim().toLowerCase();
    document.getElementById('status').value = normalizedValue === 'complete' ? 'completed' : normalizedValue;
};

// ========== REFERRAL PRICES ==========
async function loadPrices() {
    const tbody = document.querySelector('#pricesTable tbody');
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/admin/referral-prices`, { headers: authHeaders() });
    const prices = await res.json();
    tbody.innerHTML = '';
    prices.forEach(price => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = price.userId?.username || price.userId;
        row.insertCell(1).innerText = price.provider;
        row.insertCell(2).innerText = price.packageName;
        row.insertCell(3).innerText = price.clientType;
        row.insertCell(4).innerText = `GHS ${price.price}`;
        row.insertCell(5).innerText = `GHS ${price.originalPrice}`;
        row.insertCell(6).innerHTML = `<button class="action-btn edit-btn" onclick="editPrice('${price._id}')"><i class="fas fa-edit"></i></button>`;
    });
}

window.editPrice = async (id) => {
    const res = await fetch(`${API_BASE}/admin/referral-prices/${id}`, { headers: authHeaders() });
    const price = await res.json();
    showModal('Edit Price', `<div class="input-group"><label>Price (GHS)</label><input type="number" id="price" step="0.01" value="${price.price}"></div>`, async () => {
        await fetch(`${API_BASE}/admin/referral-prices/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ price: parseFloat(document.getElementById('price').value) }) });
        loadPrices();
    });
};

// ========== MASTER PRICES ==========
async function loadMasterPrices() {
    const tbody = document.querySelector('#masterPricesTable tbody');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/master-prices`, { headers: authHeaders() });
        const prices = await res.json();
        tbody.innerHTML = '';
        prices.forEach(price => {
            const row = tbody.insertRow();
            row.insertCell(0).innerText = price.provider;
            row.insertCell(1).innerText = price.packageName;
            row.insertCell(2).innerText = `GHS ${price.originalPrice}`;
            row.insertCell(3).innerHTML = `
                <button class="action-btn edit-btn" onclick="editMasterPrice('${price._id}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete-btn" onclick="deleteMasterPrice('${price._id}')"><i class="fas fa-trash"></i></button>
            `;
        });
    } catch (err) { console.error(err); }
}

window.editMasterPrice = async (id) => {
    const res = await fetch(`${API_BASE}/master-prices`, { headers: authHeaders() });
    const prices = await res.json();
    const price = prices.find(p => p._id === id);
    if (!price) return;
    showModal('Edit Master Price', `
        <div class="input-group"><label>Provider</label><input type="text" id="provider" value="${price.provider}" readonly></div>
        <div class="input-group"><label>Package Name</label><input type="text" id="packageName" value="${price.packageName}" readonly></div>
        <div class="input-group"><label>Original Price (GHS)</label><input type="number" id="originalPrice" step="0.01" value="${price.originalPrice}"></div>
    `, async () => {
        const originalPrice = parseFloat(document.getElementById('originalPrice').value);
        if (isNaN(originalPrice)) return alert('Invalid price');
        await fetch(`${API_BASE}/admin/master-prices`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ provider: price.provider, packageName: price.packageName, originalPrice })
        });
        loadMasterPrices();
    });
};

window.deleteMasterPrice = async (id) => {
    if (!confirm('Delete this master price?')) return;
    await fetch(`${API_BASE}/admin/master-prices/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadMasterPrices();
};

document.getElementById('addMasterPriceBtn')?.addEventListener('click', () => {
    showModal('Add Master Price', `
        <div class="input-group"><label>Provider</label><input type="text" id="provider" placeholder="e.g., MTN Packages"></div>
        <div class="input-group"><label>Package Name</label><input type="text" id="packageName" placeholder="e.g., 1GB"></div>
        <div class="input-group"><label>Original Price (GHS)</label><input type="number" id="originalPrice" step="0.01"></div>
    `, async () => {
        const provider = document.getElementById('provider').value.trim();
        const packageName = document.getElementById('packageName').value.trim();
        const originalPrice = parseFloat(document.getElementById('originalPrice').value);
        if (!provider || !packageName || isNaN(originalPrice)) { alert('All fields required'); return; }
        await fetch(`${API_BASE}/admin/master-prices`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ provider, packageName, originalPrice })
        });
        loadMasterPrices();
    });
});

document.getElementById('refreshMasterPrices')?.addEventListener('click', loadMasterPrices);

// ========== ROLE PRICE MAPPING (NEW) ==========
// Shows a table: each row = one role â†’ which BasePrice column maps to its "Original Price"
async function loadRoleMappings() {
    const tbody = document.querySelector('#roleMappingTable tbody');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    try {
        const [mappingsRes, clientTypesRes] = await Promise.all([
            fetch(`${API_BASE}/admin/role-price-mapping`, { headers: authHeaders() }),
            fetch(`${API_BASE}/client-types`, { headers: authHeaders() })
        ]);
        const mappings = await mappingsRes.json();
        const clientTypes = clientTypesRes.ok ? await clientTypesRes.json() : allClientTypes;
        tbody.innerHTML = '';

        if (!mappings.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">
                No mappings set yet. Click "+ Add / Update Mapping" to configure.
            </td></tr>`;
            return;
        }

        mappings.forEach(m => {
            const row = tbody.insertRow();
            row.insertCell(0).innerHTML = `<span class="status-badge">${m.role}</span>`;
            row.insertCell(1).innerHTML = `
                <span style="background:#e8f8f5; color:#1abc9c; padding:4px 10px; border-radius:12px; font-weight:600;">
                    ${m.basePriceClientType}
                </span>
                <span style="color:#888; font-size:0.8rem; margin-left:8px;">column in Base Prices</span>`;
            row.insertCell(2).innerText = m.updatedAt ? new Date(m.updatedAt).toLocaleString() : '-';
            row.insertCell(3).innerHTML = `
                <button class="action-btn edit-btn" onclick="editRoleMapping('${m.role}', '${m.basePriceClientType}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete-btn" onclick="deleteRoleMapping('${m.role}')"><i class="fas fa-trash"></i></button>
            `;
        });
    } catch (err) {
        console.error(err);
        document.querySelector('#roleMappingTable tbody').innerHTML =
            '<tr><td colspan="4" style="color:red;">Failed to load mappings</td></tr>';
    }
}

// Open modal to add or edit a role â†’ column mapping
async function openRoleMappingModal(existingRole = '', existingColumn = '') {
    await loadClientTypes(); // ensure allClientTypes is fresh
    const roleOptions = allClientTypes
        .map(ct => `<option value="${ct}" ${ct === existingRole ? 'selected' : ''}>${ct}</option>`)
        .join('');
    const columnOptions = allClientTypes
        .map(ct => `<option value="${ct}" ${ct === existingColumn ? 'selected' : ''}>${ct}</option>`)
        .join('');

    showModal(
        existingRole ? `Edit Mapping: ${existingRole}` : 'Add Role Price Mapping',
        `
        <p style="font-size:0.88rem; color:#555; margin-bottom:12px;">
            Choose which <strong>Base Price column</strong> will be shown as 
            <em>"Original Price"</em> to users with the selected role.
        </p>
        <div class="input-group">
            <label>User Role</label>
            <select id="mappingRole" ${existingRole ? 'disabled' : ''}>${roleOptions}</select>
            ${existingRole ? `<input type="hidden" id="mappingRoleHidden" value="${existingRole}">` : ''}
        </div>
        <div class="input-group">
            <label>Base Price Column to use as "Original Price"</label>
            <select id="mappingColumn">${columnOptions}</select>
        </div>
        `,
        async () => {
            const role = existingRole
                ? document.getElementById('mappingRoleHidden')?.value || existingRole
                : document.getElementById('mappingRole').value;
            const basePriceClientType = document.getElementById('mappingColumn').value;
            if (!role || !basePriceClientType) return alert('Both fields are required');
            const res = await fetch(`${API_BASE}/admin/role-price-mapping`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ role, basePriceClientType })
            });
            if (res.ok) {
                loadRoleMappings();
            } else {
                const err = await res.json();
                alert('Failed: ' + err.message);
            }
        }
    );
}

window.editRoleMapping = (role, column) => openRoleMappingModal(role, column);

window.deleteRoleMapping = async (role) => {
    if (!confirm(`Remove mapping for "${role}"? Users with this role will fall back to Master Price values.`)) return;
    await fetch(`${API_BASE}/admin/role-price-mapping/${encodeURIComponent(role)}`, {
        method: 'DELETE', headers: authHeaders()
    });
    loadRoleMappings();
};

document.getElementById('addRoleMappingBtn')?.addEventListener('click', () => openRoleMappingModal());
document.getElementById('refreshRoleMappings')?.addEventListener('click', loadRoleMappings);

// ========== BASE PRICES ==========
let allBasePrices = [];
let clientTypes = [];
let allProviders = [];

async function updateProviderLogo(providerName, base64Logo) {
    await fetch(`${API_BASE}/admin/providers`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ name: providerName, logoUrl: base64Logo })
    });
    const provRes = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
    allProviders = await provRes.json();
}

async function loadBasePrices() {
    await loadClientTypes();
    clientTypes = [...allClientTypes];
    try {
        const provRes = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
        if (provRes.ok) allProviders = await provRes.json();
    } catch (err) { console.error(err); }
    const tbody = document.getElementById('basePricesBody');
    tbody.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/base-prices`, { headers: authHeaders() });
    allBasePrices = await res.json();
    renderBasePricesTable();
}

function renderBasePricesTable() {
    const grouped = {};
    allBasePrices.forEach(p => {
        const key = `${p.provider}|${p.packageName}`;
        if (!grouped[key]) grouped[key] = { provider: p.provider, packageName: p.packageName, prices: {} };
        grouped[key].prices[p.clientType] = p.price;
    });

    const thead = document.getElementById('basePricesHeader');
    let headerHtml = `<tr><th>Provider (with logo)</th><th>Package</th>`;
    clientTypes.forEach(ct => {
        headerHtml += `<th>${ct} 
            <button class="edit-ct-btn" data-type="${ct}" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="delete-ct-btn" data-type="${ct}" title="Delete"><i class="fas fa-trash"></i></button>
        </th>`;
    });
    headerHtml += `<th>Actions</th></tr>`;
    thead.innerHTML = headerHtml;
    document.querySelectorAll('.edit-ct-btn').forEach(btn => btn.onclick = () => editClientType(btn.dataset.type));
    document.querySelectorAll('.delete-ct-btn').forEach(btn => btn.onclick = () => deleteClientType(btn.dataset.type));

    const tbody = document.getElementById('basePricesBody');
    tbody.innerHTML = '';
    Object.values(grouped).forEach(item => {
        const row = tbody.insertRow();

        // Provider cell with logo upload and edit icon
        const providerCell = row.insertCell();
        const providerContainer = document.createElement('div');
        providerContainer.style.display = 'flex';
        providerContainer.style.flexDirection = 'column';
        providerContainer.style.gap = '8px';

        // Top row: provider name and edit button
        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.style.gap = '8px';
        const providerSpan = document.createElement('span');
        providerSpan.innerText = item.provider;
        providerSpan.style.fontWeight = 'bold';
        const editProviderBtn = document.createElement('button');
        editProviderBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editProviderBtn.className = 'action-btn edit-btn';
        editProviderBtn.title = 'Edit provider';
        editProviderBtn.style.cssText = 'cursor:pointer;background:#3498db;color:white;border:none;border-radius:4px;padding:4px 8px;';
        editProviderBtn.onclick = () => {
            const newName = prompt('Edit provider name:', item.provider);
            if (newName && newName !== item.provider) {
                allBasePrices.forEach(p => { if (p.provider === item.provider) p.provider = newName; });
                renderBasePricesTable();
            }
        };
        const customizeBtn = document.createElement('button');
        customizeBtn.innerHTML = '<i class="fas fa-paint-brush"></i>';
        customizeBtn.className = 'action-btn';
        customizeBtn.title = 'Customize storefront display for this provider';
        customizeBtn.style.cssText = 'cursor:pointer;background:#9b59b6;color:white;border:none;border-radius:4px;padding:4px 8px;';
        customizeBtn.onclick = () => openDisplayConfigModal(item.provider);

        nameRow.appendChild(providerSpan);
        nameRow.appendChild(editProviderBtn);
        nameRow.appendChild(customizeBtn);
        providerContainer.appendChild(nameRow);
        const logoPreview = document.createElement('img');
        logoPreview.style.width = '32px';
        logoPreview.style.height = '32px';
        logoPreview.style.objectFit = 'cover';
        logoPreview.style.borderRadius = '50%';
        logoPreview.style.marginLeft = '8px';
        const prov = allProviders.find(p => p.name === item.provider);
        if (prov && prov.logoUrl && prov.logoUrl !== '') logoPreview.src = prov.logoUrl;
        else logoPreview.style.display = 'none';
        logoPreview.onerror = () => logoPreview.style.display = 'none';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target.result;
                await updateProviderLogo(item.provider, base64);
                logoPreview.src = base64;
                logoPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });
        const uploadBtn = document.createElement('button');
        uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
        uploadBtn.style.cssText = 'margin-left:5px;cursor:pointer;background:#3498db;color:white;border:none;border-radius:4px;padding:4px 8px;';
        uploadBtn.onclick = () => fileInput.click();
        const removeLogoBtn = document.createElement('button');
        removeLogoBtn.innerHTML = '<i class="fas fa-trash"></i>';
        removeLogoBtn.style.cssText = 'margin-left:5px;cursor:pointer;background:#e74c3c;color:white;border:none;border-radius:4px;padding:4px 8px;';
        removeLogoBtn.onclick = async () => {
            await updateProviderLogo(item.provider, '');
            logoPreview.src = '';
            logoPreview.style.display = 'none';
        };
        const logoControls = document.createElement('div');
        logoControls.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:0;';
        logoControls.appendChild(logoPreview);
        logoControls.appendChild(uploadBtn);
        logoControls.appendChild(removeLogoBtn);
        logoControls.appendChild(fileInput);
        providerContainer.appendChild(logoControls);
        providerCell.appendChild(providerContainer);

        // Package cell
        const packageCell = row.insertCell();
        const packageInput = document.createElement('input');
        packageInput.type = 'text';
        packageInput.value = item.packageName;
        packageInput.style.width = '120px';
        packageInput.addEventListener('change', (e) => updatePackageName(item.provider, item.packageName, e.target.value));
        packageCell.appendChild(packageInput);

        // Price cells
        clientTypes.forEach(ct => {
            const cell = row.insertCell();
            const price = item.prices[ct] !== undefined ? item.prices[ct] : '';
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.value = price;
            input.style.width = '80px';
            input.style.padding = '4px';
            input.dataset.provider = item.provider;
            input.dataset.package = item.packageName;
            input.dataset.clientType = ct;
            input.addEventListener('change', (e) => updateBasePrice(item.provider, item.packageName, ct, parseFloat(e.target.value)));
            cell.appendChild(input);
        });

        const actionsCell = row.insertCell();
        const delBtn = document.createElement('button');
        delBtn.innerText = 'Delete Row';
        delBtn.className = 'action-btn delete-btn';
        delBtn.onclick = () => deletePackageRow(item.provider, item.packageName);
        actionsCell.appendChild(delBtn);
    });

    const addRow = tbody.insertRow();
    const addCell = addRow.insertCell();
    addCell.colSpan = clientTypes.length + 3;
    addCell.style.textAlign = 'center';
    const addBtn = document.createElement('button');
    addBtn.innerText = '+ Add New Package';
    addBtn.className = 'action-btn edit-btn';
    addBtn.style.background = '#2ecc71';
    addBtn.onclick = () => addNewPackageRow();
    addCell.appendChild(addBtn);
}

// â”€â”€ Display Config Modal (generic-package.html customization) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function openDisplayConfigModal(providerName) {
    // Find any existing displayConfig for this provider (from first matching row)
    const existing = allBasePrices.find(p => p.provider === providerName && p.displayConfig)?.displayConfig || {};

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <span class="close">&times;</span>
            <h3 style="margin-bottom:6px;"><i class="fas fa-paint-brush"></i> Customize "${providerName}" Storefront Page</h3>
            <p style="font-size:0.82rem;color:#888;margin-bottom:16px;">
                Controls how the generic order page looks for this provider on the storefront.
            </p>
            <div id="dcFields">
                <div class="input-group">
                    <label>Header Color</label>
                    <input type="color" id="dcHeaderColor" value="${existing.headerColor || '#6a11cb'}" style="height:42px;cursor:pointer;">
                </div>
                <div class="input-group">
                    <label>Page Title (leave blank for default "Purchase ${providerName} Bundle")</label>
                    <input type="text" id="dcPageTitle" value="${existing.pageTitle || ''}" placeholder="Purchase ${providerName} Bundle">
                </div>
                <div class="input-group">
                    <label>Page Subtitle</label>
                    <input type="text" id="dcPageSubtitle" value="${existing.pageSubtitle || ''}" placeholder="Get your ${providerName} data bundle now">
                </div>
                <div class="input-group">
                    <label>Note Box Text (leave blank to hide note box)</label>
                    <textarea id="dcNoteText" rows="2">${existing.noteText || ''}</textarea>
                </div>
                <div class="input-group">
                    <label><input type="checkbox" id="dcShowPorted" ${existing.showPortedCheckbox !== false ? 'checked' : ''}> Show "Ported Network" checkbox</label>
                </div>
                <div class="input-group">
                    <label><input type="checkbox" id="dcShowPrefixes" ${existing.showPrefixes !== false ? 'checked' : ''}> Show valid prefixes hint</label>
                </div>
                <div class="input-group">
                    <label>Valid Prefixes (e.g. "024, 054, 055")</label>
                    <input type="text" id="dcValidPrefixes" value="${existing.validPrefixes || ''}" placeholder="024, 054, 055">
                </div>
                <div class="input-group">
                    <label>Bundle Label (replaces "Bundle" â€” e.g. "Package", "Plan")</label>
                    <input type="text" id="dcBundleLabel" value="${existing.bundleLabel || 'Bundle'}" placeholder="Bundle">
                </div>
                <div class="input-group">
                    <label>Purchase Button Text</label>
                    <input type="text" id="dcPurchaseLabel" value="${existing.purchaseLabel || 'Purchase Bundle'}" placeholder="Purchase Bundle">
                </div>
                <div class="input-group">
                    <label>Delivery Text</label>
                    <input type="text" id="dcDeliveryText" value="${existing.deliveryText || 'Fast delivery'}" placeholder="Fast delivery">
                </div>
                <div class="input-group">
                    <label>Validity Text (e.g. "90 days", "Non Expiry")</label>
                    <input type="text" id="dcValidity" value="${existing.validity || ''}" placeholder="90 days">
                </div>
            </div>
            <button class="btn-save" id="dcSaveBtn"><i class="fas fa-save"></i> Save Display Settings</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.close').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#dcSaveBtn').onclick = async () => {
        const config = {
            headerColor: document.getElementById('dcHeaderColor').value,
            pageTitle: document.getElementById('dcPageTitle').value.trim(),
            pageSubtitle: document.getElementById('dcPageSubtitle').value.trim(),
            noteText: document.getElementById('dcNoteText').value.trim(),
            showPortedCheckbox: document.getElementById('dcShowPorted').checked,
            showPrefixes: document.getElementById('dcShowPrefixes').checked,
            validPrefixes: document.getElementById('dcValidPrefixes').value.trim(),
            bundleLabel: document.getElementById('dcBundleLabel').value.trim() || 'Bundle',
            purchaseLabel: document.getElementById('dcPurchaseLabel').value.trim() || 'Purchase Bundle',
            deliveryText: document.getElementById('dcDeliveryText').value.trim() || 'Fast delivery',
            validity: document.getElementById('dcValidity').value.trim()
        };

        try {
            const res = await fetch(`${API_BASE}/admin/base-prices/display-config`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ provider: providerName, displayConfig: config })
            });
            if (!res.ok) throw new Error('Save failed');
            alert('Display settings saved!');
            modal.remove();
            loadBasePrices();
        } catch (err) {
            alert('Failed to save display settings: ' + err.message);
        }
    };
}

function addNewPackageRow() {
    const tbody = document.getElementById('basePricesBody');
    const newRow = tbody.insertRow(tbody.rows.length - 1);
    const providerCell = newRow.insertCell();
    const providerInput = document.createElement('input');
    providerInput.type = 'text';
    providerInput.placeholder = 'Provider';
    providerInput.style.width = '120px';
    providerCell.appendChild(providerInput);
    const packageCell = newRow.insertCell();
    const packageInput = document.createElement('input');
    packageInput.type = 'text';
    packageInput.placeholder = 'Package Name';
    packageInput.style.width = '120px';
    packageCell.appendChild(packageInput);
    clientTypes.forEach(() => {
        const cell = newRow.insertCell();
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.placeholder = 'Price';
        input.style.width = '80px';
        cell.appendChild(input);
    });
    const actionsCell = newRow.insertCell();
    const saveBtn = document.createElement('button');
    saveBtn.innerText = 'Save';
    saveBtn.className = 'action-btn edit-btn';
    saveBtn.onclick = () => {
        const provider = providerInput.value.trim();
        const packageName = packageInput.value.trim();
        if (!provider || !packageName) { alert('Provider and package name required'); return; }
        const priceInputs = newRow.querySelectorAll('input[type="number"]');
        clientTypes.forEach((ct, idx) => {
            const price = parseFloat(priceInputs[idx].value);
            const existing = allBasePrices.find(p => p.provider === provider && p.packageName === packageName && p.clientType === ct);
            if (existing) existing.price = price;
            else if (!isNaN(price) && price > 0) allBasePrices.push({ provider, packageName, clientType: ct, price });
        });
        renderBasePricesTable();
    };
    actionsCell.appendChild(saveBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.className = 'action-btn delete-btn';
    cancelBtn.onclick = () => newRow.remove();
    actionsCell.appendChild(cancelBtn);
}

function updatePackageName(provider, oldPackage, newPackage) {
    allBasePrices.forEach(p => { if (p.provider === provider && p.packageName === oldPackage) p.packageName = newPackage; });
    renderBasePricesTable();
}

function updateBasePrice(provider, packageName, clientType, price) {
    const existing = allBasePrices.find(p => p.provider === provider && p.packageName === packageName && p.clientType === clientType);
    if (existing) existing.price = price;
    else if (!isNaN(price) && price > 0) allBasePrices.push({ provider, packageName, clientType, price });
}

async function deletePackageRow(provider, packageName) {
    if (confirm(`Delete all prices for ${provider} - ${packageName}?`)) {
        allBasePrices = allBasePrices.filter(p => !(p.provider === provider && p.packageName === packageName));
        renderBasePricesTable();
    }
}

async function saveBasePrices() {
    const res = await fetch(`${API_BASE}/admin/base-prices/bulk`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ prices: allBasePrices })
    });
    if (res.ok) { alert('Base prices saved!'); loadBasePrices(); } else alert('Failed');
}

async function addClientType() {
    showModal('Add New Client Type', `<div class="input-group"><input type="text" id="newClientType" placeholder="e.g., Gold Dealers"></div>`, async () => {
        const newType = document.getElementById('newClientType').value.trim();
        if (!newType) return alert('Name required');
        if (allClientTypes.includes(newType)) return alert('Already exists');
        const res = await fetch(`${API_BASE}/admin/client-types`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ name: newType })
        });
        if (res.ok) {
            loadClientTypes();
            loadBasePrices();
            alert('Client type added');
        } else {
            alert('Failed');
        }
    });
}

async function editClientType(oldName) {
    showModal('Edit Client Type', `<div class="input-group"><input type="text" id="newClientType" value="${oldName}"></div>`, async () => {
        const newName = document.getElementById('newClientType').value.trim();
        if (!newName || newName === oldName) return;
        await fetch(`${API_BASE}/admin/client-types/${encodeURIComponent(oldName)}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ newName }) });
        const idx = clientTypes.indexOf(oldName);
        if (idx !== -1) clientTypes[idx] = newName;
        allBasePrices.forEach(p => { if (p.clientType === oldName) p.clientType = newName; });
        allClientTypes = [...clientTypes];
        renderBasePricesTable();
    });
}

async function deleteClientType(ct) {
    if (!confirm(`Delete "${ct}"? This will also remove any role-price mappings using this column.`)) return;
    await fetch(`${API_BASE}/admin/client-types/${encodeURIComponent(ct)}`, { method: 'DELETE', headers: authHeaders() });
    clientTypes = clientTypes.filter(t => t !== ct);
    allBasePrices = allBasePrices.filter(p => p.clientType !== ct);
    allClientTypes = [...clientTypes];
    renderBasePricesTable();
}

document.getElementById('addClientTypeBtn')?.addEventListener('click', addClientType);
document.getElementById('saveBasePrices')?.addEventListener('click', saveBasePrices);
document.getElementById('refreshBasePrices')?.addEventListener('click', loadBasePrices);

// ========== PROVIDERS MANAGEMENT ==========
async function loadProviders() {
    const tbody = document.querySelector('#providersTable tbody');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
    const provs = await res.json();
    tbody.innerHTML = '';
    provs.forEach(prov => {
        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = `<img src="${prov.logoUrl || 'default-provider.png'}" style="width:40px; height:40px; object-fit:contain;">`;
        row.insertCell(1).innerHTML = `${prov.name} <button class="edit-provider-btn" data-id="${prov._id}" data-name="${prov.name}" data-logo="${prov.logoUrl || ''}" style="margin-left: 10px; padding: 4px 8px; cursor: pointer;" title="Edit"><i class="fas fa-edit"></i></button>`;
        row.insertCell(2).innerHTML = `<input type="text" id="logoUrl_${prov._id}" value="${prov.logoUrl || ''}" style="width:200px;"><button class="update-provider-logo" data-id="${prov._id}" data-name="${prov.name}">Update</button>`;
        row.insertCell(3).innerHTML = `<button class="delete-provider" data-id="${prov._id}" data-name="${prov.name}">Delete</button>`;
    });

    // Edit provider name
    document.querySelectorAll('.edit-provider-btn').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.id;
            const oldName = btn.dataset.name;
            const logoUrl = btn.dataset.logo;
            const newName = prompt('Edit provider name:', oldName);
            if (newName && newName !== oldName) {
                await fetch(`${API_BASE}/admin/providers`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({ name: newName, logoUrl, oldName })
                });
                loadProviders();
            }
        };
    });

    document.querySelectorAll('.update-provider-logo').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.id;
            const name = btn.dataset.name;
            const newLogo = document.getElementById(`logoUrl_${id}`).value;
            await fetch(`${API_BASE}/admin/providers`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ name, logoUrl: newLogo })
            });
            loadProviders();
        };
    });
    document.querySelectorAll('.delete-provider').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Delete provider?')) {
                await fetch(`${API_BASE}/admin/providers/${btn.dataset.name}`, { method: 'DELETE', headers: authHeaders() });
                loadProviders();
            }
        };
    });
}

document.getElementById('addProviderBtn')?.addEventListener('click', () => {
    const name = prompt('Enter provider name:');
    if (name) {
        fetch(`${API_BASE}/admin/providers`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, logoUrl: '' }) }).then(() => loadProviders());
    }
});

// ========== WITHDRAWALS ==========
async function loadWithdrawals() {
    const tbody = document.querySelector('#withdrawalsTable tbody');
    tbody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/admin/withdrawals`, { headers: authHeaders() });
    const wds = await res.json();
    tbody.innerHTML = '';
    wds.forEach(wd => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = wd.userId?.username || '-';
        row.insertCell(1).innerText = `GHS ${wd.amount}`;
        row.insertCell(2).innerText = wd.provider;
        row.insertCell(3).innerText = wd.phoneNumber;
        row.insertCell(4).innerText = wd.accountName;
        row.insertCell(5).innerHTML = `<span class="status-badge status-${wd.status}">${wd.status}</span>`;
        row.insertCell(6).innerText = new Date(wd.createdAt).toLocaleDateString();
        row.insertCell(7).innerHTML = wd.status === 'pending' ? `<button class="action-btn approve-btn" onclick="approveWithdrawal('${wd._id}')">Approve</button><button class="action-btn reject-btn" onclick="rejectWithdrawal('${wd._id}')">Reject</button>` : '-';
    });
}

window.approveWithdrawal = async (id) => {
    if (confirm('Approve this withdrawal?')) {
        await fetch(`${API_BASE}/admin/withdrawals/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: 'approved', adminNotes: 'Approved' }) });
        loadWithdrawals();
        loadStats();
    }
};
window.rejectWithdrawal = async (id) => {
    if (confirm('Reject this withdrawal?')) {
        await fetch(`${API_BASE}/admin/withdrawals/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: 'rejected', adminNotes: 'Rejected' }) });
        loadWithdrawals();
    }
};

// ========== STORE SETTINGS ==========
async function loadStores() {
    const tbody = document.querySelector('#storesTable tbody');
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    const res = await fetch(`${API_BASE}/admin/store-settings`, { headers: authHeaders() });
    const stores = await res.json();
    tbody.innerHTML = '';
    stores.forEach(store => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = store.userId?.username || store.userId;
        row.insertCell(1).innerText = store.storeName;
        row.insertCell(2).innerText = store.storeDescription?.substring(0, 50) + '...';
        row.insertCell(3).innerText = store.whatsappNumber;
        row.insertCell(4).innerText = store.whatsappGroupLink?.substring(0, 30);
        row.insertCell(5).innerHTML = `<button class="action-btn edit-btn" onclick="editStore('${store._id}')"><i class="fas fa-edit"></i></button>`;
    });
}

window.editStore = async (id) => {
    const res = await fetch(`${API_BASE}/admin/store-settings/${id}`, { headers: authHeaders() });
    const store = await res.json();
    showModal('Edit Store', `
        <div class="input-group"><label>Store Name</label><input type="text" id="storeName" value="${store.storeName || ''}"></div>
        <div class="input-group"><label>Description</label><textarea id="description" rows="3">${store.storeDescription || ''}</textarea></div>
        <div class="input-group"><label>WhatsApp Number</label><input type="text" id="whatsappNumber" value="${store.whatsappNumber || ''}"></div>
        <div class="input-group"><label>WhatsApp Group Link</label><input type="text" id="groupLink" value="${store.whatsappGroupLink || ''}"></div>
    `, async () => {
        await fetch(`${API_BASE}/admin/store-settings/${id}`, {
            method: 'PUT', headers: authHeaders(),
            body: JSON.stringify({
                storeName: document.getElementById('storeName').value,
                storeDescription: document.getElementById('description').value,
                whatsappNumber: document.getElementById('whatsappNumber').value,
                whatsappGroupLink: document.getElementById('groupLink').value
            })
        });
        loadStores();
    });
};

// ========== PROVIDER API CONFIGURATION ==========
let selectedProviderForAPI = null;
let configuredProviders = {};

async function loadProvidersForAPI() {
    try {
        const res = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
        allProviders = await res.json();
        const select = document.getElementById('providerSelect');
        select.innerHTML = '<option value="">-- Select a Provider --</option>';
        allProviders.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            select.appendChild(opt);
        });

        // Load configured providers
        await loadConfiguredProviders();
    } catch (err) { console.error(err); }
}

async function loadConfiguredProviders() {
    try {
        const res = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
        const providers = await res.json();

        configuredProviders = {};
        for (const provider of providers) {
            try {
                const configRes = await fetch(`${API_BASE}/admin/provider-api-config/${provider.name}`, {
                    headers: authHeaders()
                });
                const data = await configRes.json();
                // Mark as configured if any meaningful apiConfig fields are set,
                // not just when enabled:true â€” a provider with saved-but-disabled
                // config should still appear as configured in the UI.
                const cfg = data.apiConfig || {};
                if (cfg.baseUrl || cfg.orderEndpoint || cfg.authHeaderValue) {
                    configuredProviders[provider.name] = true;
                }
            } catch (err) {
                // Provider not configured
            }
        }

        // Display configured providers
        displayConfiguredProviders();
    } catch (err) { console.error(err); }
}

function displayConfiguredProviders() {
    const container = document.getElementById('configuredProvidersContainer');
    const configured = Object.keys(configuredProviders).filter(p => configuredProviders[p]);

    if (configured.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No providers configured yet</p>';
    } else {
        container.innerHTML = configured.map(provider => `
            <div style="
                display: inline-block; 
                background: #e8f5e9; 
                border: 1px solid #4caf50; 
                border-radius: 20px; 
                padding: 8px 15px; 
                cursor: pointer;
                transition: all 0.3s;
            " onclick="selectProviderAPI('${provider}')" onmouseover="this.style.background='#c8e6c9'" onmouseout="this.style.background='#e8f5e9'">
                <i class="fas fa-check-circle" style="color: #4caf50; margin-right: 5px;"></i>${provider}
            </div>
        `).join('');
    }
}

window.selectProviderAPI = (providerName) => {
    document.getElementById('providerSelect').value = providerName;
    document.getElementById('providerSelect').dispatchEvent(new Event('change'));
};

// ========== PROVIDER API CONFIGURATION â€” MULTI-CONFIG ==========
// State for the currently selected provider and which config slot is active.
// selectedConfigIndex === -1  â†’ editing the legacy single apiConfig slot
// selectedConfigIndex >= 0    â†’ editing apiConfigs[selectedConfigIndex]
let selectedConfigIndex = -1;       // which slot the form is showing
let loadedApiConfigs    = [];        // full apiConfigs array from the last GET
let loadedApiConfig     = {};        // legacy single apiConfig from the last GET

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function populateFormFromConfig(config, routing) {
    const c = config || {};
    const r = routing || {};
    document.getElementById('apiEnabled').checked           = c.enabled        || false;
    document.getElementById('apiConfigName').value          = c.name           || '';
    document.getElementById('apiType').value                = c.type           || 'bearer-token';
    document.getElementById('baseUrl').value                = c.baseUrl        || '';
    document.getElementById('authHeaderName').value         = c.authHeaderName || 'Authorization';
    document.getElementById('authHeaderValue').value        = c.authHeaderValue|| '';
    document.getElementById('orderEndpoint').value          = c.orderEndpoint  || '';
    document.getElementById('orderMethod').value            = c.orderMethod    || 'POST';
    document.getElementById('statusEndpoint').value         = c.statusEndpoint || '';
    document.getElementById('balanceEndpoint').value        = c.balanceEndpoint|| '';
    document.getElementById('successField').value           = c.successField   || 'success';
    document.getElementById('dataField').value              = c.dataField      || 'data';
    document.getElementById('phoneFormat').value            = c.phoneFormat    || 'international';
    document.getElementById('networkKeyOverride').value     = c.networkKey     || '';
    document.getElementById('capacityAsString').checked     = c.capacityAsString    === true;
    document.getElementById('forUnverifiedNumbers').checked = c.forUnverifiedNumbers === true;
    document.getElementById('payloadMapping').value         =
        c.requestPayloadMapping && Object.keys(c.requestPayloadMapping).length > 0
            ? JSON.stringify(c.requestPayloadMapping, null, 2) : '';
    document.getElementById('orderHandler').value   = r.handler       || '';
    document.getElementById('whatsappMinGb').value  = r.whatsappMinGb ?? '';
    document.getElementById('whatsappMaxGb').value  = r.whatsappMaxGb ?? '';
    document.getElementById('apiMinGb').value       = r.apiMinGb      ?? '';
    document.getElementById('apiMaxGb').value       = r.apiMaxGb      ?? '';
}

function clearFormFields() {
    document.getElementById('apiEnabled').checked           = false;
    document.getElementById('apiConfigName').value          = '';
    document.getElementById('apiType').value                = 'bearer-token';
    document.getElementById('baseUrl').value                = '';
    document.getElementById('authHeaderName').value         = 'Authorization';
    document.getElementById('authHeaderValue').value        = '';
    document.getElementById('orderEndpoint').value          = '';
    document.getElementById('orderMethod').value            = 'POST';
    document.getElementById('statusEndpoint').value         = '';
    document.getElementById('balanceEndpoint').value        = '';
    document.getElementById('successField').value           = 'success';
    document.getElementById('dataField').value              = 'data';
    document.getElementById('phoneFormat').value            = 'international';
    document.getElementById('payloadMapping').value         = '';
    document.getElementById('networkKeyOverride').value     = '';
    document.getElementById('capacityAsString').checked     = false;
    document.getElementById('forUnverifiedNumbers').checked = false;
    document.getElementById('orderHandler').value           = 'auto';
    document.getElementById('whatsappMinGb').value          = '';
    document.getElementById('whatsappMaxGb').value          = '';
    document.getElementById('apiMinGb').value               = '';
    document.getElementById('apiMaxGb').value               = '';
}

// Rebuild the apiConfigSelect dropdown from the loaded configs
function refreshConfigSelect(selectIndex) {
    const sel = document.getElementById('apiConfigSelect');
    if (!sel) return;
    sel.innerHTML = '';

    // Option 0 â€” legacy single apiConfig
    const legacyOpt = document.createElement('option');
    legacyOpt.value = '-1';
    const legacyName = loadedApiConfig.name || 'Primary Config';
    legacyOpt.textContent = `[Primary] ${legacyName}${loadedApiConfig.forUnverifiedNumbers ? ' âš  (unverified)' : ''}`;
    sel.appendChild(legacyOpt);

    // Options 1..N â€” apiConfigs array entries
    loadedApiConfigs.forEach((cfg, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `[${i + 1}] ${cfg.name || 'Config ' + (i + 1)}${cfg.forUnverifiedNumbers ? ' âš  (unverified)' : ''}`;
        sel.appendChild(opt);
    });

    // Add-new sentinel
    const addOpt = document.createElement('option');
    addOpt.value = 'new';
    addOpt.textContent = '+ Add new configurationâ€¦';
    sel.appendChild(addOpt);

    sel.value = String(selectIndex);
}

// â”€â”€ Provider select change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.getElementById('providerSelect')?.addEventListener('change', async (e) => {
    const providerName = e.target.value;
    if (!providerName) {
        document.getElementById('apiConfigForm').style.display = 'none';
        return;
    }

    clearFormFields();
    selectedProviderForAPI = providerName;
    selectedConfigIndex    = -1;

    try {
        const res  = await fetch(`${API_BASE}/admin/provider-api-config/${providerName}`, { headers: authHeaders() });
        const data = await res.json();

        loadedApiConfig  = data.apiConfig  || {};
        loadedApiConfigs = data.apiConfigs || [];
        const routing    = data.orderRouting || {};

        // Build the config-selector dropdown
        refreshConfigSelect(-1);

        // Show the primary (legacy) config in the form by default
        populateFormFromConfig(loadedApiConfig, routing);

        document.getElementById('apiConfigForm').style.display = 'block';
        loadAPILogs(providerName);
    } catch (err) {
        console.error(err);
        alert('Could not load provider configuration');
    }
});

// â”€â”€ Config selector switch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.getElementById('apiConfigSelect')?.addEventListener('change', async (e) => {
    const val = e.target.value;

    if (val === 'new') {
        // User picked "Add new configuration" â€” clear form, set index sentinel
        clearFormFields();
        selectedConfigIndex = 'new';
        document.getElementById('apiConfigName').value = '';
        document.getElementById('apiConfigName').focus();
        return;
    }

    const idx = parseInt(val, 10);
    selectedConfigIndex = idx;

    if (idx === -1) {
        // Primary / legacy config
        const res  = await fetch(`${API_BASE}/admin/provider-api-config/${selectedProviderForAPI}`, { headers: authHeaders() });
        const data = await res.json();
        populateFormFromConfig(data.apiConfig || {}, data.orderRouting || {});
    } else {
        // Array entry â€” no routing stored at array level, only top-level routing matters
        populateFormFromConfig(loadedApiConfigs[idx] || {}, {});
    }
});

// â”€â”€ Save config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.getElementById('saveApiConfig')?.addEventListener('click', async () => {
    if (!selectedProviderForAPI) { alert('Please select a provider'); return; }

    try {
        let payloadMapping = {};
        const mappingText = document.getElementById('payloadMapping').value.trim();
        if (mappingText) payloadMapping = JSON.parse(mappingText);

        const apiConfig = {
            name:                  document.getElementById('apiConfigName').value.trim() || 'Default',
            enabled:               document.getElementById('apiEnabled').checked,
            type:                  document.getElementById('apiType').value,
            baseUrl:               document.getElementById('baseUrl').value,
            authHeaderName:        document.getElementById('authHeaderName').value,
            authHeaderValue:       document.getElementById('authHeaderValue').value,
            orderEndpoint:         document.getElementById('orderEndpoint').value,
            orderMethod:           document.getElementById('orderMethod').value,
            statusEndpoint:        document.getElementById('statusEndpoint').value,
            balanceEndpoint:       document.getElementById('balanceEndpoint').value,
            successField:          document.getElementById('successField').value,
            dataField:             document.getElementById('dataField').value,
            phoneFormat:           document.getElementById('phoneFormat').value,
            requestPayloadMapping: payloadMapping,
            networkKey:            document.getElementById('networkKeyOverride').value.trim() || undefined,
            capacityAsString:      document.getElementById('capacityAsString').checked     || undefined,
            forUnverifiedNumbers:  document.getElementById('forUnverifiedNumbers').checked || undefined,
        };

        const orderRouting = {
            handler:       document.getElementById('orderHandler').value,
            whatsappMinGb: document.getElementById('whatsappMinGb').value,
            whatsappMaxGb: document.getElementById('whatsappMaxGb').value,
            apiMinGb:      document.getElementById('apiMinGb').value,
            apiMaxGb:      document.getElementById('apiMaxGb').value,
        };

        let res, result;

        if (selectedConfigIndex === 'new') {
            // POST â€” create new entry in apiConfigs array
            res = await fetch(`${API_BASE}/admin/provider-api-configs/${selectedProviderForAPI}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ apiConfig })
            });
            result = await res.json();
            if (res.ok) {
                loadedApiConfigs = result.apiConfigs;
                selectedConfigIndex = result.index;
                refreshConfigSelect(result.index);
                alert(`Configuration "${apiConfig.name}" added successfully.`);
            } else {
                alert('Error: ' + result.message);
            }

        } else if (selectedConfigIndex >= 0) {
            // PUT â€” update existing apiConfigs[index]
            res = await fetch(`${API_BASE}/admin/provider-api-configs/${selectedProviderForAPI}/${selectedConfigIndex}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ apiConfig })
            });
            result = await res.json();
            if (res.ok) {
                loadedApiConfigs = result.apiConfigs;
                refreshConfigSelect(selectedConfigIndex);
                alert(`Configuration "${apiConfig.name}" updated.`);
            } else {
                alert('Error: ' + result.message);
            }

        } else {
            // PUT â€” update legacy single apiConfig (index === -1)
            res = await fetch(`${API_BASE}/admin/provider-api-config/${selectedProviderForAPI}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ apiConfig, orderRouting })
            });
            result = await res.json();
            if (res.ok) {
                loadedApiConfig = apiConfig;
                refreshConfigSelect(-1);
                alert(result.message || 'Configuration saved.');
            } else {
                alert('Error: ' + (result.message || 'Save failed'));
            }
        }

        await loadConfiguredProviders();
    } catch (err) {
        console.error(err);
        alert('Error saving configuration: ' + err.message);
    }
});

// â”€â”€ Delete config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function deleteSelectedConfig() {
    if (!selectedProviderForAPI) return;

    if (selectedConfigIndex === -1) {
        alert('The primary configuration cannot be deleted. You can disable it by unchecking "Enable API Integration".');
        return;
    }
    if (selectedConfigIndex === 'new') {
        // Nothing was saved yet â€” just switch back to primary
        document.getElementById('apiConfigSelect').value = '-1';
        document.getElementById('apiConfigSelect').dispatchEvent(new Event('change'));
        return;
    }

    const cfg = loadedApiConfigs[selectedConfigIndex];
    if (!confirm(`Delete configuration "${cfg?.name || 'Config ' + (selectedConfigIndex + 1)}"? This cannot be undone.`)) return;

    try {
        const res = await fetch(
            `${API_BASE}/admin/provider-api-configs/${selectedProviderForAPI}/${selectedConfigIndex}`,
            { method: 'DELETE', headers: authHeaders() }
        );
        const result = await res.json();
        if (!res.ok) { alert('Error: ' + result.message); return; }

        loadedApiConfigs = result.apiConfigs;
        selectedConfigIndex = -1;
        refreshConfigSelect(-1);
        // Show primary config
        const data = await (await fetch(`${API_BASE}/admin/provider-api-config/${selectedProviderForAPI}`, { headers: authHeaders() })).json();
        populateFormFromConfig(data.apiConfig || {}, data.orderRouting || {});
        alert('Configuration deleted.');
        await loadConfiguredProviders();
    } catch (err) {
        alert('Error deleting configuration: ' + err.message);
    }
}
window.deleteSelectedConfig = deleteSelectedConfig;

// â”€â”€ Add New Configuration Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.getElementById('addNewAPIConfigBtn')?.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
        allProviders = await res.json();

        if (allProviders.length === 0) {
            alert('No providers found. Add providers first in the Base Prices tab.');
            return;
        }

        const providerLines = allProviders.map(p => {
            const hasConfig = configuredProviders[p.name];
            return `${p.name}${hasConfig ? ' (has config)' : ' (new)'}`;
        }).join('\n');

        const selected = prompt(
            `Type the exact provider name to configure:\n\n${providerLines}`,
            ''
        );
        if (!selected) return;

        const match = allProviders.find(p => p.name === selected.trim())
                   || allProviders.find(p => p.name.toLowerCase() === selected.trim().toLowerCase());

        if (!match) {
            alert(`"${selected}" is not a recognised provider.\n\nAvailable:\n${allProviders.map(p => p.name).join('\n')}`);
            return;
        }

        // Select the provider in the dropdown â€” this triggers the change handler
        // which loads all existing configs and shows the form.
        const provSelect = document.getElementById('providerSelect');
        if (provSelect) {
            provSelect.value = match.name;
            provSelect.dispatchEvent(new Event('change'));
        }

        // After a short delay (let the GET finish), switch apiConfigSelect to "new"
        setTimeout(() => {
            const cfgSel = document.getElementById('apiConfigSelect');
            if (cfgSel) {
                cfgSel.value = 'new';
                cfgSel.dispatchEvent(new Event('change'));
            }
        }, 600);

    } catch (err) {
        console.error(err);
        alert('Could not load providers: ' + err.message);
    }
});

document.getElementById('testApiConfig')?.addEventListener('click', async () => {
    if (!selectedProviderForAPI) {
        alert('Please select a provider');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/provider-balance/${selectedProviderForAPI}`, { headers: authHeaders() });
        const result = await res.json();

        if (result.success) {
            alert(`✅ API Connection Successful!\nBalance: ${result.balance ?? 'N/A'} ${result.currency || 'GHS'}`);
        } else {
            const reason = result.message || result.error || 'No balance endpoint configured or API returned an error.';
            alert(`❌ API Connection Failed:\n${reason}`);
        }
    } catch (err) {
        console.error(err);
        alert('Error testing API: ' + err.message);
    }
});

async function loadAPILogs(providerName) {
    try {
        const res = await fetch(`${API_BASE}/admin/provider-api-logs/${providerName}`, { headers: authHeaders() });
        const logs = await res.json();

        const tbody = document.querySelector('#apiLogsTable tbody');
        tbody.innerHTML = '';

        logs.forEach(log => {
            const row = tbody.insertRow();
            row.insertCell(0).innerText = new Date(log.requestTime).toLocaleString();
            row.insertCell(1).innerHTML = `<span class="status-badge status-${log.status}">${log.status}</span>`;
            row.insertCell(2).innerText = log.apiReference || '-';
            row.insertCell(3).innerText = log.responseStatus || '-';
            row.insertCell(4).innerHTML = `<button class="action-btn" onclick="viewAPILogDetails('${log._id}')">View</button>`;
        });

        document.getElementById('apiLogsContainer').style.display = 'block';
    } catch (err) {
        console.error(err);
    }
}

window.viewAPILogDetails = (logId) => {
    alert('API Log Details: ' + logId + '\n(Implement detailed view)');
};

// ========== LOGOUT ==========
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '../Registration%20form/login_and_signup.html';
});

// ========== SEARCH HANDLERS ==========
function setupSearch(tableId, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('keyup', () => {
        const filter = input.value.toLowerCase();
        const rows = document.querySelectorAll(`#${tableId} tbody tr`);
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(filter) ? '' : 'none';
        });
    });
}

// ========== REFRESH BUTTONS ==========
document.getElementById('refreshUsers')?.addEventListener('click', loadUsers);
document.getElementById('refreshOrders')?.addEventListener('click', loadOrders);
document.getElementById('refreshTxns')?.addEventListener('click', loadTransactions);
document.getElementById('refreshPrices')?.addEventListener('click', loadPrices);
document.getElementById('refreshWd')?.addEventListener('click', loadWithdrawals);
document.getElementById('refreshStores')?.addEventListener('click', loadStores);
document.getElementById('refreshProviders')?.addEventListener('click', loadProviders);
document.getElementById('refreshMasterPrices')?.addEventListener('click', loadMasterPrices);

// ========== TEST ORDER BUTTON ==========
document.getElementById('testOrderBtn')?.addEventListener('click', () => {
    showModal('Add Test Order', `
        <div class="input-group">
            <label>Phone Number (Beneficiary)</label>
            <input type="tel" id="to_phone" placeholder="e.g. 0537905668" value="0537905668" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
        </div>
        <div class="input-group" style="margin-top:12px;">
            <label>Provider</label>
            <select id="to_provider" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                <option value="MTN">MTN</option>
                <option value="Telecel">Telecel</option>
                <option value="AT Ishare">AT Ishare</option>
                <option value="AT Bigtime">AT Bigtime</option>
                <option value="MTN AFA">MTN AFA</option>
            </select>
        </div>
        <div class="input-group" style="margin-top:12px;">
            <label>Bundle Size</label>
            <select id="to_bundle" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                <option value="1GB">1 GB</option>
                <option value="2GB">2 GB</option>
                <option value="3GB">3 GB</option>
                <option value="5GB">5 GB</option>
                <option value="10GB">10 GB</option>
                <option value="20GB">20 GB</option>
                <option value="50GB">50 GB</option>
            </select>
        </div>
        <div class="input-group" style="margin-top:12px;">
            <label>Amount (GHS)</label>
            <input type="number" id="to_amount" placeholder="e.g. 5.00" value="5.00" step="0.01" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
        </div>
        <div class="input-group" style="margin-top:12px;">
            <label>Status</label>
            <select id="to_status" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
            </select>
        </div>
    `, async () => {
        const phoneNumber = document.getElementById('to_phone').value.trim();
        const provider = document.getElementById('to_provider').value;
        const bundle = document.getElementById('to_bundle').value;
        const amount = parseFloat(document.getElementById('to_amount').value) || 5.00;
        const status = document.getElementById('to_status').value;

        if (!phoneNumber) { alert('Please enter a phone number'); return; }

        try {
            const res = await fetch(`${API_BASE}/admin/test-order`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ phoneNumber, provider, bundle_size: bundle, bundle, amount, status })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`âœ… Test order created!\nProvider: ${provider}\nBundle: ${bundle}\nPhone: ${phoneNumber}\nAmount: GHS ${amount}`);
                loadOrders();
            } else {
                alert('âŒ Failed: ' + (data.message || 'Unknown error'));
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });
});

// ========== PAYMENT GATEWAYS ===========
let selectedPaymentGateway = null;
let _pgSelectListenerAttached = false;

// ========== PAYMENT GATEWAYS LOGIC ==========

async function loadPaymentGateways() {
    const tbody = document.getElementById('gatewaysTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Fetching gateway connections...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/admin/payment-gateways`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to retrieve gateway states');
        const gateways = await res.json();

        if (!gateways || gateways.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#aaa;">No payment gateways found in database. Run initialization script.</td></tr>`;
            return;
        }

        tbody.innerHTML = gateways.map(g => {
            return `
                <tr>
                    <td><strong>${g.name}</strong> <button class="action-btn edit-btn" onclick="editGatewayName('${g.name}')" title="Edit gateway name" style="margin-left:8px; padding:4px 8px;"><i class="fas fa-edit"></i></button></td>
                    <td><span class="status-badge" style="background:#e3f2fd; color:#0d47a1;">${g.type}</span></td>
                    <td>
                        <span class="status-badge ${g.enabled ? 'status-success' : 'status-failed'}">
                            ${g.enabled ? 'Active' : 'Disabled'}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge" style="background: ${g.isTestMode ? '#fff3e0' : '#e8f5e9'}; color: ${g.isTestMode ? '#e65100' : '#1b5e20'};">
                            ${g.isTestMode ? 'ðŸ§ª Test Mode' : 'âš¡ Live Production'}
                        </span>
                    </td>
                    <td>${g.minAmount} - ${g.maxAmount} GHS</td>
                    <td>
                        <button class="btn-edit" onclick="editGatewayConfig('${g.name}')">
                            <i class="fas fa-cog"></i> Configure
                        </button>
                        <button class="action-btn delete-btn" onclick="deletePaymentGateway('${g.name}')" title="Delete" style="margin-left:8px;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

async function editGatewayName(oldName) {
    const newName = prompt('Edit gateway name:', oldName);
    if (newName && newName !== oldName) {
        try {
            const res = await fetch(`${API_BASE}/admin/payment-gateways/${encodeURIComponent(oldName)}/rename`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ newName: newName.trim() })
            });
            if (res.ok) {
                alert('Gateway renamed successfully!');
                loadPaymentGateways();
            } else {
                const data = await res.json();
                alert('Error: ' + (data.message || 'Failed to rename gateway'));
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }
}

async function editGatewayConfig(gatewayName) {
    try {
        const res = await fetch(`${API_BASE}/admin/payment-gateway-config/${encodeURIComponent(gatewayName)}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to load gateway configs');
        const data = await res.json();

        // API may return config directly or wrapped as { success, config }
        const g = data.config ?? data;
        if (!g || typeof g !== 'object') throw new Error('Invalid config response from server');

        // Form fields layout for Moolre gateway
        const fieldsHtml = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">Enable Gateway</label>
                <select id="edit_gateway_enabled" class="form-control" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
                    <option value="true" ${g.enabled ? 'selected' : ''}>Active / Enabled</option>
                    <option value="false" ${!g.enabled ? 'selected' : ''}>Disabled / Inactive</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">Environment Mode</label>
                <select id="edit_gateway_mode" class="form-control" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
                    <option value="true" ${g.isTestMode ? 'selected' : ''}>Sandbox (Test Mode)</option>
                    <option value="false" ${!g.isTestMode ? 'selected' : ''}>Live (Production Mode)</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">API Base URL</label>
                <input type="text" id="edit_gateway_url" class="form-control" value="${g.apiBaseUrl || 'https://api.moolre.com'}" placeholder="https://api.moolre.com" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
            </div>

            <p style="font-weight:bold; color:#6a11cb; margin:16px 0 8px; border-bottom:1px solid #eee; padding-bottom:6px;">
                ðŸ” Moolre API Credentials
            </p>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">
                    API User <small style="color:#666;">(X-API-USER â€” your Moolre username)</small>
                </label>
                <input type="text" id="edit_gateway_apiuser" class="form-control" value="${g.apiUser || ''}" placeholder="your_moolre_username" style="width:100%; padding:8px; border-radius:4px; border:2px solid #6a11cb;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">
                    Account Number <small style="color:#666;">(Moolre Wallet ID â€” e.g. 420500413146)</small>
                </label>
                <input type="text" id="edit_gateway_apikey" class="form-control" placeholder="${g.apiKey ? 'Already set â€” leave blank to keep' : 'Enter Moolre Wallet Account Number'}" style="width:100%; padding:8px; border-radius:4px; border:2px solid #e67e22;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">
                    Public Key <small style="color:#666;">(X-API-PUBKEY â€” for collections/payments)</small>
                </label>
                <input type="password" id="edit_gateway_pubkey" class="form-control" placeholder="${g.pubKey ? 'Already set â€” leave blank to keep' : 'Enter Public Key'}" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">
                    VAS Key <small style="color:#666;">(X-API-VASKEY â€” only needed for VAS/data bundle disbursements, not required for collections)</small>
                </label>
                <input type="password" id="edit_gateway_vaskey" class="form-control" placeholder="${g.vasKey ? 'Already set â€” leave blank to keep' : 'Enter VAS Key (optional)'}" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
            </div>

            <p style="font-weight:bold; color:#2980b9; margin:16px 0 8px; border-bottom:1px solid #eee; padding-bottom:6px;">
                ðŸŒ API Endpoints
            </p>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">
                    Collect Endpoint <small style="color:#666;">(path to initiate payment)</small>
                </label>
                <input type="text" id="edit_gateway_collect" class="form-control" value="${g.collectEndpoint || '/collections/initiate'}" placeholder="/collections/initiate" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px;">
                    Status Endpoint <small style="color:#666;">(path to check payment status)</small>
                </label>
                <input type="text" id="edit_gateway_status" class="form-control" value="${g.statusEndpoint || '/collections/status'}" placeholder="/collections/status" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
            </div>

            <p style="font-weight:bold; color:#e74c3c; margin:16px 0 8px; border-bottom:1px solid #eee; padding-bottom:6px;">
                ðŸ”— Webhook & Limits
            </p>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px; color:#e74c3c;">
                    âš  Callback URL <small style="color:#666;">(paste your Cloudflare/public URL here)</small>
                </label>
                <input type="text" id="edit_gateway_callback" class="form-control" value="${g.callbackUrl || ''}" placeholder="https://xxxx.trycloudflare.com/api/webhook/payment/Moolre" style="width:100%; padding:8px; border-radius:4px; border:2px solid #e74c3c;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-weight:bold; margin-bottom:4px; color:#27ae60;">
                    ðŸ”— Moolre POS Payment Link <small style="color:#666;">(customers are redirected here to complete payment)</small>
                </label>
                <input type="text" id="edit_gateway_poslink" class="form-control" value="${g.posLink || 'https://pos.moolre.com/OBsl0jRg95WiLfytc7Tu33434'}" placeholder="https://pos.moolre.com/xxxxx" style="width:100%; padding:8px; border-radius:4px; border:2px solid #27ae60;">
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div>
                    <label style="display:block; font-weight:bold; margin-bottom:4px;">Min Amount (GHS)</label>
                    <input type="number" step="0.01" id="edit_gateway_min" class="form-control" value="${g.minAmount || 0.5}" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
                </div>
                <div>
                    <label style="display:block; font-weight:bold; margin-bottom:4px;">Max Amount (GHS)</label>
                    <input type="number" id="edit_gateway_max" class="form-control" value="${g.maxAmount || 10000}" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc;">
                </div>
            </div>

            <p style="font-weight:bold; color:#333; margin:16px 0 8px; border-bottom:1px solid #eee; padding-bottom:6px;">
                ðŸ“¡ Network Code Mapping
                <small style="font-weight:normal; color:#666;"> â€” Moolre codes: MTN, VODAFONE, AIRTELTIGO</small>
            </p>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px;">MTN code</label>
                    <input type="text" id="edit_net_mtn" class="form-control" value="${(g.networkMapping && g.networkMapping['MTN']) || 'MTN'}" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px;">Telecel code</label>
                    <input type="text" id="edit_net_telecel" class="form-control" value="${(g.networkMapping && g.networkMapping['Telecel']) || 'VODAFONE'}" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px;">AirtelTigo code</label>
                    <input type="text" id="edit_net_at" class="form-control" value="${(g.networkMapping && g.networkMapping['AirtelTigo']) || 'AIRTELTIGO'}" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
            </div>
        `;

        showModal(`Configure ${gatewayName}`, fieldsHtml, async () => {
            const apiKeyVal = document.getElementById('edit_gateway_apikey').value.trim();
            const pubKeyVal = document.getElementById('edit_gateway_pubkey').value.trim();
            const vasKeyVal = document.getElementById('edit_gateway_vaskey').value.trim();

            const payload = {
                enabled: document.getElementById('edit_gateway_enabled').value === 'true',
                isTestMode: document.getElementById('edit_gateway_mode').value === 'true',
                apiBaseUrl: document.getElementById('edit_gateway_url').value.trim(),
                apiUser: document.getElementById('edit_gateway_apiuser').value.trim(),
                posLink: document.getElementById('edit_gateway_poslink')?.value.trim() || '',
                collectEndpoint: document.getElementById('edit_gateway_collect').value.trim(),
                statusEndpoint: document.getElementById('edit_gateway_status').value.trim(),
                callbackUrl: document.getElementById('edit_gateway_callback').value.trim(),
                minAmount: parseFloat(document.getElementById('edit_gateway_min').value || 0.5),
                maxAmount: parseFloat(document.getElementById('edit_gateway_max').value || 10000),
                authMethod: 'moolre-headers',
                networkMapping: {
                    'MTN': document.getElementById('edit_net_mtn').value.trim() || 'MTN',
                    'Telecel': document.getElementById('edit_net_telecel').value.trim() || 'VODAFONE',
                    'AirtelTigo': document.getElementById('edit_net_at').value.trim() || 'AIRTELTIGO',
                    'Vodafone': document.getElementById('edit_net_telecel').value.trim() || 'VODAFONE',
                    'AT': document.getElementById('edit_net_at').value.trim() || 'AIRTELTIGO',
                }
            };
            // Only send secrets if actually entered (not blank)
            if (apiKeyVal) payload.apiKey = apiKeyVal;
            if (pubKeyVal) payload.pubKey = pubKeyVal;
            if (vasKeyVal) payload.vasKey = vasKeyVal;

            try {
                const saveRes = await fetch(`${API_BASE}/admin/payment-gateway-config/${encodeURIComponent(gatewayName)}`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify(payload)
                });
                const saveResult = await saveRes.json();
                if (!saveRes.ok) throw new Error(saveResult.message || 'Error committing configurations');

                alert('Gateway configuration saved successfully!');
                loadPaymentGateways();
            } catch (err) {
                alert(`Failed to save details: ${err.message}`);
                console.error(err);
            }
        });
    } catch (err) {
        alert(`Error opening configuration setup: ${err.message}`);
    }
}

// Attach the select change listener exactly once (avoids stacking duplicates)
document.addEventListener('DOMContentLoaded', () => {
    // New Gateway button
    document.getElementById('createPaymentGatewayBtn')?.addEventListener('click', () => {
        showModal('Create New Payment Gateway', `
            <div class="input-group">
                <label>Gateway Name</label>
                <input type="text" id="newGatewayName" placeholder="e.g., Korba Xchange, Hubtel, Paystack">
            </div>
            <div class="input-group">
                <label>Type</label>
                <select id="newGatewayType">
                    <option value="collections">Collections (Mobile Money)</option>
                    <option value="hosted-checkout">Hosted Checkout</option>
                    <option value="direct-card">Direct Card</option>
                </select>
            </div>
        `, async () => {
            const name = document.getElementById('newGatewayName').value.trim();
            const type = document.getElementById('newGatewayType').value;
            if (!name) { alert('Gateway name is required'); return; }
            try {
                const res = await fetch(`${API_BASE}/admin/payment-gateways`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ name, type })
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert('Error: ' + (data.message || `HTTP ${res.status}`));
                    return;
                }
                await loadPaymentGateways();
                const select = document.getElementById('paymentGatewaySelect');
                select.value = name;
                selectedPaymentGateway = name;
                await loadPaymentGatewayConfig(name);
            } catch (err) {
                console.error(err);
                alert('Error creating gateway: ' + err.message);
            }
        });
    });
});

async function loadPaymentGatewayConfig(gatewayName) {
    const container = document.getElementById('paymentGatewayConfigContainer');
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#888;"><i class="fas fa-spinner fa-spin"></i> Loadingâ€¦</div>';
    try {
        const res = await fetch(`${API_BASE}/admin/payment-gateway-config/${encodeURIComponent(gatewayName)}`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} â€” gateway not found or server error`);
        const cfg = await res.json();

        container.innerHTML = `
            <h3 style="margin-bottom:16px;">${gatewayName} â€” Configuration</h3>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">

                <div class="form-group">
                    <label><strong>Gateway Type</strong></label>
                    <select id="pgType">
                        <option value="collections"      ${cfg.type === 'collections' ? 'selected' : ''}>Collections (Mobile Money)</option>
                        <option value="hosted-checkout"  ${cfg.type === 'hosted-checkout' ? 'selected' : ''}>Hosted Checkout</option>
                        <option value="direct-card"      ${cfg.type === 'direct-card' ? 'selected' : ''}>Direct Card</option>
                    </select>
                </div>

                <div class="form-group" style="display:flex;align-items:center;gap:10px;padding-top:24px;">
                    <input type="checkbox" id="pgEnabled" ${cfg.enabled ? 'checked' : ''} style="width:18px;height:18px;">
                    <label for="pgEnabled" style="margin:0;cursor:pointer;"><strong>Enabled</strong></label>
                    &nbsp;&nbsp;
                    <input type="checkbox" id="pgTestMode" ${cfg.isTestMode ? 'checked' : ''} style="width:18px;height:18px;">
                    <label for="pgTestMode" style="margin:0;cursor:pointer;">Test Mode</label>
                </div>

                <div class="form-group" style="grid-column:1/-1;">
                    <label><strong>Callback URL</strong> <small style="color:#e74c3c;">âš  Required â€” set this on Korba dashboard too</small></label>
                    <input type="text" id="pgCallbackUrl" value="${cfg.callbackUrl || ''}" placeholder="https://yoursite.com/api/webhook/payment/${gatewayName}" style="border-color:#e74c3c;">
                </div>

                <div class="form-group">
                    <label><strong>API Base URL</strong></label>
                    <input type="text" id="pgBaseUrl" value="${cfg.apiBaseUrl || ''}" placeholder="https://testxchange.korba365.com/api/v1.0">
                </div>

                <div class="form-group">
                    <label><strong>Collect Endpoint</strong></label>
                    <input type="text" id="pgCollectEndpoint" value="${cfg.collectEndpoint || '/collect'}" placeholder="/collect">
                </div>

                <div class="form-group">
                    <label><strong>Client Key / Merchant ID</strong></label>
                    <input type="text" id="pgClientKey" value="${cfg.clientKey || ''}" placeholder="Your merchant / client ID">
                </div>

                <div class="form-group">
                    <label><strong>Secret Key</strong> <small style="color:#e74c3c;">(leave blank to keep existing)</small></label>
                    <input type="password" id="pgSecretKey" placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢  (unchanged if blank)">
                </div>

                <div class="form-group">
                    <label><strong>Test Client Key</strong></label>
                    <input type="text" id="pgTestClientKey" value="${cfg.testClientKey || ''}" placeholder="Test merchant ID">
                </div>

                <div class="form-group">
                    <label><strong>Test Secret Key</strong> <small style="color:#e74c3c;">(leave blank to keep existing)</small></label>
                    <input type="password" id="pgTestSecretKey" placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢  (unchanged if blank)">
                </div>

                <div class="form-group">
                    <label><strong>Redirect URL</strong></label>
                    <input type="text" id="pgRedirectUrl" value="${cfg.redirectUrl || ''}" placeholder="https://yoursite.com/payment-success">
                </div>

                <div class="form-group">
                    <label><strong>Min Amount (GHS)</strong></label>
                    <input type="number" id="pgMinAmount" value="${cfg.minAmount ?? 0.5}" step="0.01" min="0">
                </div>

                <div class="form-group">
                    <label><strong>Max Amount (GHS)</strong></label>
                    <input type="number" id="pgMaxAmount" value="${cfg.maxAmount ?? 10000}" step="0.01" min="0">
                </div>

                <div class="form-group">
                    <label><strong>Transaction Fee (Fixed GHS)</strong></label>
                    <input type="number" id="pgFeeFixed" value="${cfg.transactionFee ?? 0}" step="0.01" min="0">
                </div>

                <div class="form-group">
                    <label><strong>Transaction Fee (%)</strong></label>
                    <input type="number" id="pgFeePercent" value="${cfg.transactionFeePercent ?? 0}" step="0.01" min="0">
                </div>

                <div class="form-group" style="grid-column:1/3;">
                    <label><strong>Network Mapping</strong> <small>(JSON â€” maps provider names to gateway network codes)</small></label>
                    <textarea id="pgNetworkMapping" rows="4" style="font-family:monospace;">${JSON.stringify(cfg.networkMapping || { MTN: 'MTN', Telecel: 'VOD', AirtelTigo: 'AIR', Vodafone: 'VOD' }, null, 2)}</textarea>
                </div>

                <div class="form-group">
                    <label><strong>Auth Method</strong></label>
                    <select id="pgAuthMethod">
                        <option value="hmac"         ${cfg.authMethod === 'hmac' ? 'selected' : ''}>HMAC-SHA256 (Korba)</option>
                        <option value="bearer-token" ${cfg.authMethod === 'bearer-token' ? 'selected' : ''}>Bearer Token</option>
                        <option value="api-key"      ${cfg.authMethod === 'api-key' ? 'selected' : ''}>API Key</option>
                    </select>
                </div>

                <div class="form-group" style="display:flex;align-items:flex-end;gap:10px;">
                    <div style="flex:1;">
                        <label><strong>Payment Methods</strong></label>
                        <div style="display:flex;gap:16px;padding-top:4px;">
                            <label><input type="checkbox" id="pgMM"   ${cfg.paymentMethods?.mobileMoney ? 'checked' : ''}> Mobile Money</label>
                            <label><input type="checkbox" id="pgCard" ${cfg.paymentMethods?.card ? 'checked' : ''}> Card</label>
                            <label><input type="checkbox" id="pgBank" ${cfg.paymentMethods?.bankTransfer ? 'checked' : ''}> Bank</label>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px;">
                <button class="btn-primary" id="pgSaveBtn" style="padding:12px;">
                    <i class="fas fa-save"></i> Save Configuration
                </button>
                <button id="pgDeleteBtn" style="padding:12px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;">
                    <i class="fas fa-trash"></i> Delete Gateway
                </button>
            </div>

            <div id="pgSaveStatus" style="margin-top:12px;text-align:center;min-height:20px;"></div>

            <hr style="margin:24px 0;">
            <h4><i class="fas fa-list"></i> Payment Logs (last 20)</h4>
            <div id="pgLogsContainer"><em style="color:#aaa;">Loading logsâ€¦</em></div>
        `;

        document.getElementById('pgSaveBtn').addEventListener('click', () => savePaymentGatewayConfig(gatewayName));
        document.getElementById('pgDeleteBtn').addEventListener('click', () => deletePaymentGateway(gatewayName));
        loadPaymentGatewayLogs(gatewayName);

    } catch (err) {
        console.error('loadPaymentGatewayConfig error:', err);
        container.innerHTML = `
            <div style="text-align:center;color:#e74c3c;padding:30px;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;display:block;"></i>
                <strong>Failed to load config for "${gatewayName}"</strong><br>
                <small>${err.message}</small>
            </div>`;
    }
}

async function savePaymentGatewayConfig(gatewayName) {
    const statusEl = document.getElementById('pgSaveStatus');
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Savingâ€¦';
    try {
        const networkMappingRaw = document.getElementById('pgNetworkMapping').value.trim();
        let networkMapping = {};
        try { networkMapping = JSON.parse(networkMappingRaw); } catch { alert('Network Mapping is not valid JSON'); return; }

        const secretKey = document.getElementById('pgSecretKey').value;
        const testSecretKey = document.getElementById('pgTestSecretKey').value;

        const body = {
            type: document.getElementById('pgType').value,
            enabled: document.getElementById('pgEnabled').checked,
            isTestMode: document.getElementById('pgTestMode').checked,
            apiBaseUrl: document.getElementById('pgBaseUrl').value.trim(),
            collectEndpoint: document.getElementById('pgCollectEndpoint').value.trim(),
            clientKey: document.getElementById('pgClientKey').value.trim(),
            testClientKey: document.getElementById('pgTestClientKey').value.trim(),
            callbackUrl: document.getElementById('pgCallbackUrl').value.trim(),
            redirectUrl: document.getElementById('pgRedirectUrl').value.trim(),
            minAmount: parseFloat(document.getElementById('pgMinAmount').value),
            maxAmount: parseFloat(document.getElementById('pgMaxAmount').value),
            transactionFee: parseFloat(document.getElementById('pgFeeFixed').value),
            transactionFeePercent: parseFloat(document.getElementById('pgFeePercent').value),
            authMethod: document.getElementById('pgAuthMethod').value,
            networkMapping,
            paymentMethods: {
                mobileMoney: document.getElementById('pgMM').checked,
                card: document.getElementById('pgCard').checked,
                bankTransfer: document.getElementById('pgBank').checked
            }
        };

        // Only send keys if admin actually typed something
        if (secretKey) body.secretKey = secretKey;
        if (testSecretKey) body.testSecretKey = testSecretKey;

        const res = await fetch(`${API_BASE}/admin/payment-gateway-config/${encodeURIComponent(gatewayName)}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || `HTTP ${res.status}`);
        }

        statusEl.innerHTML = '<span style="color:#27ae60;"><i class="fas fa-check-circle"></i> Saved successfully!</span>';
        await loadPaymentGateways();
        // Restore selection
        document.getElementById('paymentGatewaySelect').value = gatewayName;
        setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
    } catch (err) {
        console.error('savePaymentGatewayConfig error:', err);
        statusEl.innerHTML = `<span style="color:#e74c3c;"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`;
    }
}

async function deletePaymentGateway(gatewayName) {
    if (!confirm(`Permanently delete "${gatewayName}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/payment-gateways/${encodeURIComponent(gatewayName)}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        selectedPaymentGateway = null;
        await loadPaymentGateways();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

async function loadPaymentGatewayLogs(gatewayName) {
    const el = document.getElementById('pgLogsContainer');
    if (!el) return;
    try {
        const res = await fetch(`${API_BASE}/admin/payment-logs/${encodeURIComponent(gatewayName)}`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const logs = await res.json();
        if (!logs.length) { el.innerHTML = '<em style="color:#aaa;">No transactions yet.</em>'; return; }
        let html = `<div class="table-responsive"><table class="admin-table">
            <thead><tr><th>Date</th><th>Transaction ID</th><th>Amount</th><th>Provider</th><th>Phone</th><th>Status</th></tr></thead><tbody>`;
        logs.forEach(l => {
            html += `<tr>
                <td>${new Date(l.initiatedAt).toLocaleString()}</td>
                <td><small>${l.transactionId}</small></td>
                <td>GHS ${(l.totalAmount || l.amount || 0).toFixed(2)}</td>
                <td>${l.provider || '-'}</td>
                <td>${l.phoneNumber || '-'}</td>
                <td><span class="status-badge status-${l.status}">${l.status}</span></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        el.innerHTML = html;
    } catch (err) {
        el.innerHTML = `<em style="color:#aaa;">Could not load logs: ${err.message}</em>`;
    }
}

// ========== INITIALIZE ==========
(async () => {
    initializeModal();
    initializeTabSwitching();
    await checkAdmin();
    loadStats();
    await loadClientTypes();
    setupSearch('usersTable', 'userSearch');
    setupSearch('ordersTable', 'orderSearch');
    setupSearch('transactionsTable', 'txnSearch');
    setupSearch('pricesTable', 'priceSearch');
    setupSearch('masterPricesTable', 'masterPriceSearch');
    setupSearch('withdrawalsTable', 'wdSearch');
    setupSearch('storesTable', 'storeSearch');
})();
