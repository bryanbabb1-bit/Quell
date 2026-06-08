// Cloudflare Workers Rate Limiting binding (configured in wrangler.toml).
// Optional at the type level so local dev keeps working without it.
export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  ENVIRONMENT: string;
  RATE_LIMITER?: RateLimitBinding;
}

// Match domain enums — kept in one place so routes and validation agree.
export const MATCH_STATUSES = [
  'open', 'accepted', 'in_progress', 'completed', 'declined', 'cancelled',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_TYPES = ['front_nine', 'back_nine', 'eighteen'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];
