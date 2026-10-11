const mongoose = require('mongoose');

const { Schema } = mongoose;

// Key/value CRM configuration (managed by admins).
const configSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, trim: true, maxlength: 300 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

configSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Config', configSchema);
