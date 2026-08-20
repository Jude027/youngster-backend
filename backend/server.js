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

function formatLogArgs(args) {
    return util.format(...args);
}

console.log = (...args) => {
    process.stdout.write(formatLogArgs(args) + '\n');
};
console.warn = (...args) => {
    process.stderr.write(formatLogArgs(args) + '\n');
};
console.error = (...args) => {
    process.stderr.write(formatLogArgs(args) + '\n');
};

const app = express();
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, server-to-server)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'https://youngster-frontend-production.up.railway.app',
            'https://youngster-frontend.vercel.app',
            'https://youngster-backend.vercel.app',
            'https://xpresportal.app'
        ];

        const isAllowed =
            allowedOrigins.includes(origin) ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('trycloudflare.com') ||
            origin.includes('railway.app') ||
            origin.includes('vercel.app') ||
            /^http:\/\/172\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);

        if (isAllowed) {
            return callback(null, true);
        }

        console.log('❌ CORS blocked:', origin);
        return callback(new Error('CORS not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
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
        delivered: 'Completed',
        resolved: 'Completed',
        success: 'Completed',
        successful: 'Completed',
        completed: 'Completed',
        complete: 'Completed',
        cancelled: 'Failed',
        canceled: 'Failed',
        rejected: 'Failed',
        failed: 'Failed',
        refunded: 'Cancelled/Refunded',
        pending: 'Processing',
        processing: 'Processing'
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
    if (!['completed', 'success'].includes(transactionStatus)) return null;

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
    if (!paymentTransaction) return null;

    const txId = paymentTransaction.transactionId || paymentTransaction._id?.toString();
    console.log('[PaidOrder] createPaidOrderRecords called', {
        txId,
        orderId: paymentTransaction.orderId?.toString() || null,
        status: paymentTransaction.status,
    });

    // ── Duplicate guard ───────────────────────────────────────────────────────
    // Skip if orderId is already a real ObjectId (order was fully created).
    if (paymentTransaction.orderId && paymentTransaction.orderId !== 'CREATING') {
        const existingOrder = await Order.findById(paymentTransaction.orderId);
        console.log('[PaidOrder] orderId guard —', existingOrder ? 'order found' : 'order NOT found', {
            orderId: paymentTransaction.orderId?.toString()
        });
        if (existingOrder) {
            // Ensure a Transaction record exists for this order — if it was missed
            // on the first run (e.g. due to a race or error), create it now.
            const existingTx = await Transaction.findOne({ orderId: existingOrder._id });
            if (!existingTx) {
                const fallbackUserId = paymentTransaction.userId || existingOrder.userId;
                const fallbackStoreSlug = paymentTransaction.storeSlug
                    || paymentTransaction.metadata?.storeSlug
                    || existingOrder.storeSlug || null;
                const fallbackBeneficiary = paymentTransaction.metadata?.beneficiary
                    || paymentTransaction.phoneNumber;
                try {
                    await Transaction.create({
                        userId: fallbackUserId,
                        storeSlug: fallbackStoreSlug,
                        beneficiary_phone: paymentTransaction.phoneNumber,
                        description: `${paymentTransaction.provider} Bundle Purchase - ${fallbackBeneficiary}`,
                        balance_before: 0,
                        amount: paymentTransaction.totalAmount || paymentTransaction.amount,
                        method: 'Mobile Money',
                        status: 'Completed',
                        orderId: existingOrder._id,
                        guestSessionId: paymentTransaction.metadata?.guestSessionId || null,
                        created: new Date(),
                    });
                    console.log('[PaidOrder] Late Transaction record created for existing order', {
                        orderId: existingOrder._id.toString()
                    });
                } catch (txErr) {
                    console.error('[PaidOrder] Failed to create late Transaction record:', txErr.message);
                }
            }

            // If the order was created but never submitted to the provider, do it now.
            if (!existingOrder.providerReference && existingOrder.status === 'Processing') {
                const resolvedBeneficiaryEx = paymentTransaction.metadata?.beneficiary || paymentTransaction.phoneNumber;
                const resolvedPackageNameEx = resolvePaymentPackageName(paymentTransaction);
                const resolvedProviderEx = paymentTransaction.metadata?.orderProvider
                    || paymentTransaction.metadata?.packageProvider
                    || paymentTransaction.provider;
                console.log('[PaidOrder] Order exists but not yet submitted to provider — submitting now', {
                    orderId: existingOrder._id.toString(),
                    resolvedProvider: resolvedProviderEx,
                    isUnverified: Boolean(paymentTransaction.isUnverified || paymentTransaction.metadata?.isUnverified)
                });
                submitOrderToProvider(existingOrder, {
                    phoneNumber: resolvedBeneficiaryEx,
                    packageName: resolvedPackageNameEx,
                    capacity: deriveCapacity(resolvedPackageNameEx),
                    price: paymentTransaction.amount,
                    provider: resolvedProviderEx,
                    network: resolvedProviderEx,
                    reference: existingOrder._id.toString(),
                    orderId: existingOrder._id,
                    isUnverified: Boolean(paymentTransaction.isUnverified || paymentTransaction.metadata?.isUnverified),
                }).catch(err => console.error('[PaidOrder] Late provider submission failed:', err.message));
            }

            const existingCommission = await Commission.findOne({ source: 'order', sourceId: existingOrder._id });
            if (!existingCommission) {
                const txRecord = await Transaction.findOne({ orderId: existingOrder._id, status: 'Completed' });
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

    // Check by transactionId — catches the race where orderId isn't stamped yet.
    // Skip if orderId is the 'CREATING' sentinel — that means we're mid-creation.
    const existingByTxn = await Order.findOne({ transactionId: paymentTransaction.transactionId });
    if (existingByTxn) {
        console.log('[PaidOrder] Order already exists for transactionId — checking for missing Transaction record', {
            transactionId: paymentTransaction.transactionId,
            existingOrderId: existingByTxn._id
        });

        // Create Transaction record if it was never saved (PaymentService auto-create
        // only creates the Order, not the Transaction).
        const existingTx = await Transaction.findOne({ orderId: existingByTxn._id });
        if (!existingTx) {
            const fallbackUserId = paymentTransaction.userId || existingByTxn.userId;
            const fallbackStoreSlug = paymentTransaction.storeSlug
                || paymentTransaction.metadata?.storeSlug
                || existingByTxn.storeSlug || null;
            const fallbackBeneficiary = paymentTransaction.metadata?.beneficiary
                || paymentTransaction.phoneNumber;
            try {
                await Transaction.create({
                    userId: fallbackUserId,
                    storeSlug: fallbackStoreSlug,
                    beneficiary_phone: paymentTransaction.phoneNumber,
                    description: `${paymentTransaction.provider} Bundle Purchase - ${fallbackBeneficiary}`,
                    balance_before: 0,
                    amount: paymentTransaction.totalAmount || paymentTransaction.amount,
                    method: 'Mobile Money',
                    status: 'Completed',
                    orderId: existingByTxn._id,
                    guestSessionId: paymentTransaction.metadata?.guestSessionId || null,
                    created: new Date(),
                });
                console.log('[PaidOrder] Transaction record created for existing order', {
                    orderId: existingByTxn._id.toString(),
                    storeSlug: fallbackStoreSlug,
                    userId: fallbackUserId?.toString()
                });
            } catch (txErr) {
                console.error('[PaidOrder] Failed to create Transaction record:', txErr.message);
            }
        }

        // Submit to provider if not yet done
        if (!existingByTxn.providerReference && existingByTxn.status === 'Processing') {
            const resolvedBeneficiaryEx = paymentTransaction.metadata?.beneficiary || paymentTransaction.phoneNumber;
            const resolvedPackageNameEx = resolvePaymentPackageName(paymentTransaction);
            const resolvedProviderEx = paymentTransaction.metadata?.orderProvider
                || paymentTransaction.metadata?.packageProvider
                || paymentTransaction.provider;
            console.log('[PaidOrder] Submitting existing order to provider', {
                orderId: existingByTxn._id.toString(), resolvedProviderEx
            });
            submitOrderToProvider(existingByTxn, {
                phoneNumber: resolvedBeneficiaryEx,
                packageName: resolvedPackageNameEx,
                capacity: deriveCapacity(resolvedPackageNameEx),
                price: paymentTransaction.amount,
                provider: resolvedProviderEx,
                network: resolvedProviderEx,
                reference: existingByTxn._id.toString(),
                orderId: existingByTxn._id,
                isUnverified: Boolean(paymentTransaction.isUnverified || paymentTransaction.metadata?.isUnverified),
            }).catch(err => console.error('[PaidOrder] Provider submission failed:', err.message));
        }

        return existingByTxn._id;
    }

    // Atomically claim this transaction so concurrent calls can't both pass.
    // Uses a dedicated boolean flag 'orderCreating' so we don't corrupt the
    // orderId field (which is typed as ObjectId and rejects string sentinels).
    const claimed = await PaymentTransaction.findOneAndUpdate(
        {
            transactionId: paymentTransaction.transactionId,
            $or: [
                { orderCreating: { $exists: false } },
                { orderCreating: false }
            ]
        },
        { $set: { orderCreating: true } },
        { new: false }
    );
    console.log('[PaidOrder] Claim result:', claimed ? 'claimed OK' : 'ALREADY CLAIMED — skipping', {
        transactionId: paymentTransaction.transactionId
    });
    if (!claimed) {
        // Another call already claimed it — wait briefly then return the created order
        await new Promise(r => setTimeout(r, 800));
        const created = await Order.findOne({ transactionId: paymentTransaction.transactionId });
        return created?._id || null;
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
    const guestSessionId = paymentTransaction.metadata?.guestSessionId || null;
    // Use the actual package provider (e.g. "MTN", "AT Ishare") not the payment network
    const resolvedProvider = paymentTransaction.metadata?.orderProvider
        || paymentTransaction.metadata?.packageProvider
        || paymentTransaction.provider;

    // For MTN AFA registrations, embed the customer details in the report
    // so they're visible in the order table.
    const isAFA = /mtn.?afa/i.test(resolvedProvider || '');
    const extra = paymentTransaction.metadata?.extra || {};
    const orderReport = isAFA && extra.fullname
        ? [
            `Name: ${extra.fullname}`,
            `Phone: ${resolvedBeneficiary}`,
            `Ghana Card: ${extra.ghanaCard || '—'}`,
            `DOB: ${extra.dob || '—'}`,
            `Location: ${extra.location || '—'}`,
            `Region: ${extra.region || '—'}`,
          ].join(' | ')
        : `Payment via ${gatewayName} - Transaction: ${paymentTransaction.transactionId}`;

    const order = new Order({
        userId,
        storeSlug,
        clientType,
        guestSessionId,
        beneficiary: resolvedBeneficiary,
        phoneNumber: resolvedBeneficiary,
        package: resolvedProvider,
        providerName: resolvedProvider,
        packageName: resolvedPackageName,
        bundleSize: resolvedPackageName,
        bundle_size: resolvedPackageName,
        amount: paymentTransaction.amount,
        price: paymentTransaction.amount,
        balanceBefore,
        balanceAfter: balanceBefore,
        status: 'Processing',
        transactionId: paymentTransaction.transactionId,
        report: orderReport
    });
    await order.save();

    submitOrderToProvider(order, {
        phoneNumber: resolvedBeneficiary,
        packageName: resolvedPackageName,
        capacity: deriveCapacity(resolvedPackageName),
        price: paymentTransaction.amount,
        provider: resolvedProvider,
        network: resolvedProvider,
        reference: order._id.toString(),
        orderId: order._id,
        isUnverified: Boolean(paymentTransaction.isUnverified || paymentTransaction.metadata?.isUnverified),
    }).catch(err => console.error('Provider submission failed:', err.message));

    const txRecord = new Transaction({
        userId,
        storeSlug,
        beneficiary_phone: paymentTransaction.phoneNumber,
        description: `${paymentTransaction.provider} Bundle Purchase - ${resolvedBeneficiary}`,
        balance_before: balanceBefore,
        amount: paymentTransaction.totalAmount || paymentTransaction.amount,
        method: 'Mobile Money',
        status: 'Completed',
        orderId: order._id,
        guestSessionId: paymentTransaction.metadata?.guestSessionId || null,
        created: new Date()
    });
    try {
        await txRecord.save();
        console.log('[PaidOrder] Transaction record saved', {
            transactionRecordId: txRecord._id.toString(),
            status: txRecord.status,
            storeSlug,
            userId: userId?.toString()
        });
    } catch (txErr) {
        console.error('[PaidOrder] Failed to save Transaction record:', txErr.message, {
            storeSlug, userId: userId?.toString(), orderId: order._id.toString()
        });
    }

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
            isUnverified: orderData.isUnverified || false,
        });

        const provider = await Provider.findOne({ name: providerName });
        let routing = provider?.orderRouting?.handler || 'auto';

        // Unverified numbers (failed beneficiary check) are always routed to
        // WhatsApp Notifier — the API providers (DataHub etc.) reject them.
        // The admin doesn't need any extra config; this is automatic.
        if (orderData.isUnverified) {
            console.log(`[ProviderSubmit] Number is unverified — forcing WhatsApp routing for ${providerName}`);
            routing = 'whatsapp';
        }

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

// Disable Mongoose command buffering globally — on Vercel, if a DB operation
// fires before the connection is ready it should fail immediately with a clear
// error rather than buffering silently and timing out.
mongoose.set('bufferCommands', false);
// On Vercel each function invocation may be a cold start — we must await
// the connection before ANY mongoose operation runs.
// bufferCommands: false means mongoose will throw immediately if not connected
// instead of silently queuing — this surfaces the real error faster.
let _mongoPromise = null;

async function connectMongo() {
    // Already connected — reuse the existing connection
    if (mongoose.connection.readyState === 1) return;
    // Connection in progress — wait for it
    if (_mongoPromise) return _mongoPromise;

    _mongoPromise = (async () => {
        try {
            await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS:          45000,
                maxPoolSize:              10,
                bufferCommands:           false,
            });
            console.log('MongoDB Connected');
        } catch (err) {
            _mongoPromise = null; // reset so next request retries
            console.error('MongoDB connection error:', err.message);
            throw err;
        }
    })();

    return _mongoPromise;
}

// Attempt connection immediately on module load (warms up the connection)
connectMongo().catch(() => {});

// Middleware: ensure DB is connected before every request
app.use(async (req, res, next) => {
    try {
        await connectMongo();
        next();
    } catch (err) {
        console.error('[DB] Connection failed for request:', req.path, err.message);
        return res.status(503).json({ message: 'Database unavailable. Please try again in a moment.' });
    }
});

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

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Youngster Backend API is running', timestamp: new Date().toISOString() });
});

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
                // Use createPaidOrderRecords to avoid duplicate orders
                await createPaidOrderRecords(transaction, transaction.paymentGateway);
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
            const allStoreSettings = await StoreSettings.find({ userId }).lean();
            const storeSlugs = allStoreSettings.map(s => s.storeSlug).filter(Boolean);
            query = storeSlugs.length
                ? { $or: [{ userId }, { storeSlug: { $in: storeSlugs } }] }
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
            orderId: order._id,
            isUnverified: Boolean(req.body.isUnverified),
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
            // Fetch transactions for this dealer — direct (userId) and storefront-placed (storeSlug).
            // Also look up all storeSlug values associated with this dealer's StoreSettings
            // so transactions saved with storeSlug but a different userId still appear.
            const allStoreSettings = await StoreSettings.find({ userId }).lean();
            const storeSlugs = allStoreSettings.map(s => s.storeSlug).filter(Boolean);
            if (storeSlugs.length) {
                query = { $or: [{ userId }, { storeSlug: { $in: storeSlugs } }] };
            } else {
                query = { userId };
            }
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

// ==================== GUEST ORDERS & TRANSACTIONS (public — no auth) ====================
// Returns records for a specific guest session only.
// Guests are identified by a guestSessionId generated in localStorage on their
// first storefront visit. Both the ID and the storeSlug are required so a guest
// from one store can never see records from another store.

app.get('/api/guest/orders', async (req, res) => {
    try {
        const { guestSessionId, store } = req.query;
        if (!guestSessionId || !store) {
            return res.status(400).json({ error: 'guestSessionId and store are required' });
        }
        // Only return orders that have an actual guestSessionId match.
        // Never return orders where guestSessionId is null — those are legacy
        // records that would leak other customers' orders.
        const orders = await Order.find({
            guestSessionId: { $eq: guestSessionId, $ne: null, $exists: true },
            storeSlug: store
        }).sort({ created: -1 }).limit(50).lean();
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/guest/transactions', async (req, res) => {
    try {
        const { guestSessionId, store } = req.query;
        if (!guestSessionId || !store) {
            return res.status(400).json({ error: 'guestSessionId and store are required' });
        }
        // Same guard — never return records where guestSessionId is null.
        const txns = await Transaction.find({
            guestSessionId: { $eq: guestSessionId, $ne: null, $exists: true },
            storeSlug: store
        }).sort({ created: -1 }).limit(50).lean();
        res.json(txns);
    } catch (err) {
        res.status(500).json({ error: err.message });
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

        // Sync provider names into the Provider collection so dashboard cards
        // use the exact same name as stored in ReferralPrice — prevents mismatch
        // where the card passes "Results_checker" but DB has "Results_checkers".
        const providerNames = [...new Set(newPrices.map(p => p.provider).filter(Boolean))];
        for (const name of providerNames) {
            await Provider.findOneAndUpdate(
                { name },
                { $setOnInsert: { name } },
                { upsert: true }
            );
        }

        res.json(inserted);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== DEBUG: STOREFRONT PRICES TEST ====================
// GET /api/debug/storefront-prices?store=<slug>&clientType=<type>&provider=<name>
// Returns exactly what storefront-prices.js would receive, plus diagnosis info.
// Remove or protect this endpoint after debugging is done.
app.get('/api/debug/storefront-prices', async (req, res) => {
    try {
        const { store, clientType, provider } = req.query;
        const storeSettings = await findStoreSettingsByStoreSlug(store);
        if (!storeSettings) return res.json({ error: 'Store not found', store });

        const query = { userId: storeSettings.userId };
        if (clientType) query.clientType = clientType;
        const referralPrices = await ReferralPrice.find(query).lean();
        const filtered = referralPrices.filter(p => p.price > 0);

        const basePriceQuery = clientType ? { clientType } : {};
        const allBasePrices = await BasePrice.find(basePriceQuery).lean();

        const matchingReferral = provider
            ? filtered.filter(p => (p.provider || '').toLowerCase().trim() === (provider || '').toLowerCase().trim())
            : filtered;

        const matchingBase = provider
            ? allBasePrices.filter(p => (p.provider || '').toLowerCase().trim() === (provider || '').toLowerCase().trim())
            : allBasePrices;

        // Also show what a fuzzy match would return (for debugging name mismatches)
        const providerNorm = (provider || '').toLowerCase().trim().replace(/s$/, ''); // strip trailing s
        const fuzzyReferral = provider
            ? filtered.filter(p => (p.provider || '').toLowerCase().trim().replace(/s$/, '').includes(providerNorm) || providerNorm.includes((p.provider || '').toLowerCase().trim().replace(/s$/, '')))
            : [];

        res.json({
            diagnosis: {
                store,
                clientType: clientType || '(not provided)',
                provider: provider || '(not provided)',
                storeFound: true,
                userId: storeSettings.userId,
                totalReferralPrices: filtered.length,
                referralPricesForProvider: matchingReferral.length,
                fuzzyMatchCount: fuzzyReferral.length,
                totalBasePrices: allBasePrices.length,
                basePricesForProvider: matchingBase.length,
                allProviderNamesInReferral: [...new Set(filtered.map(p => p.provider))],
                allProviderNamesInBase: [...new Set(allBasePrices.map(p => p.provider))],
            },
            referralPricesForProvider: matchingReferral,
            fuzzyMatches: fuzzyReferral.map(p => ({ provider: p.provider, packageName: p.packageName, price: p.price })),
            basePricesForProvider: matchingBase.map(p => ({ provider: p.provider, packageName: p.packageName, price: p.price, hasDisplayConfig: !!p.displayConfig })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

        // Build query — clientType is optional; if absent return all prices for the store.
        // Use case-insensitive regex so "Sub-agents" matches "sub-agents" etc.
        const query = { userId: storeSettings.userId };
        if (clientType) {
            query.clientType = new RegExp(`^${clientType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        }

        const prices = await ReferralPrice.find(query).lean();
        const filtered = prices.filter(p => p.price > 0);

        // If no referral prices set for a provider, fall back to BasePrice
        // so newly-added providers show up on the storefront immediately.
        const referralProviders = new Set(filtered.map(p => p.provider));
        const basePriceQuery = clientType
            ? { clientType }
            : {};
        const allBasePrices = await BasePrice.find(basePriceQuery).lean();
        const basePriceProvidersNotInReferral = [
            ...new Set(allBasePrices.map(p => p.provider).filter(p => p && !referralProviders.has(p)))
        ];
        if (basePriceProvidersNotInReferral.length) {
            const fallbackPrices = allBasePrices
                .filter(p => basePriceProvidersNotInReferral.includes(p.provider) && p.price > 0)
                .map(bp => ({
                    provider:    bp.provider,
                    packageName: bp.packageName,
                    clientType:  bp.clientType,
                    price:       bp.price,
                    userId:      storeSettings.userId,
                    _isFallback: true,
                }));
            filtered.push(...fallbackPrices);
        }

        // Attach displayConfig from BasePrice so generic-package.html can apply
        // provider customisations (header colour, page title, section, etc.)
        // Uses case-insensitive matching so minor name differences don't break lookup.
        if (filtered.length) {
            const providerNames = [...new Set(filtered.map(p => p.provider).filter(Boolean))];
            const basePriceRows = await BasePrice.find(
                {},
                { provider: 1, displayConfig: 1 }
            ).lean();

            // Build case-insensitive map: normalised provider name → displayConfig
            const dcMap = {};
            basePriceRows.forEach(row => {
                if (row.provider && row.displayConfig) {
                    const key = row.provider.toLowerCase().trim();
                    if (!dcMap[key]) dcMap[key] = row.displayConfig;
                }
            });

            filtered.forEach(p => {
                if (p.provider) {
                    const key = p.provider.toLowerCase().trim();
                    if (dcMap[key]) {
                        p.displayConfig = dcMap[key];
                    }
                }
            });
        }

        res.json(filtered);
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

        // Fetch all orders for this store that have a guestSessionId.
        // Each unique guestSessionId = one unique customer/device that visited
        // this dealer's referral link and placed at least one order.
        const orders = await Order.find({
            storeSlug,
            guestSessionId: { $ne: null, $exists: true }
        }).select('guestSessionId beneficiary phoneNumber transactionId created').lean();

        // Also pull payment phone numbers from PaymentTransaction records
        // so we can show who actually paid (not just who received the bundle).
        const transactionIds = orders.map(o => o.transactionId).filter(Boolean);
        const paymentTxns = await PaymentTransaction.find({
            transactionId: { $in: transactionIds }
        }).select('transactionId phoneNumber').lean();
        const paymentPhoneMap = new Map(paymentTxns.map(t => [t.transactionId, t.phoneNumber]));

        // Build a map: guestSessionId → { lastOrder, orderCount, paymentPhone, beneficiaryPhone }
        const sessionMap = new Map();
        for (const order of orders) {
            const sid = order.guestSessionId;
            if (!sid) continue;
            const paymentPhone = order.transactionId ? paymentPhoneMap.get(order.transactionId) : null;
            const beneficiary  = order.beneficiary || order.phoneNumber || null;
            const existing = sessionMap.get(sid) || {
                guestSessionId:  sid,
                orderCount:      0,
                lastOrder:       null,
                paymentPhone:    paymentPhone || beneficiary || 'Unknown',
                beneficiaryPhone: beneficiary || 'Unknown',
            };
            existing.orderCount += 1;
            // Track the most recent payment phone in case it changes across orders
            if (paymentPhone) existing.paymentPhone = paymentPhone;
            if (beneficiary)  existing.beneficiaryPhone = beneficiary;
            const created = order.created ? new Date(order.created) : null;
            if (created && (!existing.lastOrder || created > existing.lastOrder)) {
                existing.lastOrder = created;
            }
            sessionMap.set(sid, existing);
        }

        const active   = [];
        const inactive = [];

        sessionMap.forEach(item => {
            if (item.lastOrder && item.lastOrder >= thirtyDaysAgo) {
                active.push(item);
            } else {
                inactive.push(item);
            }
        });

        // Sort by most recent order
        const sortByRecent = (a, b) => (b.lastOrder || 0) - (a.lastOrder || 0);

        const formatItem = item => {
            // Show payment phone (person who paid) and beneficiary (recipient)
            // They may be the same person or different — show both clearly.
            const sameNumber = item.paymentPhone === item.beneficiaryPhone;
            const label = sameNumber
                ? item.paymentPhone
                : `${item.paymentPhone} → ${item.beneficiaryPhone}`;
            return {
                id:               item.guestSessionId,
                label,
                paymentPhone:     item.paymentPhone,
                beneficiaryPhone: item.beneficiaryPhone,
                lastOrder:        item.lastOrder,
                orderCount:       item.orderCount,
            };
        };

        res.json({
            totalReferrals:      sessionMap.size,
            activeReferrals:     active.length,
            inactiveReferrals:   inactive.length,
            activeReferralsList:   active.sort(sortByRecent).slice(0, 10).map(formatItem),
            inactiveReferralsList: inactive.sort(sortByRecent).slice(0, 10).map(formatItem),
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

// GET display config for a single provider (including sentinel rows)
app.get('/api/admin/base-prices/display-config-get', auth, admin, async (req, res) => {
    try {
        const { provider } = req.query;
        if (!provider) return res.status(400).json({ message: 'provider is required' });
        const row = await BasePrice.findOne(
            { provider: new RegExp(`^${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { displayConfig: 1 }
        ).lean();
        res.json({ displayConfig: row?.displayConfig || null });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST: sync all existing ReferralPrice provider names into Provider collection
// Call this once to fix existing name mismatches — safe to call multiple times.
app.post('/api/admin/sync-provider-names', auth, admin, async (req, res) => {
    try {
        const referralPrices = await ReferralPrice.find({}, { provider: 1 }).lean();
        const names = [...new Set(referralPrices.map(p => p.provider).filter(Boolean))];
        let synced = 0;
        for (const name of names) {
            const result = await Provider.findOneAndUpdate(
                { name },
                { $setOnInsert: { name } },
                { upsert: true, new: false }
            );
            if (!result) synced++;
        }
        res.json({ message: `Synced ${synced} new provider(s) from ReferralPrice`, total: names.length, names });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/admin/base-prices/display-config', auth, admin, async (req, res) => {
    try {
        const { provider, displayConfig } = req.body;
        if (!provider) {
            return res.status(400).json({ message: 'Provider name is required' });
        }

        // Update all existing BasePrice rows for this provider
        const result = await BasePrice.updateMany(
            { provider },
            { $set: { displayConfig } }
        );

        // If no BasePrice rows exist for this provider (e.g. AT Ishare, Results_checkers
        // that only have ReferralPrice entries), create a sentinel row so displayConfig
        // has a home and will be returned by GET /api/storefront-prices.
        if (result.matchedCount === 0) {
            await BasePrice.findOneAndUpdate(
                { provider, packageName: '__config__' },
                { $set: { provider, packageName: '__config__', clientType: 'config', price: 0, displayConfig } },
                { upsert: true }
            );
        }

        res.json({ message: 'Display configuration saved successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== DASHBOARD STATIC FILES ====================
// Frontend is served by a separate Railway service — only redirect here.
const DASHBOARD_DIR = process.env.DASHBOARD_DIR || path.join(__dirname, '../Dashboard');
const ADMIN_DIR = process.env.ADMIN_DIR || path.join(__dirname, '../Admin');

// Only mount static middleware if the directory actually exists (local dev only)
const fs_sync = require('fs');
if (fs_sync.existsSync(DASHBOARD_DIR)) {
    app.use('/Dashboard', express.static(DASHBOARD_DIR, { index: false, redirect: false }));
}
if (fs_sync.existsSync(ADMIN_DIR)) {
    app.use('/Admin', express.static(ADMIN_DIR, { index: false, redirect: false }));
}

const FRONTEND_BASE = process.env.FRONTEND_URL || 'https://youngster-frontend.vercel.app';

app.get('/referral/:slug', (req, res) => {
    const client = req.query.client ? `&client=${encodeURIComponent(req.query.client)}` : '';
    return res.redirect(302, `${FRONTEND_BASE}/Dashboard/dashboard2.html?store=${encodeURIComponent(req.params.slug)}${client}`);
});

// Redirect old ?store= URLs to clean /referral/ URLs
app.get('/Dashboard/dashboard2', (req, res) => {
    const store = req.query.store;
    if (store) res.redirect(302, '/referral/' + encodeURIComponent(store));
    else res.redirect(302, `${FRONTEND_BASE}/Dashboard/dashboard2.html`);
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

        const slug = (req.params.slug || '').toLowerCase();
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
            { status, report, completed: (status === 'Completed' || status === 'completed') ? new Date() : undefined },
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
            { $match: { status: { $in: ['complete', 'completed', 'success', 'Completed'] } } },
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

// ==================== PUBLIC STOREFRONT PROVIDERS ====================
// No auth required — returns providers + their storefrontSection for guest dashboards.
// GET /api/storefront-providers?store=<slug>
app.get('/api/storefront-providers', async (req, res) => {
    try {
        const providers = await Provider.find().sort({ order: 1 }).lean();

        // Attach storefrontSection from BasePrice displayConfig for each provider
        const basePriceRows = await BasePrice.find(
            {},
            { provider: 1, 'displayConfig.storefrontSection': 1, 'displayConfig.logoUrl': 1 }
        ).lean();

        const sectionMap = {};
        basePriceRows.forEach(row => {
            if (row.provider && row.displayConfig?.storefrontSection && !sectionMap[row.provider]) {
                sectionMap[row.provider] = row.displayConfig.storefrontSection;
            }
        });

        const result = providers.map(p => ({
            name:             p.name,
            logoUrl:          p.logoUrl || '',
            order:            p.order,
            storefrontSection: sectionMap[p.name] || 'data_bundle',
        }));

        res.json(result);
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

// ==================== WHATSAPP QR CODE PAGE ====================
// Open this URL on your phone browser to scan the WhatsApp QR code.
// On Railway: https://<your-app>.up.railway.app/api/whatsapp/qr
// The page auto-refreshes every 5 s so it tracks rotating QR codes.
app.get('/api/whatsapp/qr', (req, res) => {
    const { getLatestQr } = require('./services/WhatsAppNotifier');
    const { dataUrl, capturedAt } = getLatestQr();

    const age = capturedAt
        ? Math.round((Date.now() - capturedAt.getTime()) / 1000)
        : null;

    // Build the public URL so the page can display it for easy copy
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const publicUrl = `${proto}://${host}/api/whatsapp/qr`;

    const imgHtml = dataUrl
        ? `<img src="${dataUrl}" alt="WhatsApp QR Code" style="width:300px;height:300px;display:block;margin:0 auto 16px;" />`
        : `<p style="text-align:center;color:#888;font-size:18px;margin-bottom:16px;">⏳ Waiting for QR code…<br><small>Make sure a WhatsApp order has been triggered so the browser launches.</small></p>`;

    const statusLine = capturedAt
        ? `<p style="text-align:center;color:#555;font-size:13px;">QR captured ${age}s ago — refreshing every 5 s</p>`
        : `<p style="text-align:center;color:#555;font-size:13px;">Refreshing every 5 s…</p>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WhatsApp QR Code</title>
  <meta http-equiv="refresh" content="5" />
  <style>
    body { font-family: sans-serif; background: #f0f0f0; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 16px; padding: 32px 24px;
            box-shadow: 0 4px 24px rgba(0,0,0,.12); max-width: 380px; width: 100%; }
    h2 { text-align: center; color: #128C7E; margin: 0 0 24px; }
    .url-box { background:#f6f6f6; border-radius:8px; padding:8px 12px;
               font-size:12px; word-break:break-all; color:#444; margin-bottom:16px; text-align:center; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📱 Scan with WhatsApp</h2>
    ${imgHtml}
    ${statusLine}
    ${dataUrl ? '<p style="text-align:center;color:#128C7E;font-size:14px;">WhatsApp → Linked Devices → Link a Device → Scan this QR</p>' : ''}
    <div class="url-box">🔗 ${publicUrl}</div>
  </div>
</body>
</html>`);
});


app.post('/api/admin/whatsapp/reset-session', auth, admin, async (req, res) => {
    try {
        const { clearSession } = require('./services/WhatsAppNotifier');
        await clearSession();
        res.json({ message: 'WhatsApp session cleared. A fresh QR code will appear on the next WhatsApp order.' });
    } catch (err) {
        console.error('[WhatsApp] Reset session error:', err.message);
        res.status(500).json({ message: 'Failed to reset session: ' + err.message });
    }
});
// Get provider API configuration
app.get('/api/admin/provider-api-config/:providerName', auth, admin, async (req, res) => {
    try {
        const provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });
        res.json({
            providerName: provider.name,
            apiConfig: provider.apiConfig || {},
            apiConfigs: provider.apiConfigs || [],   // multi-config array
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

// ==================== PROVIDER API CONFIGS ARRAY (multi-config) ====================
// These endpoints manage the `apiConfigs` array on a provider, enabling multiple
// API configurations per provider (e.g. DataHub for verified numbers, iGet for unverified).

// POST — add a new config entry to the array
app.post('/api/admin/provider-api-configs/:providerName', auth, admin, async (req, res) => {
    try {
        const provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });

        const newConfig = req.body.apiConfig || req.body;
        if (!provider.apiConfigs) provider.apiConfigs = [];
        provider.apiConfigs.push(newConfig);
        provider.markModified('apiConfigs');
        provider.updatedAt = new Date();
        await provider.save();

        const added = provider.apiConfigs[provider.apiConfigs.length - 1];
        res.status(201).json({
            message: 'API configuration added',
            index: provider.apiConfigs.length - 1,
            config: added,
            apiConfigs: provider.apiConfigs
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT — update a specific config entry in the array by index
app.put('/api/admin/provider-api-configs/:providerName/:index', auth, admin, async (req, res) => {
    try {
        const provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });

        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || idx < 0 || idx >= (provider.apiConfigs || []).length) {
            return res.status(400).json({ message: `Invalid index ${idx}` });
        }

        const update = req.body.apiConfig || req.body;
        // Merge update into the existing entry
        provider.apiConfigs[idx] = { ...provider.apiConfigs[idx].toObject(), ...update };
        provider.markModified('apiConfigs');
        provider.updatedAt = new Date();
        await provider.save();

        res.json({
            message: 'API configuration updated',
            index: idx,
            config: provider.apiConfigs[idx],
            apiConfigs: provider.apiConfigs
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE — remove a specific config entry from the array by index
app.delete('/api/admin/provider-api-configs/:providerName/:index', auth, admin, async (req, res) => {
    try {
        const provider = await Provider.findOne({ name: req.params.providerName });
        if (!provider) return res.status(404).json({ message: 'Provider not found' });

        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || idx < 0 || idx >= (provider.apiConfigs || []).length) {
            return res.status(400).json({ message: `Invalid index ${idx}` });
        }

        provider.apiConfigs.splice(idx, 1);
        provider.markModified('apiConfigs');
        provider.updatedAt = new Date();
        await provider.save();

        res.json({
            message: 'API configuration deleted',
            apiConfigs: provider.apiConfigs
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
            guestSessionId,
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
            guestSessionId: guestSessionId || null,
            beneficiary: resolvedBeneficiary,
            isUnverified: Boolean(req.body.isUnverified),
            metadata: {
                userId,
                packageName: resolvedPackageName,
                bundle_size: resolvedPackageName,
                storeSlug,
                clientType,
                guestSessionId: guestSessionId || null,
                paymentNetwork: resolvedPaymentNetwork,
                orderProvider: resolvedOrderProvider,
                beneficiary: resolvedBeneficiary,
                isUnverified: Boolean(req.body.isUnverified),
                extra: req.body.extra || {},  // AFA registration details
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
// Verify a beneficiary (recipient) phone number with DataHub before allowing purchase.
// Keeps the DataHub API key server-side — never exposed to the browser.
app.post('/api/payment/verify-beneficiary', async (req, res) => {
    try {
        const { phone, is_ported_number, isPortedNumber } = req.body;
        const resolvedIsPorted = (is_ported_number !== undefined) ? is_ported_number
            : (isPortedNumber !== undefined ? isPortedNumber : true);

        if (!phone) {
            return res.status(400).json({ success: false, message: 'phone is required' });
        }

        // Find the DataHub provider configuration to get the base URL and API key.
        const provider = await Provider.findOne({
            $or: [
                { name: { $in: ['DataHub', 'datahub', 'MTN', 'mtn'] } },
                { 'apiConfig.baseUrl': /datahub/i },
                { 'apiConfigs.baseUrl': /datahub/i }
            ]
        });

        let activeApiConfig = null;
        if (provider) {
            const configs = Array.isArray(provider.apiConfigs) ? provider.apiConfigs : [];
            // Prefer a DataHub config
            activeApiConfig = configs.find(c => c && c.enabled && String(c.baseUrl || '').toLowerCase().includes('datahub'));
            if (!activeApiConfig) {
                // Fall back to the first enabled standard config
                activeApiConfig = configs.find(c => c && c.enabled && !c.forUnverifiedNumbers);
            }
            if (!activeApiConfig && provider.apiConfig?.enabled) {
                activeApiConfig = provider.apiConfig;
            }
        }

        // API key: prefer provider config, then env vars
        const apiKey = activeApiConfig?.authHeaderValue
            || provider?.apiConfig?.authHeaderValue
            || provider?.apiKey
            || process.env.DATAHUB_API_KEY
            || process.env.XPRES_API_KEY;

        if (!apiKey) {
            console.error('[VerifyBeneficiary] No DataHub API key found. Set DATAHUB_API_KEY env var or configure the Provider\'s Auth Header Value.');
            return res.status(500).json({ success: false, message: 'Verification service is not configured' });
        }

        // Base URL: use provider config or fall back to DataHub's root
        const baseUrl = activeApiConfig?.baseUrl
            ? String(activeApiConfig.baseUrl).replace(/\/+$/, '')
            : 'https://datahub.com.gh';

        // Auto-construct the verify URL so no extra admin field is needed.
        // DataHub verify path: /api/external/purchases/verify-number
        // If the admin already stored the base URL as e.g. "https://datahub.com.gh/api/external"
        // (typical because that's the prefix for /data-purchase), we just append the tail.
        // If they stored the bare root "https://datahub.com.gh" we append the full path.
        const DATAHUB_VERIFY_SUFFIX = '/purchases/verify-number';
        const DATAHUB_EXTERNAL_PREFIX = '/api/external';
        let verifyEndpoint;
        if (baseUrl.includes('/api/external')) {
            // baseUrl already has /api/external — just tack on the verify tail
            verifyEndpoint = baseUrl.replace(/\/+$/, '') + DATAHUB_VERIFY_SUFFIX;
        } else {
            // baseUrl is root domain — append the full path
            verifyEndpoint = baseUrl.replace(/\/+$/, '') + DATAHUB_EXTERNAL_PREFIX + DATAHUB_VERIFY_SUFFIX;
        }

        console.log('[VerifyBeneficiary] Using DataHub endpoint:', verifyEndpoint,
            '| key preview:', `${String(apiKey).slice(0, 4)}...${String(apiKey).slice(-2)}`);

        const response = await fetch(verifyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                phone,
                is_ported_number: resolvedIsPorted
            })
        });

        const result = await response.json();

        if (!response.ok || result?.success === false) {
            console.log('[VerifyBeneficiary] Verification failed:', result?.message || result?.error || 'Ineligible');
            return res.status(response.ok ? 422 : (response.status || 400)).json({
                success: false,
                message: result?.message || result?.error || 'Number is not eligible for this offer'
            });
        }

        console.log('[VerifyBeneficiary] Phone number verified successfully:', phone);
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('[VerifyBeneficiary] Verification request failed:', err.message);
        res.status(500).json({ success: false, message: 'Verification service unavailable, please try again' });
    }
});

// Resend OTP for an existing Moolre transaction.
// Re-calls the initiate endpoint (no otpcode) which makes Moolre fire a new SMS.
app.post('/api/payment/resend-otp', async (req, res) => {
    try {
        const { transactionId } = req.body;
        if (!transactionId) {
            return res.status(400).json({ success: false, message: 'transactionId is required' });
        }

        const transaction = await PaymentTransaction.findOne({ transactionId });
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // Only allow resend while the transaction is still in-flight
        if (transaction.status === 'success' || transaction.status === 'failed') {
            return res.status(400).json({
                success: false,
                message: `Cannot resend OTP — transaction is already ${transaction.status}`
            });
        }

        const gateway = await PaymentGateway.findOne({
            name: transaction.paymentGateway,
            enabled: true
        });
        if (!gateway) {
            return res.status(404).json({ success: false, message: 'Payment gateway not found' });
        }

        // Re-initiate without otpcode — Moolre will send a fresh OTP SMS
        const result = await PaymentService.processMoolreCollection(
            gateway,
            {
                phoneNumber: transaction.phoneNumber,
                provider: transaction.provider,
                description: transaction.description,
            },
            transactionId,
            transaction.totalAmount
        );

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message || 'Resend failed' });
        }

        console.log('🔁 OTP resent for transaction:', transactionId);
        res.json({ success: true, message: 'A new OTP has been sent to your phone.' });

    } catch (err) {
        console.error('❌ Resend OTP error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Internal: trigger Moolre USSD push (step 3) after OTP verification ──────
// Called by PaymentService.verifyOtp as a fire-and-forget self-call so the
// long-running Moolre request doesn't block the OTP verify response.
// Vercel runs this as a separate function invocation — no timeout from the OTP call.
app.post('/api/payment/trigger-ussd', async (req, res) => {
    const { transactionId, _internal } = req.body || {};
    if (!transactionId) return res.status(400).json({ error: 'transactionId required' });

    // Respond immediately — Moolre call happens after response is sent
    res.json({ ok: true });

    try {
        const transaction = await PaymentTransaction.findOne({ transactionId });
        if (!transaction) return;

        const gateway = await PaymentGateway.findOne({ name: transaction.paymentGateway, enabled: true });
        if (!gateway) return;

        const CHANNEL_MAP = { 'MTN': '13', 'MTN EXPRESS': '13', 'TELECEL': '6', 'AT': '7', 'AT ISHARE': '7', 'AT BIGTIME': '7', 'AIRTELTIGO': '7' };
        const channelCode   = CHANNEL_MAP[(transaction.provider || '').toUpperCase().trim()] || '13';
        const accountnumber = gateway.accountNumber || gateway.apiKey || '';
        const baseUrl       = (gateway.apiBaseUrl || 'https://api.moolre.com').replace(/\/+$/, '');

        const body = {
            type:          1,
            channel:       channelCode,
            currency:      'GHS',
            payer:         transaction.phoneNumber,
            amount:        parseFloat(transaction.totalAmount.toFixed(2)),
            externalref:   transactionId,
            reference:     transaction.description || `${transaction.provider} Bundle`,
            accountnumber: accountnumber,
        };

        const headers = PaymentService.getMoolreHeaders(gateway);
        const payResponse = await fetch(`${baseUrl}/open/transact/payment`, {
            method: 'POST', headers, body: JSON.stringify(body)
        });

        const payRaw  = await payResponse.text();
        let payData;
        try { payData = JSON.parse(payRaw); } catch { return; }

        if (payData.code === 'TP13' || String(payData.status ?? '') === '1') {
            const gatewayRef = payData.data?.transactionid || payData.data?.id || '';
            if (gatewayRef) {
                await PaymentTransaction.updateOne({ transactionId }, { $set: { gatewayTransactionId: gatewayRef } });
            }
        }
    } catch (err) {
        console.error('[trigger-ussd] Error:', err.message);
    }
});

// Verify OTP for Moolre payment (called when Moolre returns TP14 on initiation)
// Responds immediately then triggers the actual Moolre OTP verification + USSD push
// as a separate self-call to avoid Vercel's 10-second function timeout.
app.post('/api/payment/verify-otp', async (req, res) => {
    try {
        const { transactionId, otpCode } = req.body;
        if (!transactionId || !otpCode) {
            return res.status(400).json({ success: false, message: 'transactionId and otpCode are required' });
        }

        // Check transaction exists first (fast DB lookup)
        const transaction = await PaymentTransaction.findOne({ transactionId });
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // Respond immediately — the actual Moolre calls happen in a separate invocation
        res.json({ success: true, transactionId, message: 'OTP received. A payment prompt will be sent to your phone.' });

        // Fire the actual OTP verification as a separate Vercel function invocation
        const backendUrl = process.env.BACKEND_URL || 'https://youngster-backend.vercel.app';
        fetch(`${backendUrl}/api/payment/process-otp-internal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionId, otpCode }),
        }).catch(() => {});

    } catch (err) {
        if (!res.headersSent) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
});

// Internal: performs the actual Moolre OTP verification + USSD push
// Called as a fire-and-forget self-call from /api/payment/verify-otp
app.post('/api/payment/process-otp-internal', async (req, res) => {
    const { transactionId, otpCode } = req.body || {};
    if (!transactionId || !otpCode) {
        return res.json({ ok: false, error: 'missing params' });
    }

    try {
        // Run verifyOtp BEFORE responding — on Vercel, code after res.json() is killed.
        await PaymentService.verifyOtp(transactionId, String(otpCode).trim());
        res.json({ ok: true });
    } catch (err) {
        console.error('❌ Internal OTP processing error:', err.message);
        // Mark transaction so frontend polling can detect the failure
        await PaymentTransaction.updateOne(
            { transactionId },
            { $set: { status: 'failed', errorMessage: err.message } }
        ).catch(() => {});
        res.json({ ok: false, error: err.message });
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
            // Reload as a live Mongoose document — result.transaction is a plain
            // object from PaymentService and .save() / field checks won't work on it.
            const liveTx = await PaymentTransaction.findOne({ transactionId: txId });
            if (liveTx) {
                await createPaidOrderRecords(liveTx, liveTx.paymentGateway);
            }
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
                                status: 'Completed',
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
                completed: normalizedStatus === 'Completed' ? new Date() : undefined,
                lastStatusUpdate: new Date()
            },
            { new: true }
        );

        if (order) {
            await ProviderAPILog.findOneAndUpdate(
                { orderId: order._id },
                {
                    status: normalizedStatus === 'Completed' ? 'success' : normalizedStatus === 'Failed' ? 'failed' : 'processing',
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

// ==================== VERCEL CRON: ORDER STATUS UPDATER ====================
// Called by Vercel Cron every 10 minutes to check pending/processing orders.
// Secured with CRON_SECRET env var — set the same value in Vercel project settings.
// Vercel cron config is in vercel.json.
app.get('/api/cron/update-order-status', async (req, res) => {
    // Verify the request is from Vercel Cron (or allow local dev without secret)
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const authHeader = req.headers['authorization'];
        if (authHeader !== `Bearer ${secret}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        const { checkPendingOrders } = require('./order-status-updater');
        await checkPendingOrders();
        res.json({ success: true, message: 'Order status check completed', timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[Cron] Order status update error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== START SERVER ====================
// On Vercel, module.exports = app is used and listen is not called.
// Locally, listen on PORT as normal.
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        startOrderStatusUpdater();
    });
}

module.exports = app;
