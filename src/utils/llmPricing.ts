/**
 * Client-side LLM pricing configuration and cost calculation helpers.
 *
 * Backend does not calculate cost; admins configure per-1M-token USD prices
 * per model (stored in localStorage). Output tokens already include thinking
 * tokens, so thinking tokens must NOT be added again.
 */

export interface ModelPrice {
    /** USD per 1M non-cached input tokens */
    input: number;
    /** USD per 1M cached input tokens */
    cache: number;
    /** USD per 1M output tokens (already includes thinking_tokens) */
    output: number;
}

export type ModelPriceMap = Record<string, ModelPrice>;

export interface TokenCounts {
    prompt_tokens: number | null | undefined;
    cached_tokens: number | null | undefined;
    output_tokens: number | null | undefined;
}

export interface CostBreakdown {
    inputCost: number;
    cacheCost: number;
    outputCost: number;
    totalCost: number;
}

export const LLM_PRICING_STORAGE_KEY = 'farmui_admin_llm_pricing_v1';
export const DEFAULT_USAGE_TIMEZONE = 'Asia/Seoul';
export const COMMON_IANA_TIMEZONES = [
    'Asia/Seoul',
    'Asia/Ho_Chi_Minh',
    'Asia/Tokyo',
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
];

const MODEL_DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;
const ONE_MILLION = 1_000_000;

/**
 * Strips a trailing provider date suffix (`-YYYY-MM-DD`) from a model name,
 * e.g. `gpt-5.4-mini-2026-11-01` -> `gpt-5.4-mini`.
 */
export function stripModelDateSuffix(model: string): string {
    return model.replace(MODEL_DATE_SUFFIX_RE, '');
}

/**
 * Resolves pricing for a model name:
 * 1. Exact match on `model`
 * 2. If not found, strip trailing `-YYYY-MM-DD` and exact-match again.
 *
 * Never uses prefix matching because model names can be prefixes of each other
 * (e.g. `gpt-5.4` vs `gpt-5.4-mini`, `claude-opus-5` vs `claude-opus-5-5`).
 */
export function resolveModelPrice(
    model: string,
    prices: ModelPriceMap
): { matchedKey: string; price: ModelPrice } | null {
    if (!model) return null;
    if (Object.prototype.hasOwnProperty.call(prices, model)) {
        return { matchedKey: model, price: prices[model] };
    }
    const base = stripModelDateSuffix(model);
    if (base !== model && Object.prototype.hasOwnProperty.call(prices, base)) {
        return { matchedKey: base, price: prices[base] };
    }
    return null;
}

/**
 * Computes USD cost breakdown from token counts and per-1M-token pricing.
 * Returns null if no price rule is configured for the model.
 */
export function calculateCostBreakdown(
    tokens: TokenCounts,
    price: ModelPrice | null
): CostBreakdown | null {
    if (!price) return null;
    if (tokens.prompt_tokens == null && tokens.output_tokens == null) return null;
    const prompt = Math.max(0, Number(tokens.prompt_tokens) || 0);
    const cached = Math.min(prompt, Math.max(0, Number(tokens.cached_tokens) || 0));
    const nonCachedInput = prompt - cached;
    // output_tokens already includes thinking_tokens per API spec.
    const output = Math.max(0, Number(tokens.output_tokens) || 0);

    const inputCost = (nonCachedInput * price.input) / ONE_MILLION;
    const cacheCost = (cached * price.cache) / ONE_MILLION;
    const outputCost = (output * price.output) / ONE_MILLION;

    return {
        inputCost,
        cacheCost,
        outputCost,
        totalCost: inputCost + cacheCost + outputCost,
    };
}

export function loadModelPrices(): ModelPriceMap {
    try {
        const raw = localStorage.getItem(LLM_PRICING_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const cleaned: ModelPriceMap = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (!k || typeof v !== 'object' || !v) continue;
            const entry = v as Record<string, unknown>;
            const input = Number(entry.input);
            const cache = Number(entry.cache);
            const output = Number(entry.output);
            if (Number.isFinite(input) && Number.isFinite(cache) && Number.isFinite(output)) {
                cleaned[k] = {
                    input: Math.max(0, input),
                    cache: Math.max(0, cache),
                    output: Math.max(0, output),
                };
            }
        }
        return cleaned;
    } catch {
        return {};
    }
}

export function saveModelPrices(prices: ModelPriceMap): void {
    try {
        localStorage.setItem(LLM_PRICING_STORAGE_KEY, JSON.stringify(prices));
    } catch (err) {
        console.error('Failed to persist LLM model pricing to localStorage', err);
    }
}

export function formatUsd(amount: number | null | undefined): string {
    if (amount == null || !Number.isFinite(amount)) return '—';
    if (amount === 0) return '$0.00';
    if (amount < 0.01) return `$${amount.toFixed(4)}`;
    if (amount < 10) return `$${amount.toFixed(3)}`;
    return `$${amount.toFixed(2)}`;
}

export function formatCompactNumber(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString();
}

export function formatSeconds(sec: number | null | undefined): string {
    if (sec == null || !Number.isFinite(sec)) return '—';
    return `${sec.toFixed(1)}s`;
}

/**
 * Formats a Date as `YYYY-MM-DD` in the given IANA timezone (no offset),
 * matching the `/ai-reports/usage` `since` / `until` local-date contract.
 */
export function formatDateInTz(date: Date, tz: string): string {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date);
        const y = parts.find(p => p.type === 'year')?.value;
        const m = parts.find(p => p.type === 'month')?.value;
        const d = parts.find(p => p.type === 'day')?.value;
        if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
        // Fallback to local if browser doesn't recognize a custom tz string
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

