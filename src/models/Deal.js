const mongoose = require('mongoose');
const { DEAL_STAGES, DEAL_STATUSES } = require('../utils/constants');

const { Schema } = mongoose;

const dealSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Number, required: true, min: [0.01, 'Deal value must be greater than zero'] },
    probability: { type: Number, required: true, min: 0, max: 100 },
    expectedRevenue: { type: Number, default: 0 }, // always server-calculated
    expectedClosingDate: { type: Date, required: true },
    actualClosingDate: { type: Date },
    stage: { type: String, enum: DEAL_STAGES, default: 'Qualification' },
    status: { type: String, enum: DEAL_STATUSES, default: 'open' }, // derived from stage
    lostReason: { type: String, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Single place where the money / status invariants are enforced.
dealSchema.pre('validate', function enforceInvariants(next) {
  if (this.stage === 'Won') {
    this.probability = 100;
    this.status = 'won';
    this.expectedRevenue = this.value;
  } else if (this.stage === 'Lost') {
    this.probability = 0;
    this.status = 'lost';
    this.expectedRevenue = 0;
  } else {
    this.status = 'open';
    if (typeof this.value === 'number' && typeof this.probability === 'number') {
      this.expectedRevenue = Math.round(this.value * this.probability) / 100; // = value * probability / 100, to 2dp
    }
  }
  if (this.stage === 'Lost' && !this.lostReason) {
    return next(new mongoose.Error.ValidatorError({ message: 'A lost deal requires a reason', path: 'lostReason' }));
  }
  next();
});

dealSchema.index({ stage: 1, createdAt: -1 });
dealSchema.index({ assignedTo: 1, stage: 1 });
dealSchema.index({ customer: 1 });
dealSchema.index({ lead: 1 });
dealSchema.index({ status: 1, value: 1 });
dealSchema.index({ expectedClosingDate: 1 });
dealSchema.index({ actualClosingDate: 1 });
dealSchema.index({ createdBy: 1 });
dealSchema.index({ createdAt: -1 });

dealSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Deal', dealSchema);
