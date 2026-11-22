// Tool: web_search — answers a question with fresh information from Google Search (Gemini "grounding").
// Runs as a separate Gemini request because built-in search can't always be combined with our own functions.
// Uses one extra request from the free quota per search.
import { z } from 'zod';
import { getLLMClient } from '../config/llm.js';
import { env } from '../config/env.js';

export default {
  name: 'web_search',
  description:
    'Search the web for current information: news, prices, opening hours, recent events, facts that may have changed. Call this when the answer depends on up-to-date information you might not know. Returns a short answer with sources.',
  type: 'read',
  inputSchema: z.object({
    query: z.string().trim().min(2).max(300).describe('What to search for, as a clear question or search phrase.'),
  }),

  async run({ query }) {
    const res = await getLLMClient().models.generateContent({
      model: env.LLM_MODEL,
      contents: `Search the web and answer briefly and factually: ${query}`,
      config: { tools: [{ googleSearch: {} }], maxOutputTokens: 1024 },
    });
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return {
      query,
      // Labelled untrusted: web pages are written by other people (could contain instructions to ignore)
      untrusted_answer: res.text || 'No answer found.',
      sources: chunks
        .map((c) => c.web)
        .filter(Boolean)
        .slice(0, 6)
        .map((w) => ({ title: w.title, url: w.uri })),
    };
  },
};
