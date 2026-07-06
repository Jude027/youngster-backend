const mongoose = require('mongoose');
const masterPriceSchema = new mongoose.Schema({
    provider: { type: String, required: true },
    packageName: { type: String, required: true },
    clientType: { type: String, required: true },  // e.g., "Dealers", "Agents", "Customers"
    originalPrice: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});
// Ensure unique combination
masterPriceSchema.index({ provider: 1, packageName: 1, clientType: 1 }, { unique: true });
module.exports = mongoose.model('MasterPrice', masterPriceSchema);