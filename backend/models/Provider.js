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
        authHeaderName: { type: String, default: 'Authorization' }, // e.g., "Authorization", "X-API-Key"
        authHeaderValue: { type: String, default: '' }, // e.g., "Bearer TOKEN" or just "TOKEN"
        
        // Order Endpoint
        orderEndpoint: { type: String, default: '' }, // e.g., "/v1/purchaseBundle"
        orderMethod: { type: String, enum: ['POST', 'PUT', 'GET'], default: 'POST' },
        
        // Request payload mapping
        requestPayloadMapping: {
            // Maps our field names to API field names
            // e.g., { "network": "network", "phoneNumber": "msisdn", "capacity": "capacity", "reference": "reference" }
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        
        // Status check endpoint
        statusEndpoint: { type: String, default: '' }, // e.g., "/v1/checkOrderStatus/:reference"
        statusMethod: { type: String, enum: ['GET', 'POST'], default: 'GET' },
        statusPayloadMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
        
        // Balance endpoint
        balanceEndpoint: { type: String, default: '' },
        balanceMethod: { type: String, enum: ['GET', 'POST'], default: 'GET' },
        
        // Rate limiting
        rateLimitDelay: { type: Number, default: 60000 }, // milliseconds between requests
        
        // Response handling
        successField: { type: String, default: 'success' }, // Path to success indicator, e.g., "success" or "data.status"
        dataField: { type: String, default: 'data' }, // Path to response data
        
        // Phone number format sent to this API
        // 'international'/'e164' = 233XXXXXXXXX or +233XXXXXXXXX depending on handler
        // 'national'/'local'     = 0XXXXXXXXX   (required by iGet)
        // 'raw'                  = XXXXXXXXX
        phoneFormat: { type: String, enum: ['international', 'e164', 'national', 'local', 'raw'], default: 'international' },

        // Additional headers
        additionalHeaders: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    
    // Package Price Mapping (which price maps to which API capacity)
    packageMapping: [
        {
            packageName: String,        // e.g. "1GB", "5GB"
            apiCapacity: mongoose.Schema.Types.Mixed, // e.g. 1, 5
            apiNetwork: String,         // override bundleType per-package e.g. "Telecel-5959"
            price: Number
        }
    ],
    
    order: { type: Number, default: 999 },

    // Order routing configuration (set via admin panel)
    orderRouting: {
        handler:       { type: String, default: '' }, // e.g. 'auto', 'api', 'whatsapp'
        whatsappMinGb: { type: Number },
        whatsappMaxGb: { type: Number },
        apiMinGb:      { type: Number },
        apiMaxGb:      { type: Number }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Provider', providerSchema);
