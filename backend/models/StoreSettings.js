const mongoose = require('mongoose');

const storeSettingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    storeName: { type: String, default: 'Youngster Data Shop' },
    storeSlug: { type: String, default: '' },
    previousSlugs: { type: [String], default: [] },
    storeDescription: { type: String, default: 'Your trusted partner for data services' },
    storeLogo: { type: String, default: '' },
    whatsappGroupLink: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StoreSettings', storeSettingsSchema);