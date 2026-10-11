const mongoose = require('mongoose');
const { ACTIVITY_TYPES, RELATED_MODELS } = require('../utils/constants');

const { Schema } = mongoose;

const activitySchema = new Schema(
  {
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
    // Only Pending / Completed are stored; "Overdue" is computed from dueDate (see toJSON and activityStatusFilter).
    status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    relatedModel: { type: String, enum: RELATED_MODELS },
    relatedTo: { type: Schema.Types.ObjectId, refPath: 'relatedModel' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    outcome: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

activitySchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
activitySchema.index({ relatedModel: 1, relatedTo: 1, createdAt: -1 });
activitySchema.index({ dueDate: 1 });
activitySchema.index({ createdBy: 1 });
activitySchema.index({ createdAt: -1 });

activitySchema.virtual('isOverdue').get(function isOverdue() {
  return this.status === 'Pending' && !!this.dueDate && this.dueDate < new Date();
});

activitySchema.set('toJSON', {
  virtuals: false,
  transform(doc, ret) {
    if (ret.status === 'Pending' && ret.dueDate && new Date(ret.dueDate) < new Date()) ret.status = 'Overdue';
    delete ret.__v;
    delete ret.id;
    return ret;
  },
});

module.exports = mongoose.model('Activity', activitySchema);
