const mongoose = require('mongoose');

const referralPriceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: String,
    packageName: String,
    clientType: String, // Dealer, Super-agent, Agent, Sub-agent, Customer
    price: Number,
    originalPrice: Number,
    updatedAt: { type: Date, default: Date.now }
});

referralPriceSchema.index({ userId: 1, provider: 1, packageName: 1, clientType: 1 }, { unique: true });

module.exports = mongoose.model('ReferralPrice', referralPriceSchema);