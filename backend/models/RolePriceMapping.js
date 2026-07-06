const mongoose = require('mongoose');

// Maps a user role (e.g. "Dealers") to the BasePrice clientType column
// whose price should appear as "Original Price" on that role's referral page.
// e.g. { role: "Dealers", basePriceClientType: "Dealers" }
//      { role: "Agents",  basePriceClientType: "Agents"  }
const rolePriceMappingSchema = new mongoose.Schema({
    role: { type: String, required: true, unique: true },
    basePriceClientType: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RolePriceMapping', rolePriceMappingSchema);
