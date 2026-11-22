// Integration model: a connected external account (Google) with its OAuth tokens stored encrypted.
import mongoose from 'mongoose';

const integrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['google'], required: true },
    accountEmail: String,
    scopes: [String], // permissions the user actually granted (they can untick some on Google's screen)
    accessTokenEnc: { type: String, select: false }, // encrypted, never sent to the client
    refreshTokenEnc: { type: String, select: false },
    expiresAt: Date, // when the access token expires (it is refreshed automatically)
    status: { type: String, enum: ['active', 'expired'], default: 'active' }, // expired = user must reconnect
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        return {
          provider: ret.provider,
          accountEmail: ret.accountEmail,
          scopes: ret.scopes,
          status: ret.status,
          connectedAt: ret.createdAt,
        };
      },
    },
  }
);

// One connection per provider per user
integrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

export const Integration = mongoose.model('Integration', integrationSchema);
