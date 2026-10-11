const mongoose = require('mongoose');
const { CUSTOMER_STATUSES } = require('../utils/constants');

const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    street: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true },
    company: { type: String, trim: true, maxlength: 150 },
    address: { type: addressSchema },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null }, // original lead
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'Active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

customerSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
// One customer per lead: also makes double conversion impossible at the database level.
customerSchema.index({ lead: 1 }, { unique: true, partialFilterExpression: { lead: { $type: 'objectId' } } });
customerSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
customerSchema.index({ createdBy: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ name: 1 });

customerSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Customer', customerSchema);
