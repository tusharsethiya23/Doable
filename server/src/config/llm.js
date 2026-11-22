// Creates the Anthropic (Claude) client once and reuses it. Created lazily so the server still starts without a key.
import Anthropic from '@anthropic-ai/sdk';

let client = null;

export function getLLMClient() {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment; retries 429/5xx twice by default
  return client;
}

export { Anthropic };
