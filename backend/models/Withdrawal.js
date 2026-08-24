const mongoose = require('mongoose');
const withdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 30, max: 5000 },
    provider: { type: String, enum: ['mtn', 'telecel', 'airteltigo'], required: true },
    phoneNumber: String,
    accountName: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    adminNotes: String,
    processedAt: Date,
    createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Withdrawal', withdrawalSchema);
