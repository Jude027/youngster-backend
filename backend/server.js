const MasterPrice = require('./models/MasterPrice');
const Provider = require('./models/Provider');
const ProviderAPILog = require('./models/ProviderAPILog');
const UniversalAPIHandler = require('./services/UniversalAPIHandler');
const ClientType = require('./models/ClientType');
const RolePriceMapping = require('./models/RolePriceMapping');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const util = require('util');

// Load models
const User = require('./models/User');
const Order = require('./models/Order');
const Transaction = require('./models/Transaction');
const ReferralPrice = require('./models/ReferralPrice');
const StoreSettings = require('./models/StoreSettings');
const Commission = require('./models/Commission');
const Withdrawal = require('./models/Withdrawal');
const BasePrice = require('./models/BasePrice');
const PaymentGateway = require('./models/PaymentGateway');
const PaymentTransaction = require('./models/PaymentTransaction');
const PaymentService = require('./services/PaymentService');
const { startOrderStatusUpdater } = require('./order-status-updater');

dotenv.config();

const runtimeLogFile = path.join(__dirname, 'runtime.log');
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

function formatLogArgs(args) {
    return util.format(...args);
}

function writeRuntimeLog(level, line) {
    try {
        fs.appendFileSync(runtimeLogFile, `[${new Date().toISOString()}] [${level}] ${line}\n`);
    } catch (_) { }
}

console.log = (...args) => {
    const line = formatLogArgs(args);
    process.stdout.write(line + '\n');
    writeRuntimeLog('INFO', line);
};
console.warn = (...args) => {
    const line = formatLogArgs(args);
    process.stderr.write(line + '\n');
    writeRuntimeLog('WARN', line);
};
console.error = (...args) => {
    const line = formatLogArgs(args);
    process.stderr.write(line + '\n');
    writeRuntimeLog('ERROR', line);
};

const app = express();
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, server-to-server)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'https://youngster-frontend-production.up.railway.app',
            'https://xpresportal.app'
        ];

        const isAllowed =
            allowedOrigins.includes(origin) ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('trycloudflare.com') ||
            origin.includes('railway.app') ||
            /^http:\/\/172\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);

        if (isAllowed) {
            return callback(null, true);
        }

        console.log('❌ CORS blocked:', origin);
        return callback(new Error('CORS not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger middleware
app.use((req, res, next) => {
    console.log(`📨 [REQUEST] ${req.method} ${req.path} from ${req.get('origin') || 'unknown'}`);
    next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// ─── Slug helper ──────────────────────────────────────────────────────────────
// Converts a store name into a clean URL slug, e.g. "J.D Youngster Enterprise" → "jd-youngster-enterprise"
function slugify(name = '') {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric (except spaces & hyphens)
        .trim()
        .replace(/\s+/g, '-')            // spaces → hyphens
        .replace(/-+/g, '-');            // collapse repeated hyphens
}

function deriveCapacity(packageName = '') {
    const match = String(packageName).match(/(\d+(?:\.\d+)?)/);
    if (!match) return undefined;

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : undefined;
}

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

function normalizeProviderOrderStatus(status = '') {
    const rawStatus = String(status).toLowerCase().trim();
    const statusMap = {
        delivered: 'completed',
        resolved: 'completed',
        success: 'completed',
        successful: 'completed',
        completed: 'completed',
        cancelled: 'failed',
        canceled: 'failed',
        rejected: 'failed',
        failed: 'failed',
        refunded: 'cancelled/refunded',
        pending: 'processing',
        processing: 'processing'
    };

    return statusMap[rawStatus] || null;
}

function resolvePaymentPackageName(paymentTransaction) {
    return paymentTransaction.packageName ||
        paymentTransaction.metadata?.packageName ||
        paymentTransaction.metadata?.bundle_size ||
        paymentTransaction.bundle ||
        '';
}

function normalizeText(value = '') {
    return String(value).trim().toLowerCase();
}

async function resolveStoreOwnerUserIds(storeSlug) {
    if (!storeSlug) return [];
    const storeSettings = await StoreSettings.find({ storeSlug }).lean();
    return Array.from(new Set(storeSettings.map(s => s.userId?.toString()).filter(Boolean)));
}

async function findStoreSettingsByStoreSlug(storeSlug) {
    if (!storeSlug) return null;
    return await StoreSettings.findOne({ storeSlug }).sort({ updatedAt: -1, _id: -1 }).lean();
}

async function resolvePaymentUserId(paymentData) {
    const storeSlug = paymentData.storeSlug || paymentData.metadata?.storeSlug;
    if (storeSlug) {
        const storeSettingsList = await StoreSettings.find({ storeSlug }).sort({ updatedAt: -1, _id: -1 }).lean();
        if (storeSettingsList.length) {
            if (paymentData.userId) {
                const matched = storeSettingsList.find(s => s.userId?.toString() === String(paymentData.userId));
                if (matched?.userId) return matched.userId;
            }

            if (storeSettingsList.length > 1 && paymentData.provider && paymentData.packageName) {
                for (const storeSettings of storeSettingsList) {
                    if (!storeSettings?.userId) continue;
                    const referralPrice = await ReferralPrice.findOne({
                        userId: storeSettings.userId,
                        provider: exactTextPattern(paymentData.provider),
                        packageName: { $in: buildPackageNamePatterns(paymentData.packageName) },
                        ...(paymentData.clientType ? { clientType: exactTextPattern(paymentData.clientType) } : {})
                    }).lean();
                    if (referralPrice) {
                        console.log('[Payment] resolved store owner from referral price candidate', {
                            storeSlug,
                            candidateUserId: storeSettings.userId.toString(),
                            provider: paymentData.provider,
                            packageName: paymentData.packageName,
                            clientType: paymentData.clientType || '(none)'
                        });
                        return storeSettings.userId;
                    }
                }
            }

            return storeSettingsList[0].userId;
        }

        const user = await User.findOne({ storeSlug }).lean();
        if (user?._id) return user._id;
    }

    if (paymentData.userId) return paymentData.userId;
    return null;
}

function escapeRegex(value = '') {
    return String(value).replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&');
}

function exactTextPattern(value = '') {
    return new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');
}

function normalizePackageName(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/gigabytes?/g, 'gb')
        .replace(/megabytes?/g, 'mb');
}

function buildPackageNamePatterns(packageName = '') {
    const label = String(packageName || '').trim();
    if (!label) return [exactTextPattern('')];

    const normalized = normalizePackageName(label);
    const patterns = [exactTextPattern(label)];
    if (normalized !== label.toLowerCase()) {
        patterns.push(exactTextPattern(normalized));
    }

    const whitespaceOptional = normalized.replace(/\s+/g, '\\s*').replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&');
    patterns.push(new RegExp(`^${whitespaceOptional}$`, 'i'));

    const numericMatch = normalized.match(/^(\d+(?:\.\d+)?)(?:\s*(?:gb|g|mb))?$/);
    if (numericMatch) {
        patterns.push(new RegExp(`^\\s*${numericMatch[1]}\\s*(?:gb|g|mb)?\\s*$`, 'i'));
    }

    return patterns;
}

function buildClientTypeVariants(value = '') {
    const text = String(value || '').trim();
    if (!text) return [];

    const normalized = normalizeText(text);
    const variants = [text];
    if (normalized.endsWith('s')) {
        const singular = normalized.replace(/s$/, '');
        if (singular && singular !== normalized) variants.push(singular);
    } else {
        variants.push(`${normalized}s`);
    }

    const deduped = [];
    for (const variant of variants) {
        const trimmed = String(variant || '').trim();
        if (trimmed && !deduped.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
            deduped.push(trimmed);
        }
    }
    return deduped;
}

async function resolveOriginalPackagePrice({ userId, provider, packageName, clientType }) {
    const providerName = String(provider || '').trim();
    const packageLabel = String(packageName || '').trim();
    const clientTypeName = String(clientType || '').trim();
    if (!providerName || !packageLabel) return null;

    const referralQuery = {
        userId,
        provider: exactTextPattern(providerName),
        packageName: { $in: buildPackageNamePatterns(packageLabel) }
    };
    if (clientTypeName) referralQuery.clientType = exactTextPattern(clientTypeName);

    const referralPrice = await ReferralPrice.findOne(referralQuery).lean();
    const referralOriginalPrice = Number(referralPrice?.originalPrice);

    console.log('[Commission] resolveOriginalPackagePrice start', {
        userId,
        providerName,
        packageLabel,
        clientTypeName,
        normalizedUserRole: String((await User.findById(userId).select('role').lean())?.role || '').trim(),
        referralQuery: {
            userId,
            provider: providerName,
            packageName: packageLabel,
            clientType: clientTypeName || '(none)'
        },
        referralFound: !!referralPrice,
        referralOriginalPrice: referralOriginalPrice || null
    });

    if (Number.isFinite(referralOriginalPrice) && referralOriginalPrice > 0) {
        return referralOriginalPrice;
    }

    const user = await User.findById(userId).select('role').lean();
    const normalizedUserRole = String(user?.role || '').trim();
    const mapping = normalizedUserRole
        ? await RolePriceMapping.findOne({ role: exactTextPattern(normalizedUserRole) }).lean()
        : null;

    const clientTypeCandidates = [];
    const addClientTypeCandidate = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return;
        if (!clientTypeCandidates.some(ct => ct.toLowerCase() === trimmed.toLowerCase())) {
            clientTypeCandidates.push(trimmed);
        }
    };

    if (mapping?.basePriceClientType) {
        addClientTypeCandidate(mapping.basePriceClientType);
        buildClientTypeVariants(mapping.basePriceClientType).forEach(addClientTypeCandidate);
    }

    if (normalizedUserRole) {
        addClientTypeCandidate(normalizedUserRole);
        buildClientTypeVariants(normalizedUserRole).forEach(addClientTypeCandidate);
    }

    if (clientTypeName) {
        addClientTypeCandidate(clientTypeName);
        buildClientTypeVariants(clientTypeName).forEach(addClientTypeCandidate);
    }

    for (const clientTypeCandidate of clientTypeCandidates) {
        const basePrice = await BasePrice.findOne({
            provider: exactTextPattern(providerName),
            packageName: { $in: buildPackageNamePatterns(packageLabel) },
            clientType: exactTextPattern(clientTypeCandidate)
        }).lean();
        const basePriceValue = Number(basePrice?.price);
        if (Number.isFinite(basePriceValue) && basePriceValue > 0) return basePriceValue;
    }

    const masterQuery = {
        provider: exactTextPattern(providerName),
        packageName: { $in: buildPackageNamePatterns(packageLabel) }
    };
    if (clientTypeName) masterQuery.clientType = exactTextPattern(clientTypeName);
    const masterPrice = await MasterPrice.findOne(masterQuery).lean();
    const masterOriginalPrice = Number(masterPrice?.originalPrice);
    return Number.isFinite(masterOriginalPrice) && masterOriginalPrice > 0 ? masterOriginalPrice : null;
}

async function recordOrderCommission({ userId, order, paymentTransaction, transactionRecord, gatewayName }) {
    const transactionStatus = normalizeText(transactionRecord?.status || paymentTransaction?.status);
    if (!['complete', 'completed', 'success'].includes(transactionStatus)) return null;

    const clientPaid = Number(paymentTransaction?.amount ?? order?.amount ?? transactionRecord?.amount ?? 0);
    if (!Number.isFinite(clientPaid) || clientPaid <= 0) return null;

    const provider = paymentTransaction?.provider || order?.providerName || order?.package;
    const packageName = resolvePaymentPackageName(paymentTransaction || {}) || order?.packageName || order?.bundleSize || order?.bundle_size;
    const clientType = paymentTransaction?.clientType || paymentTransaction?.metadata?.clientType || order?.clientType;
    const storeSlug = paymentTransaction?.storeSlug || order?.storeSlug || null;
    const storeOwnerUserId = storeSlug ? await resolvePaymentUserId({ storeSlug }) : null;

    let lookupUserId = userId;
    let originalPrice = await resolveOriginalPackagePrice({ userId: lookupUserId, provider, packageName, clientType });

    if ((!Number.isFinite(originalPrice) || originalPrice <= 0) && storeOwnerUserId && storeOwnerUserId.toString() !== String(userId)) {
        console.log('[Commission] fallback to store owner userId', {
            originalPrice,
            userId: userId?.toString(),
            storeOwnerUserId: storeOwnerUserId.toString(),
            storeSlug
        });
        lookupUserId = storeOwnerUserId;
        originalPrice = await resolveOriginalPackagePrice({ userId: lookupUserId, provider, packageName, clientType });
    }

    if ((!Number.isFinite(originalPrice) || originalPrice <= 0) && storeSlug) {
        const alternateOwnerIds = (await resolveStoreOwnerUserIds(storeSlug))
            .filter(id => id && String(id) !== String(lookupUserId));
        if (alternateOwnerIds.length) {
            console.log('[Commission] trying alternate store owner ids for original price lookup', {
                storeSlug,
                lookupUserId: lookupUserId?.toString(),
                alternateOwnerIds
            });
            for (const alternateOwnerId of alternateOwnerIds) {
                const candidateOriginalPrice = await resolveOriginalPackagePrice({
                    userId: alternateOwnerId,
                    provider,
                    packageName,
                    clientType
                });
                if (Number.isFinite(candidateOriginalPrice) && candidateOriginalPrice > 0) {
                    console.log('[Commission] resolved original price via alternate owner', {
                        alternateOwnerId,
                        storeSlug,
                        provider,
                        packageName,
                        clientType,
                        candidateOriginalPrice
                    });
                    lookupUserId = alternateOwnerId;
                    originalPrice = candidateOriginalPrice;
                    break;
                }
            }
        }
    }

    const commissionUserId = lookupUserId;
    const originalPriceValue = Number(originalPrice);

    console.log('[Commission] Resolved original price', {
        userId: userId?.toString(),
        commissionUserId: commissionUserId?.toString() || null,
        lookupUserId: lookupUserId?.toString() || null,
        storeSlug,
        provider,
        packageName,
        clientType,
        clientPaid,
        originalPrice,
        originalPriceValue
    });

    if (!Number.isFinite(originalPriceValue) || originalPriceValue <= 0) {
        console.warn('[Commission] Original price not found or invalid; commission not recorded', {
            userId: userId?.toString(),
            orderId: order?._id?.toString(),
            provider,
            packageName,
            clientType,
            clientPaid,
            originalPrice,
            originalPriceValue
        });
        return null;
    }

    const commissionAmount = Number((clientPaid - originalPriceValue).toFixed(2));
    if (commissionAmount <= 0) {
        console.log('[Commission] No positive commission to record', {
            orderId: order?._id?.toString(),
            clientPaid,
            originalPrice: originalPriceValue
        });
        return null;
    }

    const existing = await Commission.findOne({ source: 'order', sourceId: order._id });
    if (existing) return existing;

    const commission = await Commission.create({
        userId: commissionUserId,
        amount: commissionAmount,
        source: 'order',
        sourceId: order._id,
        description: `${provider} ${packageName} commission via ${gatewayName || paymentTransaction?.paymentGateway || 'payment'}`
    });

    await User.findByIdAndUpdate(commissionUserId, {
        $inc: {
            availableBalance: commissionAmount,
            totalEarned: commissionAmount
        }
    });

    console.log('[Commission] Recorded order commission', {
        userId: userId?.toString(),
        orderId: order._id.toString(),
        commissionId: commission._id.toString(),
        clientPaid,
        originalPrice,
        commissionAmount
    });

    return commission;
}

async function createPaidOrderRecords(paymentTransaction, gatewayName = paymentTransaction.paymentGateway) {
    if (!paymentTransaction) {
        return null;
    }

    if (paymentTransaction.orderId) {
        const existingOrder = await Order.findById(paymentTransaction.orderId);
        if (existingOrder) {
            const existingCommission = await Commission.findOne({ source: 'order', sourceId: existingOrder._id });
            if (!existingCommission) {
                const txRecord = await Transaction.findOne({ orderId: existingOrder._id, status: { $in: ['complete', 'completed'] } });
                await recordOrderCommission({
                    userId: paymentTransaction.userId || existingOrder.userId,
                    order: existingOrder,
                    paymentTransaction,
                    transactionRecord: txRecord,
                    gatewayName
                });
            }
            return existingOrder._id;
        }
    }

    const userId = await resolvePaymentUserId(paymentTransaction);
    if (!userId) {
        console.warn('[PaidOrder] Could not resolve user/store for paid transaction', {
            transactionId: paymentTransaction.transactionId,
            storeSlug: paymentTransaction.storeSlug || paymentTransaction.metadata?.storeSlug || null
        });
        return null;
    }

    const user = await User.findById(userId);
    if (!user) return null;

    const balanceBefore = user.balance || 0;
    const resolvedPackageName = resolvePaymentPackageName(paymentTransaction);
    const storeSlug = paymentTransaction.storeSlug || paymentTransaction.metadata?.storeSlug || null;
    const clientType = paymentTransaction.clientType || paymentTransaction.metadata?.clientType || 'Customers';
    const resolvedBeneficiary = paymentTransaction.metadata?.beneficiary || paymentTransaction.phoneNumber;

    const order = new Order({
        userId,
        storeSlug,
        clientType,
        beneficiary: resolvedBeneficiary,
        phoneNumber: resolvedBeneficiary,
        package: paymentTransaction.provider,
        providerName: paymentTransaction.provider,
        packageName: resolvedPackageName,
        bundleSize: resolvedPackageName,
        bundle_size: resolvedPackageName,
        amount: paymentTransaction.amount,
        price: paymentTransaction.amount,
        balanceBefore,
        balanceAfter: balanceBefore,
        status: 'Processing',
        report: `Payment via ${gatewayName} - Transaction: ${paymentTransaction.transactionId}`
    });
    await order.save();

    submitOrderToProvider(order, {
        phoneNumber: resolvedBeneficiary,
        packageName: resolvedPackageName,
        capacity: deriveCapacity(resolvedPackageName),
        price: paymentTransaction.amount,
        provider: paymentTransaction.provider,
        network: paymentTransaction.provider,
        reference: order._id.toString(),
        orderId: order._id
    }).catch(err => console.error('Provider submission failed:', err.message));

    const txRecord = new Transaction({
        userId,
        storeSlug,
        beneficiary_phone: paymentTransaction.phoneNumber,
        description: `${paymentTransaction.provider} Bundle Purchase - ${resolvedBeneficiary}`,
        balance_before: balanceBefore,
        amount: paymentTransaction.totalAmount || paymentTransaction.amount,
        method: 'Mobile Money',
        status: 'complete',
        orderId: order._id,
        created: new Date()
    });
    await txRecord.save();

    await recordOrderCommission({
        userId,
        order,
        paymentTransaction,
        transactionRecord: txRecord,
        gatewayName
    });

    paymentTransaction.userId = userId;
    paymentTransaction.storeSlug = storeSlug;
    paymentTransaction.clientType = clientType;
    paymentTransaction.orderId = order._id;
    await paymentTransaction.save();

    console.log('[PaidOrder] Order and Transaction records created', {
        transactionId: paymentTransaction.transactionId,
        orderId: order._id.toString(),
        transactionRecordId: txRecord._id.toString(),
        paymentPhoneNumber: paymentTransaction.phoneNumber,
        beneficiaryPhoneNumber: resolvedBeneficiary
    });

    return order._id;
}

function shouldFallbackToWhatsApp(resultOrError) {
    const message = String(resultOrError?.message || resultOrError?.error || resultOrError || '').toLowerCase();
    return [
        'api not configured',
        'provider api not configured',
        'not configured',
        'no active api',
        'api disabled'
    ].some(text => message.includes(text));
}

async function submitOrderToProvider(order, orderData) {
    const providerName = orderData.provider || orderData.network || order.providerName || order.package;
    let result;

    try {
        console.log('[ProviderSubmit] Starting provider submission', {
            orderId: order?._id?.toString(),
            providerName,
            phoneNumber: orderData.phoneNumber,
            packageName: orderData.packageName,
            price: orderData.price,
            automation: 'provider API'
        });

        const provider = await Provider.findOne({ name: providerName });
        let routing = provider?.orderRouting?.handler || 'auto';

        // Evaluate capacity-based routing rules if mode is 'auto'
        if (routing === 'auto' && provider?.orderRouting) {
            const capacity = parseFloat(orderData.capacity);
            if (!isNaN(capacity)) {
                const { whatsappMinGb, whatsappMaxGb, apiMinGb, apiMaxGb } = provider.orderRouting;

                const hasWhatsappRules = whatsappMinGb != null || whatsappMaxGb != null;
                const matchesWhatsapp = hasWhatsappRules &&
                    (whatsappMinGb != null ? capacity >= whatsappMinGb : true) &&
                    (whatsappMaxGb != null ? capacity <= whatsappMaxGb : true);

                const hasApiRules = apiMinGb != null || apiMaxGb != null;
                const matchesApi = hasApiRules &&
                    (apiMinGb != null ? capacity >= apiMinGb : true) &&
                    (apiMaxGb != null ? capacity <= apiMaxGb : true);

                if (matchesWhatsapp && !matchesApi) {
                    routing = 'whatsapp';
                } else if (matchesApi && !matchesWhatsapp) {
                    routing = 'api';
                }
            }
        }

        let usedAutomation = 'api';

        if (routing === 'whatsapp') {
            console.log(`[ProviderSubmit] Explicitly routed to WhatsApp for ${providerName} (Capacity: ${orderData.capacity}GB)`);
            const { notifyMtnOrder } = require('./services/WhatsAppNotifier');
            result = await notifyMtnOrder(providerName, orderData);
            usedAutomation = 'whatsapp';
        } else {
            // Try API first
            try {
                result = await UniversalAPIHandler.processOrder(providerName, orderData);
                if (routing === 'auto' && !result?.success && shouldFallbackToWhatsApp(result)) {
                    console.log(`[ProviderSubmit] API unavailable for ${providerName}, falling back to WhatsApp Notifier`, {
                        orderId: order?._id?.toString(),
                        reason: result?.message || result?.error || 'Unknown API failure'
                    });
                    const { notifyMtnOrder } = require('./services/WhatsAppNotifier');
                    result = await notifyMtnOrder(providerName, orderData);
                    usedAutomation = 'whatsapp';
                }
            } catch (err) {
                // Fallback to WhatsApp if API is not configured or specifically auto-fallback
                if (routing === 'auto' && shouldFallbackToWhatsApp(err)) {
                    console.log(`[ProviderSubmit] API not configured for ${providerName}, falling back to WhatsApp Notifier`, {
                        orderId: order?._id?.toString(),
                        reason: err.message
                    });
                    const { notifyMtnOrder } = require('./services/WhatsAppNotifier');
                    result = await notifyMtnOrder(providerName, orderData);
                    usedAutomation = 'whatsapp';
                } else {
                    throw err; // throw actual API errors
                }
            }
        }

        console.log(`[ProviderSubmit] Completed via ${usedAutomation}`);
    } catch (err) {
        console.error('[ProviderSubmit] Provider submission crashed', {
            orderId: order?._id?.toString(),
            providerName,
            error: err.message
        });

        result = {
            success: false,
            message: err.message || 'Provider submission failed',
            error: err.toString()
        };
    }

    if (result?.success) {
        order.providerReference = result.apiReference || null;
        order.providerOrderId =
            result.data?.orderId ||
            result.orderId ||
            null;
        order.lastStatusUpdate = new Date();
        order.status = result.orderStatus === 'completed' ? 'Completed' : order.status;
        await order.save();

        console.log('Provider details saved:', {
            providerReference: order.providerReference,
            providerOrderId: order.providerOrderId
        });
    } else if (result?.message) {
        const providerMessage = result.actionRequired === 'TOP_UP_IGET_WALLET'
            ? `Action required: ${result.message}`
            : `Provider submission failed: ${result.message}`;
        order.report = [order.report, providerMessage].filter(Boolean).join(' | ');
        if (result.actionRequired === 'TOP_UP_IGET_WALLET') {
            order.status = 'Processing';
        }
        order.lastStatusUpdate = new Date();
        await order.save();
    }

    console.log('[ProviderSubmit] Finished provider submission', {
        orderId: order?._id?.toString(),
        providerName,
        success: Boolean(result?.success),
        message: result?.message,
        providerReference: order.providerReference || null
    });

    return result;
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// ==================== MIDDLEWARE ====================
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const admin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

// ==================== TEST ENDPOINT ====================
app.get('/api/test', (req, res) => {
    console.log('✅ [SERVER] Test endpoint called - backend is reachable!');
    res.json({ message: 'Backend is reachable', timestamp: new Date().toISOString() });
});

// ==================== CHECK SERVER IP ====================
app.get('/api/check-ip', async (req, res) => {
    try {
        const http = require('http');

        console.log('\n' + '='.repeat(80));
        console.log('🌐 CHECKING SERVER IP');

        // Get local IP
        const os = require('os');
        const interfaces = os.networkInterfaces();
        let localIP = 'unknown';

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIP = iface.address;
                }
            }
        }

        console.log('Local IP:', localIP);
        console.log('Request origin IP:', req.get('x-forwarded-for') || req.connection.remoteAddress);
        console.log('='.repeat(80) + '\n');

        res.json({
            localIP: localIP,
            remoteIP: req.get('x-forwarded-for') || req.connection.remoteAddress,
            message: 'Check Korba dashboard - whitelist this IP in API/Website Creds > Whitelisted IPs'
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== MANUAL PAYMENT VERIFICATION (for testing) ====================
app.post('/api/manual-mark-success/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;
        console.log('\n' + '='.repeat(80));
        console.log('🟢 MANUAL PAYMENT SUCCESS - ' + new Date().toISOString());
        console.log('TransactionId:', transactionId);

        const transaction = await PaymentTransaction.findOne({ transactionId });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        transaction.status = 'success';
        transaction.completedAt = new Date();
        await transaction.save();

        // Create Order and Transaction records (same logic as webhook)
        try {
            if (transaction.userId) {
                const user = await User.findById(transaction.userId);
                if (user) {
                    const balanceBefore = user.balance || 0;
                    const resolvedPackageName =
                        transaction.packageName ||
                        transaction.metadata?.packageName ||
                        transaction.metadata?.bundle_size ||
                        transaction.bundle_size || '';

                    const order = new Order({
                        userId: transaction.userId,
                        storeSlug: transaction.storeSlug || null,
                        beneficiary: transaction.phoneNumber,
                        package: transaction.provider,
                        providerName: transaction.provider,
                        packageName: resolvedPackageName,
                        bundleSize: resolvedPackageName,
                        amount: transaction.amount,
                        balanceBefore,
                        balanceAfter: balanceBefore,
                        status: 'Processing',
                        report: `Payment via ${transaction.paymentGateway} - Transaction: ${transactionId}`
                    });
                    await order.save();

                    submitOrderToProvider(order, {
                        phoneNumber: transaction.phoneNumber,
                        packageName: resolvedPackageName,
                        capacity: deriveCapacity(resolvedPackageName),
                        price: transaction.amount,
                        provider: transaction.provider,
                        network: transaction.provider,
                        reference: order._id.toString(),
                        orderId: order._id
                    }).catch(err => console.error('Provider submission failed:', err.message));

                    const txRecord = new Transaction({
                        userId: transaction.userId,
                        storeSlug: transaction.storeSlug || null,
                        beneficiary_phone: transaction.phoneNumber,
                        description: `${transaction.provider} Bundle Purchase - ${transaction.phoneNumber}`,
                        balance_before: balanceBefore,
                        amount: transaction.totalAmount || transaction.amount,
                        method: 'Mobile Money',
                        status: 'complete',
                        orderId: order._id,
                        created: new Date()
                    });
                    await txRecord.save();

                    await recordOrderCommission({
                        userId: transaction.userId,
                        order,
                        paymentTransaction: transaction,
                        transactionRecord: txRecord,
                        gatewayName: transaction.paymentGateway
                    });

                    transaction.orderId = order._id;
                    await transaction.save();
                    console.log('✅ Order and Transaction records created via manual approval', {
                        paymentTransactionId: transaction.transactionId,
                        orderId: order._id.toString(),
                        transactionRecordId: txRecord._id.toString(),
                        paymentPhoneNumber: transaction.phoneNumber
                    });
                }
            }
        } catch (recordErr) {
            console.error('⚠️ Could not create Order/Transaction records:', recordErr.message);
        }

        console.log('✅ Transaction marked as SUCCESS');
        console.log('='.repeat(80) + '\n');

        res.json({ success: true, message: 'Payment marked as successful', transaction });
    } catch (err) {
        console.error('❌ Manual success error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

// ==================== AUTH ROUTES ====================
app.post('/api/signup', async (req, res) => {
    try {
        const { username, fullname, businessName, email, phone, password } = req.body;
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ message: 'User already exists' });
        const user = new User({ username, fullname, businessName, email, phone, password });
        await user.save();
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user._id, username, email, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });
        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username: user.username, email, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== ORDERS ====================
app.get('/api/orders', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        let userId = null;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.id || decoded._id;
            } catch { }
        }

        let query = {};
        if (userId) {
            // Fetch orders belonging to this dealer — either directly (wallet orders)
            // or placed on their storefront (storeSlug orders)
            const storeSettings = await StoreSettings.findOne({ userId }).lean();
            const storeSlug = storeSettings?.storeSlug;
            query = storeSlug
                ? { $or: [{ userId }, { storeSlug }] }
                : { userId };
        } else if (req.query.storeSlug) {
            query = { storeSlug: req.query.storeSlug };
        }

        const orders = await Order.find(query).sort({ created: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const {
            storeSlug,
            clientType,
            providerName,
            packageName,
            phoneNumber,
            price,
            capacity,
            ...rest
        } = req.body;

        const resolvedProviderName = providerName || req.body.provider || req.body.package || rest.provider || rest.package;
        const resolvedPackageName = packageName || req.body.bundle_size || req.body.bundleSize || rest.bundle_size || rest.bundleSize || rest.packageName || '';
        const resolvedPhoneNumber = phoneNumber || req.body.beneficiary || rest.beneficiary;
        const resolvedPrice = price ?? req.body.amount ?? rest.amount;
        const resolvedCapacity = capacity ?? req.body.apiCapacity ?? deriveCapacity(resolvedPackageName);

        // Resolve userId: prefer storeSlug lookup, fall back to auth token
        let userId = null;
        if (storeSlug) {
            const storeSettings = await findStoreSettingsByStoreSlug(storeSlug);
            if (storeSettings) userId = storeSettings.userId;
        }
        if (!userId) {
            const token = req.header('Authorization')?.replace('Bearer ', '');
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    userId = decoded.id || decoded._id;
                } catch (_) { }
            }
        }

        // Create order object
        const order = new Order({
            providerName: resolvedProviderName,
            packageName: resolvedPackageName,
            phoneNumber: resolvedPhoneNumber,
            price: resolvedPrice,
            storeSlug: storeSlug || null,
            clientType,
            userId,
            bundleSize: req.body.bundleSize || resolvedPackageName,
            bundle_size: req.body.bundle_size || resolvedPackageName,
            amount: req.body.amount ?? resolvedPrice,
            beneficiary: req.body.beneficiary || resolvedPhoneNumber,
            package: req.body.package || resolvedProviderName,
            ...rest
        });
        await order.save();

        const providerPayload = {
            phoneNumber: resolvedPhoneNumber,
            packageName: resolvedPackageName,
            capacity: resolvedCapacity,
            price: resolvedPrice,
            provider: resolvedProviderName,
            network: resolvedProviderName,
            reference: order._id.toString(),
            orderId: order._id
        };

        await submitOrderToProvider(order, providerPayload);

        return res.status(201).json({
            ...order.toObject(),
            providerReference: order.providerReference || null,
            message: 'Order created and submitted to provider API'
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== TRANSACTIONS ====================
app.get('/api/transactions', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        let userId = null;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.id || decoded._id;
            } catch { }
        }

        let query = {};
        if (userId) {
            // Fetch transactions for this dealer — direct and storefront-placed
            const storeSettings = await StoreSettings.findOne({ userId }).lean();
            const storeSlug = storeSettings?.storeSlug;
            query = storeSlug
                ? { $or: [{ userId }, { storeSlug }] }
                : { userId };
        } else if (req.query.storeSlug) {
            query = { storeSlug: req.query.storeSlug };
        }

        const orderTransactionFilter = {
            $or: [
                { orderId: { $exists: true, $ne: null } },
                { description: /Bundle Purchase/i }
            ]
        };
        const orderTransactionQuery = Object.keys(query).length
            ? { $and: [query, orderTransactionFilter] }
            : orderTransactionFilter;

        const transactions = await Transaction.find(orderTransactionQuery).sort({ created: -1 });
        console.log('[Transactions] Returning order transaction records', {
            userId: userId || null,
            storeSlug: req.query.storeSlug || null,
            count: transactions.length
        });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { storeSlug, clientType, ...rest } = req.body;

        // Resolve userId: prefer storeSlug lookup, fall back to auth token
        let userId = null;
        if (storeSlug) {
            const storeSettings = await findStoreSettingsByStoreSlug(storeSlug);
            if (storeSettings) userId = storeSettings.userId;
        }
        if (!userId) {
            const token = req.header('Authorization')?.replace('Bearer ', '');
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    userId = decoded.id || decoded._id;
                } catch (_) { }
            }
        }
        // Allow guest transactions — userId may be null
        const transaction = new Transaction({ ...rest, storeSlug: storeSlug || null, clientType, userId });
        await transaction.save();
        res.status(201).json(transaction);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== REFERRAL PRICES ====================
app.get('/api/referral-prices', auth, async (req, res) => {
    try {
        const prices = await ReferralPrice.find({ userId: req.user.id });
        res.json(prices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/referral-prices/bulk', auth, async (req, res) => {
    try {
        const { prices } = req.body;
        await ReferralPrice.deleteMany({ userId: req.user.id });
        const newPrices = prices.map(p => ({ ...p, userId: req.user.id }));
        const inserted = await ReferralPrice.insertMany(newPrices);
        res.json(inserted);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== PUBLIC STOREFRONT PRICES ====================
// Called by storefront-prices.js on bundle pages (mtn.html, telecel.html, etc.)
// No auth required — customers are not logged in.
// GET /api/storefront-prices?store=<slug>&clientType=<type>
app.get('/api/storefront-prices', async (req, res) => {
    try {
        const { store, clientType } = req.query;
        if (!store) return res.status(400).json({ message: 'store param is required' });

        // Find dealer by storeSlug
        const storeSettings = await findStoreSettingsByStoreSlug(store);
        if (!storeSettings) return res.status(404).json({ message: 'Store not found' });

        // Build query — clientType is optional; if absent return all prices for the store
        const query = { userId: storeSettings.userId };
        if (clientType) query.clientType = clientType;

        const prices = await ReferralPrice.find({}).lean();

        console.log(prices);

        // Only return rows where a price was actually set
        res.json(prices.filter(p => p.price > 0));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== PERMITTED CLIENT TYPES ====================
// Returns the list of client types the current user is permitted to show referral links for.
// These are set by the admin via PUT /api/admin/users/:id/permitted-types.
// The referral links page calls this to know which link sections to render.
// Response: { permittedClientTypes: ["Super-Agents", "Agents", "Customers"] }
app.get('/api/my-permitted-client-types', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('permittedClientTypes');
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Look up the store name so the referral link uses it instead of a raw user ID
        const storeSettings = await StoreSettings.findOne({ userId: req.user.id }).select('storeName storeSlug');
        const storeName = storeSettings?.storeName || '';
        const storeSlug = storeSettings?.storeSlug || slugify(storeName) || String(req.user.id);

        res.json({
            permittedClientTypes: user.permittedClientTypes || [],
            storeSlug,          // e.g. "jd-youngster-enterprise"
            storeName           // e.g. "J.D Youngster Enterprise"  (for display purposes)
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/referral-metrics', auth, async (req, res) => {
    try {
        const storeSettings = await StoreSettings.findOne({ userId: req.user.id }).select('storeSlug');
        const storeSlug = storeSettings?.storeSlug;
        if (!storeSlug) return res.status(404).json({ message: 'Store slug not found' });

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const orders = await Order.find({ storeSlug }).select('userId phoneNumber beneficiary created').lean();

        const referralMap = new Map();
        for (const order of orders) {
            const userKey = order.userId ? String(order.userId) : String(order.phoneNumber || order.beneficiary || 'unknown');
            const existing = referralMap.get(userKey) || { lastOrder: null, orderCount: 0, userId: order.userId ? String(order.userId) : null, phoneNumber: order.phoneNumber || order.beneficiary || 'Unknown' };
            existing.orderCount += 1;
            const created = order.created ? new Date(order.created) : null;
            if (created && (!existing.lastOrder || created > existing.lastOrder)) {
                existing.lastOrder = created;
            }
            referralMap.set(userKey, existing);
        }

        const active = [];
        const inactive = [];

        referralMap.forEach((item, key) => {
            if (item.lastOrder && item.lastOrder >= thirtyDaysAgo) {
                active.push({ key, ...item });
            } else {
                inactive.push({ key, ...item });
            }
        });

        const userIds = Array.from(new Set(active.concat(inactive).map(item => item.userId).filter(Boolean)));
        const users = await User.find({ _id: { $in: userIds } })
            .select('username businessName email storeSlug')
            .lean();
        const userMap = new Map(users.map(u => [String(u._id), u]));

        const formatReferral = item => {
            const user = item.userId ? userMap.get(item.userId) : null;
            return {
                id: item.key,
                label: user?.businessName || user?.username || user?.email || item.phoneNumber || 'Unknown referral',
                lastOrder: item.lastOrder,
                orderCount: item.orderCount,
                storeSlug: user?.storeSlug || null
            };
        };

        const activeReferrals = active.map(formatReferral).sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0)).slice(0, 10);
        const inactiveReferrals = inactive.map(formatReferral).sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0)).slice(0, 10);

        res.json({
            totalReferrals: referralMap.size,
            activeReferrals: active.length,
            inactiveReferrals: inactive.length,
            activeReferralsList: activeReferrals,
            inactiveReferralsList: inactiveReferrals
        });
    } catch (err) {
        console.error('[ReferralMetrics] Error', err);
        res.status(500).json({ message: err.message });
    }
});

// ==================== ROLE-BASED ORIGINAL PRICES ====================
// Returns the correct "Original Price" for the calling user based on their role.
// The admin configures which BasePrice clientType column maps to each role
// via the /api/admin/role-price-mapping endpoints below.
// Response: [{ provider, packageName, originalPrice }]
app.get('/api/my-original-prices', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('role');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const userRole = user.role;

        // Find which BasePrice clientType column this role maps to
        const mapping = await RolePriceMapping.findOne({ role: userRole });

        if (!mapping) {
            // No mapping set — fall back to MasterPrice originalPrice if available,
            // otherwise return empty so the UI can show a sensible fallback.
            const masterPrices = await MasterPrice.find().sort({ provider: 1, packageName: 1 });
            const result = masterPrices.map(mp => ({
                provider: mp.provider,
                packageName: mp.packageName,
                originalPrice: mp.originalPrice
            }));
            return res.json(result);
        }

        const clientTypeColumn = mapping.basePriceClientType;

        // Pull all BasePrice rows for that column
        const basePrices = await BasePrice.find({ clientType: clientTypeColumn })
            .sort({ provider: 1, packageName: 1 });

        const result = basePrices.map(bp => ({
            provider: bp.provider,
            packageName: bp.packageName,
            originalPrice: bp.price
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== BASE PRICES ====================
app.get('/api/base-prices', auth, async (req, res) => {
    try {
        const prices = await BasePrice.find().sort({ provider: 1, packageName: 1, clientType: 1 });
        res.json(prices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/admin/base-prices/bulk', auth, admin, async (req, res) => {
    try {
        const { prices } = req.body;
        await BasePrice.deleteMany({});
        await BasePrice.insertMany(prices);
        res.json({ message: 'Base prices saved successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== DASHBOARD STATIC FILES ====================
const DASHBOARD_DIR = 'C:\\Users\\juded\\Downloads\\My Store\\Dashboard';
const ADMIN_DIR = 'C:\\Users\\juded\\Downloads\\My Store\\Admin';
app.use('/Dashboard', express.static(DASHBOARD_DIR, { index: false, redirect: false }));
app.use('/Admin', express.static(ADMIN_DIR, { index: false, redirect: false }));

app.get('/referral/:slug', (req, res) => {
    const fs = require('fs');
    const filePath = path.resolve(DASHBOARD_DIR, 'dashboard2.html');
    console.log('Serving:', filePath, '| Exists:', fs.existsSync(filePath));
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found: ' + filePath);
    }
    res.sendFile(filePath, function (err) {
        if (err) { console.error('sendFile error:', err.message); res.status(500).send(err.message); }
    });
});

// Redirect old ?store= URLs to clean /referral/ URLs
app.get('/Dashboard/dashboard2', (req, res) => {
    const store = req.query.store;
    if (store) res.redirect(302, '/referral/' + encodeURIComponent(store));
    else res.sendFile('dashboard2.html', { root: DASHBOARD_DIR });
});

// ==================== PUBLIC STOREFRONT ROUTE ====================
// Called by the referral landing page to load a dealer's store branding.
// No auth required — this is a public endpoint visited by the dealer's customers.
// GET /api/storefront/:slug  →  { storeName, storeDescription, storeLogo, whatsappGroupLink, whatsappNumber }
app.get('/api/storefront/:slug', async (req, res) => {
    try {
        // Set headers to force the browser to get fresh data from the database every single time
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { slug } = req.params;
        const store = await StoreSettings.findOne({
            $or: [{ storeSlug: slug }, { previousSlugs: slug }]
        });

        if (!store) {
            return res.status(404).json({ message: 'Store not found' });
        }
        res.json(store);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


app.get('/api/sync-my-slug', auth, async (req, res) => {
    try {
        const settings = await StoreSettings.findOne({ userId: req.user.id });
        if (!settings) return res.status(404).json({ message: 'Store not found' });
        settings.storeSlug = slugify(settings.storeName);
        await settings.save();
        res.json({ message: 'Slug synced', storeSlug: settings.storeSlug });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});



app.get('/api/store-settings', auth, async (req, res) => {
    try {
        let settings = await StoreSettings.findOne({ userId: req.user.id });
        if (!settings) {
            const user = await User.findById(req.user.id);
            settings = new StoreSettings({
                userId: req.user.id,
                storeName: user.businessName || 'Youngster Data Shop',
                storeDescription: user.storeDescription || 'Your trusted partner for data services',
                storeLogo: user.storeLogo || '',
                whatsappGroupLink: user.whatsappGroupLink || '',
                whatsappNumber: user.whatsappNumber || ''
            });
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/store-settings', auth, async (req, res) => {
    try {
        const { storeName, storeDescription, storeLogo, whatsappGroupLink, whatsappNumber } = req.body;
        let settings = await StoreSettings.findOne({ userId: req.user.id });
        if (!settings) settings = new StoreSettings({ userId: req.user.id });
        if (storeName !== undefined) {
            const newSlug = slugify(storeName);
            if (settings.storeSlug && settings.storeSlug !== newSlug) {
                if (!settings.previousSlugs) settings.previousSlugs = [];
                if (!settings.previousSlugs.includes(settings.storeSlug)) {
                    settings.previousSlugs.push(settings.storeSlug);
                }
            }
            settings.storeName = storeName;
            settings.storeSlug = newSlug;
        }
        if (storeDescription !== undefined) settings.storeDescription = storeDescription;
        if (storeLogo !== undefined) settings.storeLogo = storeLogo;
        if (whatsappGroupLink !== undefined) settings.whatsappGroupLink = whatsappGroupLink;
        if (whatsappNumber !== undefined) settings.whatsappNumber = whatsappNumber;
        settings.updatedAt = Date.now();
        await settings.save();
        await User.findByIdAndUpdate(req.user.id, { storeDescription, whatsappGroupLink, whatsappNumber, storeLogo });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== BALANCE & WITHDRAWALS ====================
app.get('/api/balance', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const pendingWithdrawals = await Withdrawal.find({ userId: req.user.id, status: 'pending' });
        const pendingAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
        res.json({
            availableBalance: user.availableBalance || 0,
            pendingWithdrawals: pendingAmount,
            totalEarned: user.totalEarned || 0
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/withdrawals', auth, async (req, res) => {
    try {
        const { amount, provider, phoneNumber, accountName } = req.body;
        const user = await User.findById(req.user.id);
        if (amount < 50) return res.status(400).json({ message: 'Minimum withdrawal is GHS 50' });
        if (amount > 5000) return res.status(400).json({ message: 'Maximum withdrawal is GHS 5,000' });
        if (amount > (user.availableBalance || 0)) return res.status(400).json({ message: 'Insufficient balance' });
        const existing = await Withdrawal.findOne({ userId: req.user.id, status: 'pending' });
        if (existing) return res.status(400).json({ message: 'You already have a pending withdrawal request' });
        const withdrawal = new Withdrawal({ userId: req.user.id, amount, provider, phoneNumber, accountName });
        await withdrawal.save();
        res.status(201).json({ message: 'Withdrawal request submitted successfully', withdrawalId: withdrawal._id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/withdrawals', auth, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/users', auth, admin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/users/:id', auth, admin, async (req, res) => {
    try {
        const { role, availableBalance, storeName } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id,
            { role, availableBalance, storeName },
            { new: true }
        ).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/admin/users/:id', auth, admin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Test order creation endpoint — admin only, for testing bundle display
app.post('/api/admin/test-order', auth, admin, async (req, res) => {
    try {
        const { phoneNumber, provider, bundle_size, bundle, amount, status } = req.body;
        const bundleVal = bundle_size || bundle;
        if (!phoneNumber || !provider || !bundleVal) {
            return res.status(400).json({ message: 'phoneNumber, provider and bundle_size are required' });
        }
        const order = new Order({
            userId: req.user.id,
            beneficiary: phoneNumber,
            package: provider,
            bundle_size: bundleVal,
            amount: parseFloat(amount) || 5.00,
            status: status || 'processing',
            storeSlug: null,
            clientType: 'Test',
            created: new Date()
        });
        await order.save();
        res.status(201).json({ success: true, order });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/orders', auth, admin, async (req, res) => {
    try {
        const orders = await Order.find().populate('userId', 'username email').sort({ created: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/orders/:id', auth, admin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('userId', 'username email');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/orders/:id', auth, admin, async (req, res) => {
    try {
        const { status, report } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id,
            { status, report, completed: status === 'completed' ? new Date() : undefined },
            { new: true }
        );
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/transactions', auth, admin, async (req, res) => {
    try {
        const transactions = await Transaction.find().populate('userId', 'username email').sort({ created: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/transactions/:id', auth, admin, async (req, res) => {
    try {
        const txn = await Transaction.findById(req.params.id).populate('userId', 'username email');
        if (!txn) return res.status(404).json({ message: 'Transaction not found' });
        res.json(txn);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/transactions/:id', auth, admin, async (req, res) => {
    try {
        const { status, description, amount } = req.body;
        const updates = {};
        if (status !== undefined) updates.status = status;
        if (description !== undefined) updates.description = description;
        if (amount !== undefined) updates.amount = amount;
        const transaction = await Transaction.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json(transaction);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/referral-prices', auth, admin, async (req, res) => {
    try {
        const prices = await ReferralPrice.find().populate('userId', 'username businessName');
        res.json(prices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/referral-prices/:id', auth, admin, async (req, res) => {
    try {
        const { price } = req.body;
        const updated = await ReferralPrice.findByIdAndUpdate(req.params.id, { price }, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/withdrawals', auth, admin, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find().populate('userId', 'username email businessName').sort({ createdAt: -1 });
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/withdrawals/:id', auth, admin, async (req, res) => {
    try {
        const { status, adminNotes } = req.body;
        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal) return res.status(404).json({ message: 'Not found' });

        const previousStatus = withdrawal.status;
        withdrawal.status = status;
        withdrawal.adminNotes = adminNotes;
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        // Deduct balance when approved (money earmarked for payout)
        if (previousStatus !== 'approved' && status === 'approved') {
            await User.findByIdAndUpdate(withdrawal.userId, { $inc: { availableBalance: -withdrawal.amount } });
        }
        // Refund ONLY if rejected after approval (payout cancelled) — NOT on completed
        if (previousStatus === 'approved' && status === 'rejected') {
            await User.findByIdAndUpdate(withdrawal.userId, { $inc: { availableBalance: withdrawal.amount } });
        }
        // Mark Commission records as withdrawn when payout is completed
        if (status === 'completed' && previousStatus !== 'completed') {
            await Commission.updateMany(
                { userId: withdrawal.userId, status: 'available' },
                { $set: { status: 'withdrawn', withdrawnAt: new Date() } }
            );
        }

        res.json(withdrawal);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/store-settings', auth, admin, async (req, res) => {
    try {
        const settings = await StoreSettings.find().populate('userId', 'username businessName');
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/store-settings/:id', auth, admin, async (req, res) => {
    try {
        const { storeName, storeDescription, whatsappNumber, whatsappGroupLink } = req.body;
        const settings = await StoreSettings.findByIdAndUpdate(req.params.id,
            { storeName, storeDescription, whatsappNumber, whatsappGroupLink },
            { new: true }
        );
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get administrative overview performance metrics and recent transaction flows
// Full gateway transactions list for audit trail tab
app.get('/api/admin/gateway-transactions', auth, admin, async (req, res) => {
    try {
        const logs = await PaymentTransaction.find()
            .sort({ initiatedAt: -1 })
            .limit(100)
            .select('transactionId amount totalAmount provider phoneNumber status initiatedAt metadata description');
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/stats', auth, admin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalOrders = await Order.countDocuments();

        // Completed fulfillment volume, plus paid transaction revenue.
        const volumeAggr = await Order.aggregate([
            { $match: { status: { $regex: /^completed$/i } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalVolume = volumeAggr.length > 0 ? volumeAggr[0].total : 0;
        const revenueAggr = await Transaction.aggregate([
            { $match: { status: { $in: ['complete', 'completed', 'success'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = revenueAggr.length > 0 ? revenueAggr[0].total : 0;
        const commissionAggr = await Commission.aggregate([
            { $match: { status: { $in: ['available', 'withdrawn'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalCommission = commissionAggr.length > 0 ? commissionAggr[0].total : 0;
        const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });

        // Pull the last 5 transaction records along with their metadata structures intact
        const recentGatewayTransactions = await PaymentTransaction.find()
            .sort({ initiatedAt: -1 })
            .limit(5)
            .select('transactionId amount totalAmount provider phoneNumber status initiatedAt metadata description');

        res.json({
            totalUsers,
            totalOrders,
            totalVolume,
            totalRevenue,
            totalCommission,
            pendingWithdrawals,
            recentGatewayTransactions
        });
    } catch (err) {
        console.error('❌ [ADMIN STATS ERROR]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ==================== CLIENT TYPES ====================
app.get('/api/client-types', auth, async (req, res) => {
    const types = await ClientType.find().sort({ name: 1 });
    res.json(types.map(t => t.name));
});

app.post('/api/admin/client-types', auth, admin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });
    const existing = await ClientType.findOne({ name });
    if (existing) return res.status(400).json({ message: 'Already exists' });
    await ClientType.create({ name });
    res.json({ message: 'Client type added', name });
});

app.put('/api/admin/client-types/:oldName', auth, admin, async (req, res) => {
    try {
        const { oldName } = req.params;
        const { newName } = req.body;
        if (!newName) return res.status(400).json({ message: 'New name required' });

        await ClientType.updateOne({ name: oldName }, { $set: { name: newName } });
        const priceResult = await BasePrice.updateMany(
            { clientType: oldName },
            { $set: { clientType: newName } }
        );
        const userResult = await User.updateMany(
            { permittedClientTypes: oldName },
            { $set: { "permittedClientTypes.$": newName } }
        );
        // Also update any role-price mappings that referenced this clientType
        await RolePriceMapping.updateMany(
            { basePriceClientType: oldName },
            { $set: { basePriceClientType: newName } }
        );
        res.json({ message: `Updated ${priceResult.modifiedCount} price records and ${userResult.modifiedCount} user permissions`, newName });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/admin/client-types/:name', auth, admin, async (req, res) => {
    try {
        const { name } = req.params;
        const deleteResult = await BasePrice.deleteMany({ clientType: name });
        const userResult = await User.updateMany(
            { permittedClientTypes: name },
            { $pull: { permittedClientTypes: name } }
        );
        await ClientType.deleteOne({ name });
        // Remove any role-price mappings that pointed to this column
        await RolePriceMapping.deleteMany({ basePriceClientType: name });
        res.json({ message: `Deleted ${deleteResult.deletedCount} price records and removed from ${userResult.modifiedCount} user permissions` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== ROLE PRICE MAPPING ====================
// GET all current mappings: which BasePrice column each role reads as "Original Price"
app.get('/api/admin/role-price-mapping', auth, admin, async (req, res) => {
    try {
        const mappings = await RolePriceMapping.find().sort({ role: 1 });
        res.json(mappings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT (upsert) a mapping for a specific role
// Body: { role: "Dealers", basePriceClientType: "Dealers" }
app.put('/api/admin/role-price-mapping', auth, admin, async (req, res) => {
    try {
        const { role, basePriceClientType } = req.body;
        if (!role || !basePriceClientType) {
            return res.status(400).json({ message: 'role and basePriceClientType are required' });
        }
        const mapping = await RolePriceMapping.findOneAndUpdate(
            { role },
            { role, basePriceClientType, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json(mapping);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE a mapping (role will fall back to MasterPrice)
app.delete('/api/admin/role-price-mapping/:role', auth, admin, async (req, res) => {
    try {
        await RolePriceMapping.deleteOne({ role: req.params.role });
        res.json({ message: 'Mapping removed' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== PROVIDERS ====================
app.get('/api/providers', auth, async (req, res) => {
    try {
        let providers = await Provider.find().sort({ order: 1 });
        if (providers.length === 0) {
            const distinct = await BasePrice.distinct('provider');
            for (let name of distinct) {
                const existing = await Provider.findOne({ name });
                if (!existing) await Provider.create({ name });
            }
            providers = await Provider.find().sort({ order: 1 });
        }
        res.json(providers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/admin/providers', auth, admin, async (req, res) => {
    try {
        const { name, logoUrl, order } = req.body;
        let provider = await Provider.findOne({ name });
        if (provider) {
            if (logoUrl !== undefined) provider.logoUrl = logoUrl;
            if (order !== undefined) provider.order = order;
            provider.updatedAt = new Date();
            await provider.save();
        } else {
            provider = new Provider({ name, logoUrl, order });
            await provider.save();
        }
        res.json(provider);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/admin/providers/:name', auth, admin, async (req, res) => {
    try {
        const { name } = req.params;
        await Provider.deleteOne({ name });
        await BasePrice.deleteMany({ provider: name });
        res.json({ message: 'Provider deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== PROVIDER API CONFIGURATION ====================
// Get provider API configuration
app.get('/api/admin/provider-api-config/:providerName', auth, admin, async (req, res) => {
    try {
        const provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });
        res.json({
            providerName: provider.name,
            apiConfig: provider.apiConfig || {},
            orderRouting: provider.orderRouting || {},
            packageMapping: provider.packageMapping || []
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update provider API configuration
app.put('/api/admin/provider-api-config/:providerName', auth, admin, async (req, res) => {
    try {
        const { apiConfig, orderRouting, packageMapping } = req.body;
        let provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });

        if (apiConfig) {
            provider.apiConfig = { ...provider.apiConfig, ...apiConfig };
        }
        if (orderRouting) {
            const toNullableNumber = value => {
                if (value === undefined || value === null || value === '') return null;
                const numberValue = Number(value);
                return Number.isFinite(numberValue) ? numberValue : null;
            };

            provider.set('orderRouting', {
                ...(provider.orderRouting || {}),
                handler: orderRouting.handler || '',
                whatsappMinGb: toNullableNumber(orderRouting.whatsappMinGb),
                whatsappMaxGb: toNullableNumber(orderRouting.whatsappMaxGb),
                apiMinGb: toNullableNumber(orderRouting.apiMinGb),
                apiMaxGb: toNullableNumber(orderRouting.apiMaxGb)
            });
            provider.markModified('orderRouting');
        }
        if (packageMapping) {
            provider.packageMapping = packageMapping;
        }

        provider.updatedAt = new Date();
        await provider.save();

        res.json({
            message: 'Provider API configuration updated',
            provider: {
                name: provider.name,
                apiConfig: provider.apiConfig,
                orderRouting: provider.orderRouting,
                packageMapping: provider.packageMapping
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Process order through universal API handler
app.post('/api/admin/process-order', auth, admin, async (req, res) => {
    try {
        const { providerName, phoneNumber, packageName, price, network, reference } = req.body;

        if (!providerName || !phoneNumber || !packageName) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const orderData = {
            phoneNumber,
            packageName,
            price,
            network: network || providerName,
            provider: providerName,
            reference: reference || `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        const result = await UniversalAPIHandler.processOrder(providerName, orderData);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Check order status from external API
app.get('/api/admin/check-order-status/:providerName/:reference', auth, async (req, res) => {
    try {
        const result = await UniversalAPIHandler.checkOrderStatus(req.params.providerName, req.params.reference);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get provider balance from external API
app.get('/api/admin/provider-balance/:providerName', auth, admin, async (req, res) => {
    try {
        const result = await UniversalAPIHandler.getBalance(req.params.providerName);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get API interaction logs
app.get('/api/admin/provider-api-logs/:providerName', auth, admin, async (req, res) => {
    try {
        const provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });

        const logs = await ProviderAPILog.find({ providerId: provider._id })
            .sort({ requestTime: -1 })
            .limit(50);

        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== SINGLE ENTITY GETTERS ====================
app.get('/api/admin/users/:id', auth, admin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/store-settings/:id', auth, admin, async (req, res) => {
    try {
        const setting = await StoreSettings.findById(req.params.id).populate('userId', 'username');
        if (!setting) return res.status(404).json({ message: 'Store setting not found' });
        res.json(setting);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/users/:id/permitted-types', auth, admin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ permittedClientTypes: user.permittedClientTypes || [] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/users/:id/permitted-types', auth, admin, async (req, res) => {
    try {
        const { permittedClientTypes } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { permittedClientTypes },
            { new: true }
        );
        res.json({ permittedClientTypes: user.permittedClientTypes });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== PACKAGES ====================
app.get('/api/packages', auth, async (req, res) => {
    try {
        const { provider } = req.query;
        const filter = provider ? { provider } : {};
        const packages = await BasePrice.distinct('packageName', filter);
        res.json(packages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== MASTER PRICES ====================
app.get('/api/master-prices', auth, async (req, res) => {
    try {
        const { clientType } = req.query;
        const filter = clientType ? { clientType } : {};
        const prices = await MasterPrice.find(filter).sort({ provider: 1, packageName: 1, clientType: 1 });
        res.json(prices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/admin/master-prices', auth, admin, async (req, res) => {
    try {
        const { provider, packageName, clientType, originalPrice } = req.body;
        if (!provider || !packageName || !clientType || originalPrice === undefined) {
            return res.status(400).json({ message: 'All fields required' });
        }
        let price = await MasterPrice.findOne({ provider, packageName, clientType });
        if (price) {
            price.originalPrice = originalPrice;
            price.updatedAt = new Date();
            await price.save();
        } else {
            price = new MasterPrice({ provider, packageName, clientType, originalPrice });
            await price.save();
        }
        res.json(price);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/admin/master-prices/:id', auth, admin, async (req, res) => {
    try {
        await MasterPrice.findByIdAndDelete(req.params.id);
        res.json({ message: 'Master price deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== PAYMENT GATEWAY ENDPOINTS ====================

// Get all payment gateways
// Public endpoint — returns only enabled gateways with non-sensitive fields (for checkout page)
app.get('/api/payment-gateways', async (req, res) => {
    try {
        const gateways = await PaymentGateway.find({ enabled: true })
            .select('name type paymentMethods transactionFee transactionFeePercent minAmount maxAmount networkMapping isTestMode')
            .sort({ createdAt: -1 });
        res.json(gateways);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/payment-gateways', auth, admin, async (req, res) => {
    try {
        const gateways = await PaymentGateway.find().sort({ createdAt: -1 });
        res.json(gateways);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create a new payment gateway
app.post('/api/admin/payment-gateways', auth, admin, async (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name) return res.status(400).json({ message: 'Gateway name is required' });
        const existing = await PaymentGateway.findOne({ name });
        if (existing) return res.status(400).json({ message: `Gateway "${name}" already exists` });
        const gateway = new PaymentGateway({ name, type: type || 'collections' });
        await gateway.save();
        res.status(201).json(gateway);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete a payment gateway
app.delete('/api/admin/payment-gateways/:gatewayName', auth, admin, async (req, res) => {
    try {
        const result = await PaymentGateway.findOneAndDelete({ name: req.params.gatewayName });
        if (!result) return res.status(404).json({ message: 'Gateway not found' });
        res.json({ message: `Gateway "${req.params.gatewayName}" deleted` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rename a payment gateway
app.put('/api/admin/payment-gateways/:gatewayName/rename', auth, admin, async (req, res) => {
    try {
        const { newName } = req.body;
        if (!newName) return res.status(400).json({ message: 'New gateway name is required' });

        const existing = await PaymentGateway.findOne({ name: newName });
        if (existing) return res.status(400).json({ message: `Gateway "${newName}" already exists` });

        const gateway = await PaymentGateway.findOneAndUpdate(
            { name: req.params.gatewayName },
            { name: newName.trim(), updatedAt: new Date() },
            { new: true }
        );

        if (!gateway) return res.status(404).json({ message: 'Gateway not found' });
        res.json({ message: 'Gateway renamed successfully', gateway });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get payment gateway configuration
app.get('/api/admin/payment-gateway-config/:gatewayName', auth, admin, async (req, res) => {
    try {
        const gateway = await PaymentGateway.findOne({ name: req.params.gatewayName });
        if (!gateway) return res.status(404).json({ message: 'Payment gateway not found' });

        // Don't send secret keys to client
        const config = gateway.toObject();
        delete config.secretKey;
        delete config.testSecretKey;

        res.json(config);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update payment gateway configuration
app.put('/api/admin/payment-gateway-config/:gatewayName', auth, admin, async (req, res) => {
    try {
        const {
            type, enabled, apiBaseUrl, clientKey, secretKey,
            collectEndpoint, checkoutEndpoint, statusEndpoint,
            callbackUrl, redirectUrl, paymentMethods, transactionFee,
            transactionFeePercent, minAmount, maxAmount, networkMapping,
            isTestMode, testClientKey, testSecretKey, authMethod, additionalHeaders,
            // Moolre-specific fields
            apiUser, pubKey, vasKey, apiKey, accountNumber, posLink
        } = req.body;

        let gateway = await PaymentGateway.findOne({ name: req.params.gatewayName });

        if (!gateway) {
            gateway = new PaymentGateway({ name: req.params.gatewayName });
        }

        // Update configuration
        if (type) gateway.type = type;
        if (enabled !== undefined) gateway.enabled = enabled;
        if (apiBaseUrl) gateway.apiBaseUrl = apiBaseUrl;
        if (clientKey) gateway.clientKey = clientKey;
        if (secretKey) gateway.secretKey = secretKey;
        if (collectEndpoint) gateway.collectEndpoint = collectEndpoint;
        if (checkoutEndpoint) gateway.checkoutEndpoint = checkoutEndpoint;
        if (statusEndpoint) gateway.statusEndpoint = statusEndpoint;
        if (callbackUrl) gateway.callbackUrl = callbackUrl;
        if (redirectUrl) gateway.redirectUrl = redirectUrl;
        if (paymentMethods) gateway.paymentMethods = paymentMethods;
        if (transactionFee !== undefined) gateway.transactionFee = transactionFee;
        if (transactionFeePercent !== undefined) gateway.transactionFeePercent = transactionFeePercent;
        if (minAmount) gateway.minAmount = minAmount;
        if (maxAmount) gateway.maxAmount = maxAmount;
        if (networkMapping) gateway.networkMapping = networkMapping;
        if (isTestMode !== undefined) gateway.isTestMode = isTestMode;
        if (testClientKey) gateway.testClientKey = testClientKey;
        if (testSecretKey) gateway.testSecretKey = testSecretKey;
        if (authMethod) gateway.authMethod = authMethod;
        if (additionalHeaders) gateway.additionalHeaders = additionalHeaders;
        // Moolre-specific credential fields
        if (apiUser) gateway.apiUser = apiUser;
        if (pubKey) gateway.pubKey = pubKey;
        if (vasKey) gateway.vasKey = vasKey;
        if (apiKey) gateway.apiKey = apiKey;
        if (accountNumber) gateway.accountNumber = accountNumber;
        if (posLink) gateway.posLink = posLink;

        gateway.updatedAt = new Date();
        await gateway.save();

        // Send back config without secrets
        const responseConfig = gateway.toObject();
        delete responseConfig.secretKey;
        delete responseConfig.testSecretKey;

        res.json({
            message: 'Payment gateway configuration updated',
            gateway: responseConfig
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Initiate a payment
app.post('/api/payment/initiate', async (req, res) => {
    try {
        const {
            gatewayName,
            phoneNumber,
            amount,
            provider,
            orderProvider,
            productProvider,
            paymentNetwork,
            paymentProvider,
            description,
            packageName,
            bundle_size,
            storeSlug,
            clientType,
            beneficiary,
            recipientPhoneNumber
        } = req.body;

        const resolvedPaymentNetwork = paymentNetwork || paymentProvider || provider;
        const resolvedOrderProvider = orderProvider || productProvider || req.body.providerName || req.body.package || provider;
        const resolvedBeneficiary = beneficiary || recipientPhoneNumber || '';

        if (!gatewayName || !phoneNumber || !amount || !resolvedPaymentNetwork || !resolvedOrderProvider) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        console.log('[PaymentRoute] Initiating payment', {
            gatewayName,
            paymentPhoneNumber: phoneNumber,
            paymentNetwork: resolvedPaymentNetwork,
            orderProvider: resolvedOrderProvider,
            beneficiary: resolvedBeneficiary,
            amount,
            storeSlug: storeSlug || null,
            clientType: clientType || null
        });

        const userId = await resolvePaymentUserId({
            userId: req.user?.id || req.body.userId || null,
            storeSlug,
            metadata: { storeSlug }
        });
        const resolvedPackageName = bundle_size || packageName || '';
        const result = await PaymentService.initiatePayment(gatewayName, {
            phoneNumber,
            amount,
            provider: resolvedOrderProvider,
            orderProvider: resolvedOrderProvider,
            paymentNetwork: resolvedPaymentNetwork,
            description,
            packageName: resolvedPackageName,
            bundle_size: resolvedPackageName,
            userId,
            storeSlug,
            clientType,
            beneficiary: resolvedBeneficiary,
            metadata: {
                userId,
                packageName: resolvedPackageName,
                bundle_size: resolvedPackageName,
                storeSlug,
                clientType,
                paymentNetwork: resolvedPaymentNetwork,
                orderProvider: resolvedOrderProvider,
                beneficiary: resolvedBeneficiary
            }
        });

        console.log('[PaymentRoute] Payment initiation result', {
            success: Boolean(result?.success),
            transactionId: result?.transactionId || null,
            requiresOtp: Boolean(result?.requiresOtp),
            message: result?.message || null
        });

        res.json(result);
    } catch (err) {
        console.error('[PaymentRoute] Payment initiation failed', err.message);
        res.status(500).json({ message: err.message });
    }
});
// Verify a beneficiary (recipient) phone number with DataHub before allowing purchase
// Keeps the DataHub API key server-side — never exposed to the browser.
app.post('/api/payment/verify-beneficiary', async (req, res) => {
    try {
        const { phone, is_ported_number, isPortedNumber } = req.body;
        const resolvedIsPorted = (is_ported_number !== undefined) ? is_ported_number
            : (isPortedNumber !== undefined ? isPortedNumber : true);

        if (!phone) {
            return res.status(400).json({ success: false, message: 'phone is required' });
        }

        const provider = await Provider.findOne({
            name: { $in: ['DataHub', 'MTN', 'datahub'] }
        });

        // The key lives in the Provider API Config screen's "Auth Header Value" field,
        // stored on provider.apiConfig.authHeaderValue. Check a few likely field names
        // for resilience, then fall back to an env var.
        const apiKey = provider?.apiConfig?.authHeaderValue
            || provider?.apiConfig?.apiKey
            || provider?.apiConfig?.token
            || provider?.apiKey
            || process.env.DATAHUB_API_KEY;

        if (!apiKey) {
            console.error('[VerifyBeneficiary] No DataHub API key found on Provider.apiConfig.authHeaderValue or DATAHUB_API_KEY');
            return res.status(500).json({ success: false, message: 'Verification service is not configured' });
        }

        console.log('[VerifyBeneficiary] Using key from:', provider?.apiConfig?.authHeaderValue ? `Provider(${provider.name}).apiConfig.authHeaderValue` : 'DATAHUB_API_KEY env var',
            '| key preview:', `${String(apiKey).slice(0, 4)}...${String(apiKey).slice(-2)}`);

        const authHeaderName = provider?.apiConfig?.authHeaderName || 'X-API-Key';

        const dataHubResponse = await fetch('https://user.datahubgh.com/api/external/purchases/verify-number', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [authHeaderName]: apiKey
            },
            body: JSON.stringify({
                phone,
                is_ported_number: resolvedIsPorted
            })
        });

        const result = await dataHubResponse.json();

        if (!dataHubResponse.ok) {
            console.log('[VerifyBeneficiary] Verification failed:', result?.message || result?.error);
            return res.status(dataHubResponse.status).json({
                success: false,
                message: result?.message || result?.error || 'Number could not be verified'
            });
        }

        console.log('[VerifyBeneficiary] Phone number verified successfully:', phone);
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('[VerifyBeneficiary] Verification request failed:', err.message);
        res.status(500).json({ success: false, message: 'Verification service unavailable, please try again' });
    }
});

// Verify OTP for Moolre payment (called when Moolre returns TP14 on initiation)
app.post('/api/payment/verify-otp', async (req, res) => {
    try {
        const { transactionId, otpCode } = req.body;
        if (!transactionId || !otpCode) {
            return res.status(400).json({ success: false, message: 'transactionId and otpCode are required' });
        }
        const result = await PaymentService.verifyOtp(transactionId, String(otpCode).trim());
        res.json(result);
    } catch (err) {
        console.error('❌ OTP verification error:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

// Check payment status
app.get('/api/payment/status/:transactionId', async (req, res) => {
    try {
        const txId = req.params.transactionId;
        console.log('\n' + '='.repeat(80));
        console.log('🔴 PAYMENT STATUS CHECK - ' + new Date().toISOString());
        console.log('TransactionId:', txId);

        const result = await PaymentService.checkPaymentStatus(txId);
        if (result.success && result.status === 'success' && result.transaction) {
            await createPaidOrderRecords(result.transaction, result.transaction.paymentGateway);
        }

        console.log('📍 Result from checkPaymentStatus:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');

        res.json(result);
    } catch (err) {
        console.error('❌ Status endpoint error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

// Shared webhook handler logic for both GET and POST
const handleWebhookCallback = async (req, res) => {
    try {
        // Log incoming webhook
        const method = req.method;
        console.log('\n' + '='.repeat(80));
        console.log(`🔔 WEBHOOK RECEIVED [${method}] - ` + new Date().toISOString());
        console.log('Gateway:', req.params.gatewayName);
        console.log('Query params:', JSON.stringify(req.query, null, 2));
        console.log('Body:', JSON.stringify(req.body, null, 2));
        console.log('Headers:', JSON.stringify(req.headers, null, 2));
        console.log('='.repeat(80) + '\n');

        // Extract callback data from request (supports both GET and POST)
        const callbackData = {
            transaction_id: req.query.transaction_id || req.body.transaction_id || req.query.externalref || req.body.externalref,
            externalref: req.query.externalref || req.body.externalref || req.query.transaction_id || req.body.transaction_id,
            transactionid: req.query.transactionid || req.body.transactionid || req.query.korba_trans_id || req.body.korba_trans_id,
            txstatus: req.query.txstatus || req.body.txstatus,
            status: req.query.status || req.body.status,
            message: req.query.message || req.body.message,
            korba_trans_id: req.query.korba_trans_id || req.body.korba_trans_id
        };

        console.log('Extracted callback data:', JSON.stringify(callbackData, null, 2));

        // Update payment transaction status
        const paymentResult = await PaymentService.handlePaymentCallback(callbackData);

        // Helper to get the best package name from a PaymentTransaction record
        const resolvePackageName = (pt) =>
            pt.packageName ||
            pt.metadata?.packageName ||
            pt.metadata?.bundle_size ||
            pt.bundle_size || '';
        const isSuccess = ['SUCCESS', 'Success', 'success'].includes(callbackData.status) || Number(callbackData.txstatus) === 1;
        const isFailed = ['FAILED', 'Failed', 'failed', 'FAILURE', 'failure'].includes(callbackData.status) || Number(callbackData.txstatus) === 2;

        if ((isSuccess && paymentResult.success) || isFailed) {
            try {
                const paymentTransaction = await PaymentTransaction.findOne({
                    $or: [
                        { transactionId: callbackData.transaction_id },
                        { transactionId: callbackData.externalref },
                        { transactionId: callbackData.transactionid }
                    ].filter(Boolean)
                });

                if (paymentTransaction && paymentTransaction.userId) {
                    const user = await User.findById(paymentTransaction.userId);
                    if (user) {
                        const balanceBefore = user.balance || 0;
                        const resolvedPackageName = resolvePackageName(paymentTransaction);
                        const resolvedBeneficiary = paymentTransaction.metadata?.beneficiary || paymentTransaction.phoneNumber;

                        if (isSuccess && paymentResult.success) {
                            if (paymentTransaction.orderId) {
                                console.log(`Payment ${callbackData.transaction_id} already has order ${paymentTransaction.orderId}`);
                                return res.json({ success: true, message: 'Callback received' });
                            }
                            // Create Order record
                            const order = new Order({
                                userId: paymentTransaction.userId,
                                storeSlug: paymentTransaction.storeSlug || null,
                                beneficiary: resolvedBeneficiary,
                                phoneNumber: resolvedBeneficiary,
                                package: paymentTransaction.provider,
                                providerName: paymentTransaction.provider,
                                packageName: resolvedPackageName,
                                bundleSize: resolvedPackageName,
                                amount: paymentTransaction.amount,
                                balanceBefore,
                                balanceAfter: balanceBefore,
                                status: 'Processing',
                                report: `Payment via ${req.params.gatewayName} - Transaction: ${callbackData.transaction_id}`
                            });
                            await order.save();

                            submitOrderToProvider(order, {
                                phoneNumber: resolvedBeneficiary,
                                packageName: resolvedPackageName,
                                capacity: deriveCapacity(resolvedPackageName),
                                price: paymentTransaction.amount,
                                provider: paymentTransaction.provider,
                                network: paymentTransaction.provider,
                                reference: order._id.toString(),
                                orderId: order._id
                            }).catch(err => console.error('Provider submission failed:', err.message));

                            // Create Transaction record (successful)
                            const transaction = new Transaction({
                                userId: paymentTransaction.userId,
                                storeSlug: paymentTransaction.storeSlug || null,
                                beneficiary_phone: paymentTransaction.phoneNumber,
                                description: `${paymentTransaction.provider} Bundle Purchase - ${resolvedBeneficiary}`,
                                balance_before: balanceBefore,
                                amount: paymentTransaction.totalAmount || paymentTransaction.amount,
                                method: 'Mobile Money',
                                status: 'complete',
                                orderId: order._id,
                                created: new Date()
                            });
                            await transaction.save();

                            await recordOrderCommission({
                                userId: paymentTransaction.userId,
                                order,
                                paymentTransaction,
                                transactionRecord: transaction,
                                gatewayName: req.params.gatewayName
                            });

                            paymentTransaction.orderId = order._id;
                            await paymentTransaction.save();
                            console.log(`✅ Order and Transaction created for payment ${callbackData.transaction_id}`, {
                                orderId: order._id.toString(),
                                transactionRecordId: transaction._id.toString(),
                                paymentPhoneNumber: paymentTransaction.phoneNumber,
                                beneficiaryPhoneNumber: resolvedBeneficiary
                            });
                        } else {
                            // Payment failed — record a failed Transaction so dealer can see it
                            const failedTx = new Transaction({
                                userId: paymentTransaction.userId,
                                storeSlug: paymentTransaction.storeSlug || null,
                                beneficiary_phone: paymentTransaction.phoneNumber,
                                description: `FAILED: ${paymentTransaction.provider} Bundle Purchase - ${resolvedBeneficiary}`,
                                balance_before: balanceBefore,
                                amount: paymentTransaction.amount,
                                method: 'Mobile Money',
                                status: 'failed',
                                created: new Date()
                            });
                            await failedTx.save();
                            console.log(`⚠️ Failed Transaction recorded for payment ${callbackData.transaction_id}`);
                        }
                    }
                }
            } catch (orderErr) {
                console.error('Error creating order/transaction:', orderErr);
                // Don't fail the webhook - payment is already processed
            }
        }

        // Respond with OK for gateway
        res.json({ success: true, message: 'Callback received' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ message: err.message });
    }
};

app.get('/api/webhook/payment/:gatewayName', handleWebhookCallback);
app.post('/api/webhook/payment/:gatewayName', handleWebhookCallback);

// Get payment logs for a gateway

// Get payment logs for a gateway
app.get('/api/admin/payment-logs/:gatewayName', auth, admin, async (req, res) => {
    try {
        const logs = await PaymentTransaction.find({ paymentGateway: req.params.gatewayName })
            .sort({ initiatedAt: -1 })
            .limit(50);

        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get all payment transactions for a user
app.get('/api/user/payment-history', auth, async (req, res) => {
    try {
        const transactions = await PaymentTransaction.find({ userId: req.user.id })
            .sort({ initiatedAt: -1 })
            .limit(20);

        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user's orders
app.get('/api/user/orders', auth, async (req, res) => {
    try {
        const storeSettings = await StoreSettings.findOne({ userId: req.user.id }).lean();
        const storeSlug = storeSettings?.storeSlug;
        const query = storeSlug
            ? { $or: [{ userId: req.user.id }, { storeSlug }] }
            : { userId: req.user.id };

        const orders = await Order.find(query)
            .sort({ created: -1 })
            .limit(50);

        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user's transactions
app.get('/api/user/transactions', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id })
            .sort({ created: -1 })
            .limit(50);

        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get single order details
app.get('/api/user/orders/:orderId', auth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Verify ownership
        if (order.userId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        res.json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get single transaction details
app.get('/api/user/transactions/:transactionId', auth, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.transactionId);
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        // Verify ownership
        if (transaction.userId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        res.json(transaction);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

async function handleXpresPortalWebhook(req, res) {
    try {
        const body = { ...(req.query || {}), ...(req.body || {}) };
        console.log('XPRES WEBHOOK:', body);

        const data = body.data || {};
        const orderPayload = body.order || data.order || {};

        const reference = firstDefined(
            body.reference,
            body.ref,
            body.identifier,
            data.reference,
            data.ref,
            data.identifier,
            orderPayload.reference,
            orderPayload.ref,
            orderPayload.identifier
        );
        const orderId = firstDefined(
            body.orderId,
            body.order_id,
            body.id,
            data.orderId,
            data.order_id,
            data.id,
            orderPayload.orderId,
            orderPayload.order_id,
            orderPayload.id
        );
        const rawStatus = firstDefined(
            body.status,
            body.orderStatus,
            body.order_status,
            data.status,
            data.orderStatus,
            data.order_status,
            orderPayload.status
        );
        const normalizedStatus = normalizeProviderOrderStatus(rawStatus);

        const lookup = [];
        if (reference) {
            lookup.push({ providerReference: reference });
            if (mongoose.Types.ObjectId.isValid(reference)) {
                lookup.push({ _id: reference });
            }
        }
        if (orderId) {
            lookup.push({ providerOrderId: orderId });
            if (mongoose.Types.ObjectId.isValid(orderId)) {
                lookup.push({ _id: orderId });
            }
        }

        if (lookup.length === 0) {
            console.warn('XPRES WEBHOOK missing order identifiers:', body);
            return res.status(200).json({
                received: true,
                matched: false,
                message: 'No reference or order id supplied'
            });
        }

        if (!normalizedStatus) {
            console.warn('XPRES WEBHOOK unknown status:', rawStatus);
            return res.status(200).json({
                received: true,
                matched: false,
                message: `Unknown status: ${rawStatus || 'not supplied'}`
            });
        }

        const order = await Order.findOneAndUpdate(
            {
                $or: lookup
            },
            {
                status: normalizedStatus,
                providerReference: reference || undefined,
                providerOrderId: orderId || undefined,
                completed: normalizedStatus === 'completed' ? new Date() : undefined,
                lastStatusUpdate: new Date()
            },
            { new: true }
        );

        if (order) {
            await ProviderAPILog.findOneAndUpdate(
                { orderId: order._id },
                {
                    status: normalizedStatus === 'completed' ? 'success' : normalizedStatus === 'failed' ? 'failed' : 'processing',
                    responseData: body,
                    apiReference: reference || order.providerReference,
                    responseTime: new Date()
                },
                { sort: { requestTime: -1 } }
            );
        }

        console.log('Updated XpresPortal order:', {
            orderId: order?._id,
            reference,
            providerOrderId: orderId,
            status: normalizedStatus
        });

        res.status(200).json({
            received: true,
            matched: Boolean(order),
            orderId: order?._id || null,
            status: normalizedStatus
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message
        });
    }
}

app.post('/api/webhooks/xpresportal', handleXpresPortalWebhook);
app.get('/api/webhooks/xpresportal', handleXpresPortalWebhook);

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startOrderStatusUpdater();
});
