const mongoose = require('mongoose');

const providerAPILogSchema = new mongoose.Schema({
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    providerName: String,
    
    // Order details
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    phoneNumber: String,
    packageName: String,
    price: Number,
    
    // API request details
    apiEndpoint: String,
    apiMethod: String,
    requestPayload: mongoose.Schema.Types.Mixed,
    
    // API response details
    responseStatus: Number,
    responseData: mongoose.Schema.Types.Mixed,
    apiReference: String, // Reference returned by external API
    
    // Status tracking
    status: { type: String, enum: ['pending', 'processing', 'success', 'failed', 'timeout'], default: 'pending' },
    errorMessage: String,
    
    // Timestamps
    requestTime: { type: Date, default: Date.now },
    responseTime: Date,
    
    // Retry information
    retryCount: { type: Number, default: 0 },
    lastRetryTime: Date
});

module.exports = mongoose.model('ProviderAPILog', providerAPILogSchema);
