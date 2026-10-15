const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: Number,
    source: { type: String, enum: ['order', 'referral', 'bonus'] },
    sourceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    description: String,
    // Stable key prevents duplicate credits if payment callbacks race/retry.
    idempotencyKey: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ['pending', 'available', 'withdrawn'], default: 'available', index: true },

    // Immutable order-time snapshot used for commission traceability.
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    paymentTransactionId: { type: String, index: true },
    gatewayTransactionId: String,
    storeSlug: String,
    clientType: String,
    provider: String,
    packageName: String,
    sellingPrice: Number,
    originalPriceUsed: Number,
    expectedAmount: Number,
    creditedAmount: Number,
    pricingUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gatewayName: String,
    calculationVersion: { type: String, default: 'selling-minus-original-v1' },
    auditStatus: { type: String, enum: ['unreviewed', 'matched', 'needs-investigation'], default: 'unreviewed' },

    createdAt: { type: Date, default: Date.now, index: true },
    withdrawnAt: Date
}, { minimize: false });

commissionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Commission', commissionSchema);
