// price-loader.js
// Utility to load referral prices dynamically for package pages
// Supports both logged-in users and public referral visits

const API_BASE = 'http://localhost:5000/api';

/**
 * Detect if this is a referral/storefront visit
 * Returns the store slug if visiting via referral, null otherwise
 */
function detectStoreSlug() {
    const params = new URLSearchParams(window.location.search);
    return params.get('store') || null;
}

/**
 * Get prices for a specific provider and optional client type
 * For referral visits: fetches from public /api/storefront-prices endpoint
 * For logged-in users: fetches from authenticated /api/referral-prices endpoint
 * 
 * @param {string} provider - Provider name (e.g., 'MTN', 'Telecel')
 * @param {string} clientType - Client type (e.g., 'Customers', 'Dealers'). Only used for logged-in users.
 * @returns {Promise<Array>} Array of price objects {provider, packageName, price}
 */
async function loadPricesForProvider(provider, clientType = null) {
    const storeSlug = detectStoreSlug();
    
    try {
        if (storeSlug) {
            // Public referral visit — fetch dealer's prices for Customers
            const url = new URL(`${API_BASE}/storefront-prices`, window.location.origin);
            url.searchParams.set('store', storeSlug);
            url.searchParams.set('clientType', 'Customers');
            
            const res = await fetch(url.toString());
            if (!res.ok) {
                console.warn('Failed to load storefront prices:', res.status);
                return [];
            }
            
            const allPrices = await res.json();
            // Filter by provider (case-insensitive match)
            return allPrices.filter(p => {
                const dbProvider = (p.provider || '').toLowerCase();

                if (provider.toLowerCase() === 'at ishare') {
                    return [
                        'at',
                        'at ishare',
                        'airteltigo',
                        'airtel tigo'
                    ].includes(dbProvider);
                }

                return dbProvider === provider.toLowerCase();
            });     
       } else {
            // Logged-in user — fetch their own referral prices
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('Not authenticated and not a referral visit');
                return [];
            }
            
            const res = await fetch(`${API_BASE}/referral-prices`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                console.warn('Failed to load referral prices:', res.status);
                return [];
            }
            
            const allPrices = await res.json();
            // Filter by provider (case-insensitive match) and optionally by client type
            let filtered = allPrices.filter(p => p.provider && p.provider.toLowerCase() === provider.toLowerCase());
            if (clientType) {
                filtered = filtered.filter(p => p.clientType === clientType);
            }
            return filtered;
        }
    } catch (err) {
        console.error('Error loading prices:', err);
        return [];
    }
}

/**
 * Populate bundle select options dynamically
 * Removes hardcoded options and replaces with loaded prices
 * 
 * @param {HTMLSelectElement} selectElement - The bundle select dropdown
 * @param {string} provider - Provider name (e.g., 'MTN', 'Telecel')
 * @param {string} clientType - Client type for logged-in users (optional)
 */
async function populateBundleOptions(selectElement, provider, clientType = null) {
    if (!selectElement) return;
    
    const prices = await loadPricesForProvider(provider, clientType);
    
    // Clear existing options (keep the placeholder)
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }
    
    if (prices.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No bundles available';
        emptyOption.disabled = true;
        selectElement.appendChild(emptyOption);
        return;
    }
    
    // Sort by package name for consistency
    prices.sort((a, b) => {
        const aSize = parseInt(a.packageName) || 0;
        const bSize = parseInt(b.packageName) || 0;
        return aSize - bSize;
    });
    
    // Add options from loaded prices
    prices.forEach((priceObj, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.setAttribute('data-price', priceObj.price.toFixed(2));
        option.setAttribute('data-validity', '90 days'); // Default validity, adjust as needed
        option.setAttribute('data-network', provider);
        option.textContent = `${priceObj.packageName} - ${priceObj.price.toFixed(2)} GHS`;
        selectElement.appendChild(option);
    });
}

/**
 * Get the currently selected bundle price
 * @param {HTMLSelectElement} selectElement - The bundle select dropdown
 * @returns {number|null} The price or null if nothing selected
 */
function getSelectedBundlePrice(selectElement) {
    if (!selectElement || !selectElement.value) return null;
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    return parseFloat(selectedOption.getAttribute('data-price')) || null;
}
