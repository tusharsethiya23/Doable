// AI usage & spending cap: records the tokens each model turn used, estimates the cost in USD,
// and blocks new AI work once a user reaches their monthly budget (SRS NFR-10).
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

// "2026-11" (UTC) — usage resets when this changes
export const currentMonth = () => new Date().toISOString().slice(0, 7);

// Estimated USD cost of one API response's `usage` block
export function costOfUsage(u = {}) {
  const perToken = (pricePerMillion) => pricePerMillion / 1_000_000;
  return (
    (u.input_tokens || 0) * perToken(env.LLM_PRICE_INPUT) +
    (u.output_tokens || 0) * perToken(env.LLM_PRICE_OUTPUT) +
    (u.cache_read_input_tokens || 0) * perToken(env.LLM_PRICE_CACHE_READ) +
    (u.cache_creation_input_tokens || 0) * perToken(env.LLM_PRICE_CACHE_WRITE) +
    (u.server_tool_use?.web_search_requests || 0) * env.WEB_SEARCH_PRICE
  );
}

/** Adds one model turn's usage to the user's monthly totals (starting fresh in a new month). */
export async function recordUsage(userId, u = {}) {
  const month = currentMonth();
  const amounts = {
    'usage.inputTokens': u.input_tokens || 0,
    'usage.outputTokens': u.output_tokens || 0,
    'usage.cacheReadTokens': u.cache_read_input_tokens || 0,
    'usage.cacheWriteTokens': u.cache_creation_input_tokens || 0,
    'usage.webSearches': u.server_tool_use?.web_search_requests || 0,
    'usage.costUsd': costOfUsage(u),
  };

  const res = await User.updateOne({ _id: userId, 'usage.month': month }, { $inc: amounts });
  if (res.matchedCount === 0) {
    // First usage this month: replace last month's totals
    const fresh = Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k.replace('usage.', ''), v]));
    await User.updateOne({ _id: userId }, { $set: { usage: { month, ...fresh } } });
  }
}

export const budgetOf = (user) => user.monthlyBudgetUsd ?? env.USER_MONTHLY_BUDGET_USD;

// This month's spend vs. budget (old months count as 0)
export function usageSummary(user) {
  const spent = user.usage?.month === currentMonth() ? user.usage.costUsd || 0 : 0;
  const budget = budgetOf(user);
  return { month: currentMonth(), spentUsd: Number(spent.toFixed(4)), budgetUsd: budget, remainingUsd: Math.max(0, budget - spent) };
}

/** Throws 429 if the user has used up this month's AI budget. Call before starting any AI work. */
export async function assertWithinBudget(userId) {
  const user = await User.findById(userId);
  const { spentUsd, budgetUsd } = usageSummary(user);
  if (spentUsd >= budgetUsd) {
    throw new ApiError(429, `You've reached this month's AI usage limit ($${budgetUsd}). It resets on the 1st — or ask an admin to raise it.`);
  }
}
