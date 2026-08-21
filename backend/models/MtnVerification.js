const mongoose = require('mongoose');

const mtnVerificationSchema = new mongoose.Schema({
    // The dealer who submitted the numbers
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    storeSlug: { type: String, index: true, default: null },
    username:  { type: String, default: '' },

    // The phone numbers the dealer pasted in (one per line, cleaned server-side)
    numbers:   { type: [String], required: true },

    // Optional note the dealer can add
    note:      { type: String, default: '' },

    submitted: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MtnVerification', mtnVerificationSchema);
