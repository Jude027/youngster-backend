const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    beneficiary_phone: String,
    description: { type: String, default: 'Wallet Topup' },
    balance_before: Number,
    amount: Number,
    method: { type: String, enum: ['Mobile Money','Bank','Card','Cash'], default: 'Mobile Money' },
    created: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending','complete','failed'], default: 'pending' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    storeSlug: { type: String, index: true },
    clientType: String
});

module.exports = mongoose.model('Transaction', transactionSchema);
