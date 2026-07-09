const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    // userId = the dealer (store owner) whose referral link this guest came through.
    // Resolved server-side from storeSlug — not sent from the browser.
    // default: null instead of required: true because the value is assigned
    // after the request arrives, not before Mongoose validation runs.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    beneficiary_phone: String,
    description: { type: String, default: 'Wallet Topup' },
    balance_before: Number,
    amount: Number,
    method: { type: String, enum: ['Mobile Money', 'Bank', 'Card', 'Cash'], default: 'Mobile Money' },
    created: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    storeSlug: { type: String, index: true },
    clientType: String,

    // Unique ID generated in the customer's browser on first storefront visit.
    // Allows guests to see only their own transactions without requiring login.
    guestSessionId: { type: String, index: true, default: null },
});

module.exports = mongoose.model('Transaction', transactionSchema);
