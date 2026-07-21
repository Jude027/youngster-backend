const mongoose = require('mongoose');

// Display config controls how the generic-package.html page looks for this
// provider — header colour, note text, which fields to show, label overrides.
// Stored once per provider (duplicated across packageName/clientType rows is
// harmless since the frontend just reads the first match for a given provider).
const displayConfigSchema = new mongoose.Schema({
    headerColor: { type: String, default: '' },  // e.g. '#6a11cb'
    headerGradient: { type: String, default: '' },  // optional full CSS gradient override
    pageTitle: { type: String, default: '' },  // e.g. "Buy MyProvider Bundle"
    pageSubtitle: { type: String, default: '' },
    noteText: { type: String, default: '' },  // note box message; empty hides the note box
    showPortedCheckbox: { type: Boolean, default: true },
    showPrefixes: { type: Boolean, default: true },
    validPrefixes: { type: String, default: '' },  // e.g. "024, 054, 055"
    bundleLabel: { type: String, default: 'Package' },   // "Select Bundle" -> "Select {bundleLabel}"
    purchaseLabel: { type: String, default: 'Purchase Package' },
    deliveryText: { type: String, default: 'Fast delivery' },
    validity: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    storefrontSection: { type: String, default: 'data_bundle' } // 'data_bundle' or 'special_offers'
}, { _id: false });

const basePriceSchema = new mongoose.Schema({
    provider: { type: String, required: true },
    packageName: { type: String, required: true },
    clientType: { type: String, required: true },
    price: { type: Number, required: true },
    displayConfig: { type: displayConfigSchema, default: () => ({}) }
});

// Composite unique index
basePriceSchema.index({ provider: 1, packageName: 1, clientType: 1 }, { unique: true });

module.exports = mongoose.model('BasePrice', basePriceSchema);
