/**
 * order-status-updater.js
 * 
 * Automatically polls pending/processing orders and updates their status
 * by calling each provider's status endpoint via UniversalAPIHandler.
 * 
 * Usage in server.js:
 *   const { startOrderStatusUpdater } = require('./order-status-updater');
 *   startOrderStatusUpdater();
 */

const Order         = require('./models/Order');
const Provider      = require('./models/Provider');
const ProviderAPILog = require('./models/ProviderAPILog');
const UniversalAPIHandler = require('./services/UniversalAPIHandler');

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS   = Number(process.env.ORDER_STATUS_POLL_INTERVAL_MS || 10 * 60 * 1000);
const MAX_ORDER_AGE_HOURS = Number(process.env.ORDER_STATUS_MAX_AGE_HOURS || 168);
const STALE_SECONDS       = 30;            // Only check orders pending for at least 30 sec
const RETRY_AFTER_SECONDS  = Number(process.env.ORDER_STATUS_RETRY_AFTER_SECONDS || 10 * 60);
const MAX_ORDERS_PER_CYCLE = Number(process.env.ORDER_STATUS_MAX_PER_CYCLE || 20);

// ── Main polling function ─────────────────────────────────────────────────────
async function checkPendingOrders() {
    try {
        const cutoffAge  = new Date(Date.now() - MAX_ORDER_AGE_HOURS * 60 * 60 * 1000);
        const cutoffStale = new Date(Date.now() - STALE_SECONDS * 1000);

        // Find orders that are still pending/processing and not too old
        // Use case-insensitive matching for status values to handle 'pending', 'Pending', 'PENDING', etc.
        const pendingOrders = await Order.find({
            $or: [
                { status: { $regex: '^pending$', $options: 'i' } },
                { status: { $regex: '^processing$', $options: 'i' } }
            ],
            created: { $gte: cutoffAge, $lte: cutoffStale }
        })
            .sort({ created: -1 })
            .limit(MAX_ORDERS_PER_CYCLE)
            .lean();

        if (pendingOrders.length === 0) return;

        console.log(`[OrderStatusUpdater] Checking ${pendingOrders.length} pending/processing order(s)...`);

        for (const order of pendingOrders) {
            try {
                await checkAndUpdateOrder(order);
            } catch (err) {
                console.error(`[OrderStatusUpdater] Error checking order ${order._id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[OrderStatusUpdater] Poll cycle error:', err.message);
    }
}

async function checkAndUpdateOrder(order) {
    // Get the ProviderAPILog for this order — has providerName + apiReference
    const log = await ProviderAPILog.findOne({
        orderId: order._id
    }).sort({ requestTime: -1 }).lean();

    // Get providerName from order OR fall back to log
    const providerName = order.providerName || log?.providerName || order.package || order.provider;
    if (!providerName) {
        console.warn(`[OrderStatusUpdater] No providerName for order ${order._id} — skipping`);
        return;
    }

    // WhatsApp-fulfilled orders (MTN, AT Ishare, MTN AFA sent via WhatsApp notifier)
    // complete via ✅ reaction polling — NOT via API status polling.
    // Their providerReference starts with "WA-" to mark them.
    // Skip them here to avoid noisy "no status endpoint" logs every cycle.
    const reference = order.providerReference || log?.apiReference;
    if (reference && String(reference).startsWith('WA-')) {
        console.log(`[OrderStatusUpdater] Skipping ${order._id} | WhatsApp-fulfilled order — completes via reaction`);
        // Don't update lastStatusUpdate so it doesn't permanently back off
        return;
    }

    const provider = await Provider.findOne({ name: providerName }).lean();

    const activeConfig =
        Array.isArray(provider?.apiConfigs) && provider.apiConfigs[0]?.enabled
            ? provider.apiConfigs[0]
            : provider?.apiConfig;
    
    if (!activeConfig?.enabled || !activeConfig.statusEndpoint) {
        console.log(`[OrderStatusUpdater] Skipping ${order._id} | provider ${providerName} has no status endpoint`);
        await Order.findByIdAndUpdate(order._id, { lastStatusUpdate: new Date() });
        return;
    }

    // Only check external status when the provider gave us a real reference.
    // Falling back to our local order ID causes repeated 404s.
    if (!reference) {
        console.log(`[OrderStatusUpdater] Skipping ${order._id} | no provider reference yet`);
        await Order.findByIdAndUpdate(order._id, { lastStatusUpdate: new Date() });
        return;
    }

    console.log(`[OrderStatusUpdater] Checking order ${order._id} | provider: ${providerName} | ref: ${reference}`);

    try {
        const result = await UniversalAPIHandler.checkOrderStatus(providerName, reference);

        console.log(`[OrderStatusUpdater] Result for ${order._id}:`, {
            success: result.success,
            orderStatus: result.orderStatus,
            status: result.status
        });

        // Map provider response to our status values (covers XpresPortal + generic)
        const rawStatus = (result.orderStatus || '').toLowerCase();
        const xpresMap  = { delivered: 'completed', resolved: 'completed', cancelled: 'failed', refunded: 'cancelled/refunded' };
        let newStatus = xpresMap[rawStatus] || null;

        if (!newStatus) {
            if (
                rawStatus === 'success' ||
                rawStatus === 'completed' ||
                rawStatus === 'sent'
            ) {
                newStatus = 'Completed';
            }
            } else if (rawStatus === 'failed' || rawStatus === 'rejected') {
                newStatus = 'Failed';
            } else if (rawStatus === 'processing' || rawStatus === 'pending') {
                newStatus = 'Processing';
            }
    
        // If no clear status, leave it unchanged and keep polling

        if (newStatus && newStatus !== order.status) {
            await Order.findByIdAndUpdate(order._id, {
                status:    newStatus,
                completed: newStatus.toLowerCase() === 'completed' ? new Date() : undefined,
                lastStatusUpdate: new Date()
            });
            console.log(`[OrderStatusUpdater] ✅ Order ${order._id} updated: ${order.status} → ${newStatus}`);
        } else if (!newStatus) {
            // No clear status but API call succeeded — keep polling without backing off
            console.log(`[OrderStatusUpdater] Order ${order._id} status unclear, will check again next cycle`);
        }
    } catch (err) {
        console.error(`[OrderStatusUpdater] Error checking order ${order._id}:`, err.message);
        // Back off from checking on error
        await Order.findByIdAndUpdate(order._id, { lastStatusUpdate: new Date() });
    }
}

// ── Start the background job ──────────────────────────────────────────────────

function startOrderStatusUpdater() {
    console.log(`[OrderStatusUpdater] Started - polling every ${POLL_INTERVAL_MS / 60000} minutes; checking pending orders from the last ${MAX_ORDER_AGE_HOURS} hour(s) only`);

    // Run immediately on startup to catch any orders that were pending when server restarted
    setTimeout(checkPendingOrders, 10 * 1000); // 10s delay after boot

    // Then run on interval
    setInterval(checkPendingOrders, POLL_INTERVAL_MS);
}

/**
 * Manually trigger a status check for a single order by its ID.
 * Used by the admin "Refresh Status" button.
 */
async function checkSingleOrder(orderId) {
    const order = await Order.findById(orderId).lean();
    if (!order) throw new Error(`Order ${orderId} not found`);
    await checkAndUpdateOrder(order);
    return await Order.findById(orderId).lean(); // return updated order
}

module.exports = { startOrderStatusUpdater, checkSingleOrder, checkPendingOrders };
