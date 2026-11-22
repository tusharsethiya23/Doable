// Loads environment variables from .env and validates them, so the server fails fast on bad config.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  // Only set to true if the React app is hosted on a DIFFERENT domain than the API (needs SameSite=None cookies)
  CROSS_SITE_COOKIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),

  // AI settings — Google Gemini (free tier). Get a key at https://aistudio.google.com/apikey
  APP_NAME: z.string().default('Doable'),
  GEMINI_API_KEY: z.string().optional(),
  // "-latest" aliases always point at Google's current model; Flash-Lite has the most generous free quota
  LLM_MODEL: z.string().default('gemini-flash-lite-latest'),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(8192),
  // Shared free quota protection: max chat messages per user per day (0 = no limit)
  DAILY_MESSAGE_LIMIT: z.coerce.number().int().nonnegative().default(40),
  // Google integration (Gmail now, Calendar next). Optional: Google features switch off if these are missing.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:5173/api/integrations/google/callback'),
  // 32-byte key (64 hex chars) used to encrypt OAuth tokens in the database
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)')
    .optional(),

  // Lets the agent search the web (Gemini + Google Search grounding; each search uses one extra request)
  ENABLE_WEB_SEARCH: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Cost control: each user's AI spend per calendar month is capped (admins can change it per user).
  // On Gemini's FREE tier prices are 0, so this only matters if you switch to a paid key and set prices below.
  USER_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  // Model prices in USD per million tokens and per web search — used to estimate spend (0 = free tier)
  LLM_PRICE_INPUT: z.coerce.number().nonnegative().default(0),
  LLM_PRICE_OUTPUT: z.coerce.number().nonnegative().default(0),
  LLM_PRICE_CACHE_READ: z.coerce.number().nonnegative().default(0),
  LLM_PRICE_CACHE_WRITE: z.coerce.number().nonnegative().default(0),
  WEB_SEARCH_PRICE: z.coerce.number().nonnegative().default(0),

  // Comma-separated emails that get the admin role (admin dashboard at /admin)
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)),
});

// Treat blank values (e.g. an empty field left on the hosting dashboard) as "not set", so defaults apply
const definedVars = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
const parsed = envSchema.safeParse(definedVars);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
const isTest = env.NODE_ENV === 'test';

if (!env.GEMINI_API_KEY && !isTest) console.warn('⚠️  GEMINI_API_KEY is not set — chat replies will fail until you add it to .env (free key: https://aistudio.google.com/apikey)');

// Google features are on only when all three settings are present
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
if (!googleEnabled && !isTest) console.warn('⚠️  Google integration is off — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY to enable it');

// First allowed client URL (where we send the browser back after connecting Google)
export const primaryClientUrl = env.CLIENT_URL.split(',')[0].trim();
export const isProd = env.NODE_ENV === 'production';

// Production sanity checks: catch the most common deployment mistakes at startup
if (isProd) {
  const problems = [];
  if (/localhost/.test(env.CLIENT_URL)) problems.push('CLIENT_URL still points to localhost — set it to your public URL (e.g. https://doable.onrender.com)');
  if (googleEnabled && /localhost/.test(env.GOOGLE_REDIRECT_URI)) problems.push('GOOGLE_REDIRECT_URI still points to localhost');
  if (!/^mongodb(\+srv)?:\/\//.test(env.MONGO_URI) || /127\.0\.0\.1|localhost/.test(env.MONGO_URI)) problems.push('MONGO_URI looks like a local database');
  if (!env.GEMINI_API_KEY) problems.push('GEMINI_API_KEY is missing');
  for (const p of problems) console.warn(`⚠️  [production] ${p}`);
}
