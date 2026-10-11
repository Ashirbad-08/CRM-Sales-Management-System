const mongoose = require('mongoose');
const { LEAD_SOURCES, LEAD_STATUSES, PRIORITIES } = require('../utils/constants');

const { Schema } = mongoose;

const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true },
    company: { type: String, trim: true, maxlength: 150 },
    source: { type: String, enum: LEAD_SOURCES, required: true },
    status: { type: String, enum: LEAD_STATUSES, default: 'New' },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    description: { type: String, trim: true, maxlength: 2000 },
    statusReason: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Conversion links (Lead -> Customer -> Deal)
    convertedAt: { type: Date, default: null },
    convertedCustomer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    convertedDeal: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
  },
  { timestamps: true }
);

// Email is unique when present (a lead may be captured by phone only).
leadSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
leadSchema.index({ source: 1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ createdBy: 1 });
leadSchema.index({ createdAt: -1 });

leadSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Lead', leadSchema);
