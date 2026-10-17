const mongoose = require('mongoose');
const referralLinkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  storeSlug: { type: String, required: true, index: true },
  clientType: { type: String, required: true },
  token: { type: String, required: true, unique: true, index: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });
referralLinkSchema.index({ userId: 1, clientType: 1, active: 1 });
module.exports = mongoose.model('ReferralLink', referralLinkSchema);
