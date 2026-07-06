const mongoose = require('mongoose');
const commissionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: Number,
    source: { type: String, enum: ['order', 'referral', 'bonus'] },
    sourceId: mongoose.Schema.Types.ObjectId,
    description: String,
    status: { type: String, enum: ['pending', 'available', 'withdrawn'], default: 'available' },
    createdAt: { type: Date, default: Date.now },
    withdrawnAt: Date
});
module.exports = mongoose.model('Commission', commissionSchema);