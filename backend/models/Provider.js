const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
    name:    { type: String, required: true, unique: true },
    logoUrl: { type: String, default: '' },

    // Primary / legacy single config — kept as Mixed for backwards compatibility
    apiConfig: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Multi-config array — each entry is a full API configuration object
    apiConfigs: {
        type: [{
            name:                  { type: String, default: 'Default' },
            enabled:               { type: Boolean, default: false },
            type:                  { type: String, enum: ['bearer-token', 'api-key', 'oauth', 'custom'], default: 'bearer-token' },
            baseUrl:               { type: String, default: '' },
            authMethod:            { type: String, enum: ['header', 'query', 'body'], default: 'header' },
            authHeaderName:        { type: String, default: 'Authorization' },
            authHeaderValue:       { type: String, default: '' },
            orderEndpoint:         { type: String, default: '' },
            orderMethod:           { type: String, enum: ['POST', 'PUT', 'GET'], default: 'POST' },
            requestPayloadMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
            statusEndpoint:        { type: String, default: '' },
            statusMethod:          { type: String, enum: ['GET', 'POST'], default: 'GET' },
            statusPayloadMapping:  { type: mongoose.Schema.Types.Mixed, default: {} },
            balanceEndpoint:       { type: String, default: '' },
            balanceMethod:         { type: String, enum: ['GET', 'POST'], default: 'GET' },
            rateLimitDelay:        { type: Number, default: 60000 },
            successField:          { type: String, default: 'success' },
            dataField:             { type: String, default: 'data' },
            phoneFormat:           { type: String, enum: ['international', 'e164', 'national', 'local', 'raw'], default: 'international' },
            networkKey:            { type: String, default: '' },
            capacityAsString:      { type: Boolean, default: false },
            forUnverifiedNumbers:  { type: Boolean, default: false },
            additionalHeaders:     { type: mongoose.Schema.Types.Mixed, default: {} },
        }],
        default: []
    },

    // Package Price Mapping
    packageMapping: [{
        packageName: String,
        apiCapacity: mongoose.Schema.Types.Mixed,
        apiNetwork:  String,
        price:       Number
    }],

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
