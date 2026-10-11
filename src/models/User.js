const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { ROLES } = require('../utils/constants');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.EXECUTIVE },
    isActive: { type: Boolean, default: true },
    // Team structure: a sales executive reports to a sales manager.
    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Bumped on logout-all / password change / deactivation to invalidate every issued token.
    tokenVersion: { type: Number, default: 0, select: false },
    // Hashed refresh tokens (one per device, max 5, rotated on use).
    refreshTokens: { type: [new Schema({ hash: String, expiresAt: Date }, { _id: false })], select: false, default: [] },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ manager: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ name: 1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, config.bcryptRounds);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
