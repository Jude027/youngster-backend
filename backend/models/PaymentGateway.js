const mongoose = require('mongoose');

const paymentGatewaySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g., "Korba Xchange"
    type: { type: String, enum: ['collections', 'hosted-checkout', 'direct-card'], default: 'collections' },
    enabled: { type: Boolean, default: false },
    
    // Authentication — Moolre uses 4 header-based keys
    apiUser:    { type: String, default: '' }, // X-API-USER  (your Moolre username)
    apiKey:     { type: String, default: '' }, // X-API-KEY   (your Moolre API key)
    pubKey:     { type: String, default: '' }, // X-API-PUBKEY (public key for collections)
    vasKey:     { type: String, default: '' }, // X-API-VASKEY (VAS key for data/airtime)

    // Legacy / other gateway fields kept for backwards compatibility
    clientId:   { type: String, default: '' },
    clientKey:  { type: String, default: '' },
    secretKey:  { type: String, default: '' },
    testClientId: { type: String, default: '' },
    
    // API Configuration
    apiBaseUrl: { type: String, default: '' }, // e.g., https://testxchange.korba365.com/api/v1.0
    collectEndpoint: { type: String, default: '/collect' }, // For collections
    checkoutEndpoint: { type: String, default: '/checkout' }, // For hosted checkout
    statusEndpoint: { type: String, default: '/transaction_status' }, // Check transaction status
    
    // Callback Configuration
    callbackUrl: { type: String, default: '' }, // Where gateway sends payment status
    redirectUrl: { type: String, default: '' }, // Where to redirect after payment
    
    // Payment Methods Supported
    paymentMethods: {
        mobileMoney: { type: Boolean, default: true }, // MTN, Vodafone, etc.
        card: { type: Boolean, default: true }, // Debit/Credit Card
        bankTransfer: { type: Boolean, default: false }
    },
    
    // Fees & Charges
    transactionFee: { type: Number, default: 0 }, // Fee per transaction (fixed amount)
    transactionFeePercent: { type: Number, default: 0 }, // Fee as percentage
    minAmount: { type: Number, default: 0.5 }, // Minimum transaction amount
    maxAmount: { type: Number, default: 10000 }, // Maximum transaction amount
    
    // Network code mapping for Moolre API
    // Moolre accepts: "MTN", "VODAFONE", "AIRTELTIGO"
    networkMapping: {
        type: mongoose.Schema.Types.Mixed,
        default: {
            'MTN':        'MTN',
            'Telecel':    'VODAFONE',
            'AirtelTigo': 'AIRTELTIGO',
            'Vodafone':   'VODAFONE',
            'AT':         'AIRTELTIGO'
        }
    },
    
    // Test/Live Mode
    isTestMode: { type: Boolean, default: true },
    testClientKey: { type: String, default: '' },
    testSecretKey: { type: String, default: '' },
    
    // Additional Configuration
    authMethod: { type: String, enum: ['hmac', 'bearer-token', 'api-key', 'moolre-headers'], default: 'moolre-headers' },
    additionalHeaders: { type: mongoose.Schema.Types.Mixed, default: {} },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentGateway', paymentGatewaySchema);
