const mongoose = require('mongoose');

// Reusable sub-schema for a single API configuration entry.
// Both the single `apiConfig` field and every entry in the `apiConfigs` array
// share this same shape so the handler and admin UI can treat them identically.
const apiConfigSchema = new mongoose.Schema({
    // Human-readable label shown in the admin "Saved API Configuration" dropdown.
    // e.g. "DataHub (verified)", "iGet (unverified numbers)"
    name: { type: String, default: 'Default' },

    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ['bearer-token', 'api-key', 'oauth', 'custom'], default: 'bearer-token' },
    baseUrl: { type: String, default: '' },

    authMethod: { type: String, enum: ['header', 'query', 'body'], default: 'header' },
    authHeaderName: { type: String, default: 'Authorization' },
    authHeaderValue: { type: String, default: '' },

    orderEndpoint: { type: String, default: '' },
    orderMethod: { type: String, enum: ['POST', 'PUT', 'GET'], default: 'POST' },

    requestPayloadMapping: { type: mongoose.Schema.Types.Mixed, default: {} },

    statusEndpoint: { type: String, default: '' },
    statusMethod: { type: String, enum: ['GET', 'POST'], default: 'GET' },
    statusPayloadMapping: { type: mongoose.Schema.Types.Mixed, default: {} },

    balanceEndpoint: { type: String, default: '' },
    balanceMethod: { type: String, enum: ['GET', 'POST'], default: 'GET' },

    rateLimitDelay: { type: Number, default: 60000 },

    successField: { type: String, default: 'success' },
    dataField: { type: String, default: 'data' },

    phoneFormat: { type: String, enum: ['international', 'e164', 'national', 'local', 'raw'], default: 'international' },
    networkKey: { type: String, default: '' },
    capacityAsString: { type: Boolean, default: false },

    // When true, this config is used only for orders where the beneficiary
    // number failed verification.  The primary config handles verified numbers.
    forUnverifiedNumbers: { type: Boolean, default: false },

    additionalHeaders: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: true });

const providerSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    logoUrl: { type: String, default: '' },

    // ── Primary / legacy single config ────────────────────────────────────────
    // Kept for backwards compatibility.  New code should prefer `apiConfigs`.
    apiConfig: apiConfigSchema,

    // ── Multi-config array ─────────────────────────────────────────────────────
    // Allows one provider to have multiple API configurations, e.g.:
    //   [0] DataHub — for verified numbers
    //   [1] iGet    — for unverified/ported numbers (forUnverifiedNumbers: true)
    // UniversalAPIHandler picks the right entry based on the `isUnverified` flag.
    apiConfigs: { type: [apiConfigSchema], default: [] },

    // Package Price Mapping (which price maps to which API capacity)
    packageMapping: [
        {
            packageName: String,
            apiCapacity: mongoose.Schema.Types.Mixed,
            apiNetwork: String,
            price: Number
        }
    ],

    order: { type: Number, default: 999 },

    orderRouting: {
        handler:       { type: String, default: '' },
        whatsappMinGb: { type: Number },
        whatsappMaxGb: { type: Number },
        apiMinGb:      { type: Number },
        apiMaxGb:      { type: Number }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Provider', providerSchema);
