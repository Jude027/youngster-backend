const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Commission = require('./Commission');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    fullname: { type: String, required: true },
    businessName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    // REMOVED enum restriction – role can now be any string (matching client types)
    role: { type: String, default: 'customer' },
    createdAt: { type: Date, default: Date.now },
    storeLogo: { type: String, default: '' },
    storeDescription: { type: String, default: 'Your trusted partner for data services' },
    whatsappGroupLink: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    availableBalance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    permittedClientTypes: { type: [String], default: [] },
});

// Helper to recalculate user's available balance from commissions
async function updateUserBalance(userId) {
    const result = await Commission.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'available' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const balance = result.length ? result[0].total : 0;
    await mongoose.model('User').findByIdAndUpdate(userId, { availableBalance: balance });
    return balance;
}

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
