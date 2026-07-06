/**
 * order-submit.js
 * Shared payment + order submission utility used by all bundle pages.
 *
 * Flow:
 *   1. POST /api/payment/initiate  — triggers Moolre USSD push to customer's phone
 *   2. POST /api/orders            — records the order in DB
 *   3. Returns { success, transactionId, message } to the bundle page
 *
 * The bundle page then polls GET /api/payment/status/:transactionId
 * until status is "success" or "failed".
 */

const ORDER_API = 'http://localhost:5000/api';

function orderAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

function getOrderContext() {
    const p = new URLSearchParams(window.location.search);
    return {
        storeSlug:  p.get('store')    || localStorage.getItem('storeSlug')  || '',
        clientType: p.get('client')   || localStorage.getItem('clientType') || 'Customers',
        provider:   p.get('provider') || '',
    };
}

/**
 * Submit an order — initiates Moolre payment and records the order.
 *
 * @param {object} orderData
 *   - beneficiary  {string}  phone receiving the data bundle
 *   - paymentPhone {string}  phone to charge (may differ from beneficiary)
 *   - network      {string}  customer's network: "MTN", "Telecel", "AirtelTigo"
 *   - package      {string}  provider name e.g. "MTN", "MTN EXPRESS"
 *   - bundle_size  {string}  e.g. "1 GB", "2 GB"
 *   - amount       {number}  price to charge
 *   - isPorted     {boolean} whether the number is ported
 *
 * @returns {Promise<{success, transactionId, message}>}
 */
async function submitOrder(orderData) {
    const { storeSlug, clientType } = getOrderContext();

    // ── Step 1: Initiate Moolre payment ──────────────────────────────────────
    // This triggers a USSD push to the customer's phone asking them to
    // enter their MoMo PIN to approve the payment.
    let transactionId = null;
    try {
        const payRes = await fetch(`${ORDER_API}/payment/initiate`, {
            method:  'POST',
            headers: orderAuthHeaders(),
            body:    JSON.stringify({
                gatewayName: 'Moolre',
                phoneNumber: orderData.paymentPhone || orderData.beneficiary,
                beneficiary: orderData.beneficiary,
                amount:      orderData.amount,
                provider:    orderData.paymentNetwork || orderData.network || orderData.package,
                paymentNetwork: orderData.paymentNetwork || orderData.network || orderData.package,
                orderProvider:  orderData.package,
                description: `${orderData.package} ${orderData.bundle_size} bundle`,
                packageName: orderData.bundle_size,
                bundle_size: orderData.bundle_size,
                storeSlug:   storeSlug  || null,
                clientType:  clientType || 'Customers',
            }),
        });

        const payData = await payRes.json();
        console.log('[order-submit] payment/initiate response:', payData);

        if (!payRes.ok || !payData.success) {
            return {
                success: false,
                message: payData.message || 'Could not initiate payment. Please try again.'
            };
        }

        transactionId = payData.transactionId;

    } catch (err) {
        console.error('[order-submit] payment initiation error:', err);
        return { success: false, message: 'Network error initiating payment. Please check your connection.' };
    }

    // ── Step 2: Record the order in DB ────────────────────────────────────────
    try {
        const orderRes = await fetch(`${ORDER_API}/orders`, {
            method:  'POST',
            headers: orderAuthHeaders(),
            body:    JSON.stringify({
                beneficiary:   orderData.beneficiary,
                package:       orderData.package,
                bundle_size:   orderData.bundle_size,
                amount:        orderData.amount,
                isPorted:      orderData.isPorted || false,
                status:        'pending',
                transactionId: transactionId,
                storeSlug:     storeSlug  || null,
                clientType:    clientType || 'Customers',
                created:       new Date().toISOString(),
            }),
        });

        if (!orderRes.ok) {
            console.warn('[order-submit] order record failed — payment still initiated');
        }
    } catch (err) {
        console.warn('[order-submit] order record error (non-fatal):', err);
    }

    // Return the transactionId so the page can poll for payment confirmation
    return {
        success:       true,
        transactionId: transactionId,
        message:       'Payment prompt sent! Please check your phone and enter your MoMo PIN to confirm.'
    };
}

/**
 * Poll payment status until success, failure, or timeout.
 *
 * @param {string}   transactionId
 * @param {Function} onUpdate      called with current status on each poll
 * @param {number}   timeoutMs     how long to poll before giving up (default 3 min)
 * @returns {Promise<{status: 'success'|'failed'|'timeout'}>}
 */
async function pollPaymentStatus(transactionId, onUpdate, timeoutMs = 180000) {
    const INTERVAL  = 5000; // poll every 5 seconds
    const deadline  = Date.now() + timeoutMs;

    return new Promise((resolve) => {
        const timer = setInterval(async () => {
            try {
                const res  = await fetch(
                    `${ORDER_API}/payment/status/${transactionId}`,
                    { headers: orderAuthHeaders() }
                );
                const data = await res.json();
                const status = data.status || data.transaction?.status || 'pending';

                console.log('[order-submit] poll status:', status);
                if (onUpdate) onUpdate(status);

                if (status === 'success') {
                    clearInterval(timer);
                    resolve({ status: 'success' });
                } else if (status === 'failed' || status === 'cancelled') {
                    clearInterval(timer);
                    resolve({ status: 'failed' });
                } else if (Date.now() >= deadline) {
                    clearInterval(timer);
                    resolve({ status: 'timeout' });
                }
            } catch (err) {
                console.warn('[order-submit] poll error:', err);
                if (Date.now() >= deadline) {
                    clearInterval(timer);
                    resolve({ status: 'timeout' });
                }
            }
        }, INTERVAL);
    });
}
