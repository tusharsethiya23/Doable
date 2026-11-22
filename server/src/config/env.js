// Loads environment variables from .env and validates them, so the server fails fast on bad config.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),

  // AI settings (the Anthropic SDK reads ANTHROPIC_API_KEY from the environment itself)
  APP_NAME: z.string().default('Doable'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-opus-5-5'),
  LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(64000),
  // Google integration (Gmail now, Calendar next). Optional: Google features switch off if these are missing.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:5173/api/integrations/google/callback'),
  // 32-byte key (64 hex chars) used to encrypt OAuth tokens in the database
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)')
    .optional(),

  // Lets the agent search the web for current info (billed per search by Anthropic)
  ENABLE_WEB_SEARCH: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;

if (!env.ANTHROPIC_API_KEY) console.warn('⚠️  ANTHROPIC_API_KEY is not set — chat replies will fail until you add it to .env');

// Google features are on only when all three settings are present
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
if (!googleEnabled) console.warn('⚠️  Google integration is off — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY to enable it');

// First allowed client URL (where we send the browser back after connecting Google)
export const primaryClientUrl = env.CLIENT_URL.split(',')[0].trim();
export const isProd = env.NODE_ENV === 'production';
