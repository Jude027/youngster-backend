const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    // userId = the dealer (store owner) whose referral link this guest came through.
    // Resolved server-side from storeSlug — not sent from the browser.
    // default: null instead of required: true because the value is assigned
    // after the request arrives, not before Mongoose validation runs.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    beneficiary: String,
    phoneNumber: String,
    package: String,
    providerName: String,

    packageName: String,
    bundleSize: String,
    bundle_size: String,
    bundle: String,

    balanceBefore: Number,
    amount: Number,
    price: Number,
    balanceAfter: Number,

    created: { type: Date, default: Date.now },
    completed: Date,

    status: {
        type: String,
        enum: [
            'Pending',
            'Processing',
            'Completed',
            'Failed',
            'Cancelled/Refunded',
            'Resolved'
        ],
        default: 'Pending'
    },

    report: String,
    storeSlug: { type: String, index: true },
    clientType: String,

    // Unique ID generated in the customer's browser on first storefront visit.
    // Allows guests to see only their own orders without requiring login.
    guestSessionId: { type: String, index: true, default: null },

    providerReference: { type: String, index: true },
    providerOrderId: String,
    lastStatusUpdate: Date,
    transactionId: { type: String, index: true, sparse: true },

    // True when the beneficiary number failed the DataHub verification check.
    // These orders are left pending and must be fulfilled manually by the admin.
    isUnverified: { type: Boolean, default: false },
});

module.exports = mongoose.model('Order', orderSchema);
