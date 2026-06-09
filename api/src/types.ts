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
  // Optional comma-separated allowlist of token `azp` (authorized party) values.
  // When set, tokens whose azp isn't listed are rejected. Left unset = current
  // behavior, so enabling it is a deliberate, non-breaking opt-in.
  CLERK_AUTHORIZED_PARTIES?: string;
}

// Match domain enums — kept in one place so routes and validation agree.
export const MATCH_STATUSES = [
  'open', 'accepted', 'in_progress', 'completed', 'declined', 'cancelled',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_TYPES = ['front_nine', 'back_nine', 'eighteen'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];
