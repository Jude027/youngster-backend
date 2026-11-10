const mongoose = require('mongoose');

// Per-number capture entry — one document per phone number event.
// This replaces the old batch-submission model (which stored arrays of numbers
// in a single document) with a granular per-number record that supports
// filtering, deduplication, and enriched metadata.
const mtnVerificationSchema = new mongoose.Schema({
    // ── Phone identity ────────────────────────────────────────────────────────
    phoneNumber: { type: String, required: true, index: true },

    // ── Status ────────────────────────────────────────────────────────────────
    // 'unverified'  — number failed all verification providers
    // 'verified'    — number passed at least one provider
    // 'pending'     — submitted by dealer/agent for manual admin review
    status: {
        type: String,
        enum: ['unverified', 'verified', 'pending'],
        default: 'unverified',
        index: true
    },

    // ── Network / provider info ───────────────────────────────────────────────
    network: { type: String, default: 'MTN', index: true }, // MTN, Telecel, AT, etc.
    verifiedBy:   { type: String, default: null },  // Mamsco, DataMart, XpresPortal, DataHub, null
    rejectedBy:   { type: String, default: null },  // which provider gave definitive rejection
    rejectionCode: { type: String, default: null },  // e.g. RECIPIENT_NOT_VERIFIED_FOR_RESTRICTED_MTN_PROVIDER

    // ── Source of capture ────────────────────────────────────────────────────
    // 'auto_order'       — captured automatically from a paid order (isUnverified=true)
    // 'auto_verify'      — captured automatically from verify-beneficiary endpoint
    // 'agent_submission' — dealer/agent manually submitted via MTN Verification page
    // 'storefront'       — customer-facing storefront purchase
    source: {
        type: String,
        enum: ['auto_order', 'auto_verify', 'agent_submission', 'storefront'],
        default: 'auto_verify',
        index: true
    },

    // ── Order context (when captured from an order) ───────────────────────────
    orderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    packageName: { type: String, default: null },
    amount:      { type: Number, default: null },

    // ── Dealer / store context ────────────────────────────────────────────────
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    storeSlug: { type: String, index: true, default: null },
    username:  { type: String, default: '' },
    clientType: { type: String, default: null },

    // ── Optional note (from dealer submission) ────────────────────────────────
    note: { type: String, default: '' },

    // ── Timestamps ────────────────────────────────────────────────────────────
    capturedAt: { type: Date, default: Date.now, index: true },
});

// Compound index for common admin queries
mtnVerificationSchema.index({ network: 1, status: 1, capturedAt: -1 });
mtnVerificationSchema.index({ storeSlug: 1, capturedAt: -1 });
mtnVerificationSchema.index({ phoneNumber: 1, capturedAt: -1 });

module.exports = mongoose.model('MtnVerification', mtnVerificationSchema);
