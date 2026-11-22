// Creates the Google Gemini client once and reuses it. Created lazily so the server still starts without a key.
import { GoogleGenAI, ApiError } from '@google/genai';
import { env } from './env.js';

let client = null;

export function getLLMClient() {
  if (!env.GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY is not set');
    err.code = 'NO_API_KEY';
    throw err;
  }
  // v1beta = the endpoint Google documents for function calling, thought signatures and Search grounding
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: 'v1beta' });
  return client;
}

export { ApiError as GeminiApiError };
