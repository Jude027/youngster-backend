const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

    providerReference: {
        type: String,
        index: true
    },
    providerOrderId: String,
    lastStatusUpdate: Date,
});

module.exports = mongoose.model('Order', orderSchema);
