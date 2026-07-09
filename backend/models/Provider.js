const mongoose = require('mongoose');
const providerSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    logoUrl: { type: String, default: '' },

    // API Configuration
    apiConfig: {
        enabled: { type: Boolean, default: false },
        type: { type: String, enum: ['bearer-token', 'api-key', 'oauth', 'custom'], default: 'bearer-token' },
        baseUrl: { type: String, default: '' },

        // Authentication
        authMethod: { type: String, enum: ['header', 'query', 'body'], default: 'header' },
        authHeaderName: { type: String, default: 'Authorization' },
        authHeaderValue: { type: String, default: '' },

        // Order Endpoint
        orderEndpoint: { type: String, default: '' },
        orderMethod: { type: String, enum: ['POST', 'PUT', 'GET'], default: 'POST' },

        // Request payload mapping
        // Maps our internal field names to API field names
        // e.g. { "network": "networkKey", "phoneNumber": "recipient", "capacity": "capacity" }
        requestPayloadMapping: { type: mongoose.Schema.Types.Mixed, default: {} },

        // Status check endpoint
        statusEndpoint: { type: String, default: '' },
        statusMethod: { type: String, enum: ['GET', 'POST'], default: 'GET' },
        statusPayloadMapping: { type: mongoose.Schema.Types.Mixed, default: {} },

        // Balance endpoint
        balanceEndpoint: { type: String, default: '' },
        balanceMethod: { type: String, enum: ['GET', 'POST'], default: 'GET' },

        // Rate limiting
        rateLimitDelay: { type: Number, default: 60000 },

        // Response handling
        successField: { type: String, default: 'success' },
        dataField: { type: String, default: 'data' },

        // Phone number format sent to this API
        // 'international'/'e164' = 233XXXXXXXXX or +233XXXXXXXXX
        // 'national'/'local'     = 0XXXXXXXXX (required by iGet)
        // 'raw'                  = XXXXXXXXX
        phoneFormat: { type: String, enum: ['international', 'e164', 'national', 'local', 'raw'], default: 'international' },

        // Fixed network key sent to the API regardless of provider name.
        // e.g. DataHub MTN requires "YELLO". Leave blank to use the provider name.
        networkKey: { type: String, default: '' },

        // When true, capacity is sent as a string ("1") instead of a number (1).
        // Required by DataHub; iGet and XpresPortal expect a number.
        capacityAsString: { type: Boolean, default: false },

        // Additional headers
        additionalHeaders: { type: mongoose.Schema.Types.Mixed, default: {} }
    },

    // Package Price Mapping (which price maps to which API capacity)
    packageMapping: [
        {
            packageName: String,                       // e.g. "1GB", "5GB"
            apiCapacity: mongoose.Schema.Types.Mixed,  // e.g. 1, 5
            apiNetwork: String,                        // override bundleType per-package e.g. "Telecel-5959"
            price: Number
        }
    ],

    order: { type: Number, default: 999 },

    // Order routing configuration (set via admin panel)
    orderRouting: {
        handler:       { type: String, default: '' }, // 'auto', 'api', 'whatsapp'
        whatsappMinGb: { type: Number },
        whatsappMaxGb: { type: Number },
        apiMinGb:      { type: Number },
        apiMaxGb:      { type: Number }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Provider', providerSchema);
