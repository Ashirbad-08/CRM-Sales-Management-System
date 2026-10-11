const mongoose = require('mongoose');
const { TIMELINE_ACTIONS, TIMELINE_ENTITIES } = require('../utils/constants');

const { Schema } = mongoose;

const timelineSchema = new Schema(
  {
    action: { type: String, enum: Object.values(TIMELINE_ACTIONS), required: true },
    entityType: { type: String, enum: TIMELINE_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

timelineSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
timelineSchema.index({ performedBy: 1, timestamp: -1 });
timelineSchema.index({ action: 1 });

// Audit entries are append-only.
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'replaceOne', 'deleteOne', 'deleteMany'].forEach((op) => {
  timelineSchema.pre(op, function blockMutation(next) {
    next(new Error('Timeline entries are immutable'));
  });
});

timelineSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Timeline', timelineSchema);
