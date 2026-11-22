// User model: account details, hashed password and personal preferences (time zone, signature).
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false }, // never returned by queries unless asked for
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    timezone: { type: String, default: 'UTC' }, // used later to resolve "tomorrow 3pm" etc.
    signature: { type: String, default: '', maxlength: 500 },
    tokenVersion: { type: Number, default: 0, select: false }, // bump to log out every device
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
