const mongoose = require('mongoose');

const whitelistedNumberSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true },
    gateway: { type: String, default: 'Korba', index: true },
    whitelistedAt: { type: Date, default: Date.now },
    lastVerifiedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    metadata: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model('WhitelistedNumber', whitelistedNumberSchema);
