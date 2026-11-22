// User model: account details, hashed password, preferences (time zone, signature),
// account status (disabled by an admin) and this month's AI usage (for the spending cap).
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false }, // never returned by queries unless asked for
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    timezone: { type: String, default: 'UTC' }, // used to resolve "tomorrow 3pm" etc.
    signature: { type: String, default: '', maxlength: 500 },
    tokenVersion: { type: Number, default: 0, select: false }, // bump to log out every device
    disabled: { type: Boolean, default: false }, // set by an admin; blocks login and all AI use
    monthlyBudgetUsd: { type: Number, min: 0 }, // per-user override of USER_MONTHLY_BUDGET_USD (empty = default)
    // AI usage for the current calendar month (reset automatically when the month changes)
    usage: {
      month: String, // "2026-11"
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
      cacheWriteTokens: { type: Number, default: 0 },
      webSearches: { type: Number, default: 0 },
      costUsd: { type: Number, default: 0 }, // estimated from token counts and configured prices
    },
  },
  {
    timestamps: true,
    // Shape of the user object sent to the client (hide secrets and Mongo internals)
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.tokenVersion;
        return ret;
      },
    },
  }
);

// Hashes and stores a plain-text password
userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

// Checks a plain-text password against the stored hash (query must select +passwordHash)
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);
