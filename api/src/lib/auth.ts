import { createClerkClient, verifyToken } from '@clerk/backend';

export interface AuthContext {
  userId: string;
  email: string;
}

// JWT claim shape — Clerk default tokens include `email`/`primary_email_address`
// when a JWT template surfaces them. Older tokens may omit, in which case we
// fall back to fetching the user. (Reused from TrueForecast.)
function emailFromPayload(payload: any): string | null {
  const candidates = [
    payload.email,
    payload.primary_email_address,
    payload.primary_email,
    payload.user_email,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

export async function requireAuth(
  request: Request,
  env: { CLERK_SECRET_KEY: string; CLERK_PUBLISHABLE_KEY: string; CLERK_AUTHORIZED_PARTIES?: string }
): Promise<AuthContext> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(401, 'Missing authorization header');
  }

  const token = authHeader.slice(7);

  // Token-substitution hardening: when CLERK_AUTHORIZED_PARTIES is configured,
  // verifyToken rejects any token whose `azp` claim isn't in the allowlist.
  // Unset = unchanged behavior (no lockout risk before the value is confirmed).
  const authorizedParties = env.CLERK_AUTHORIZED_PARTIES
    ? env.CLERK_AUTHORIZED_PARTIES.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      ...(authorizedParties && authorizedParties.length ? { authorizedParties } : {}),
    });

    const userId = payload.sub;
    if (!userId) throw new AuthError(401, 'Invalid token');

    // Prefer the email straight from the JWT — saves a Clerk API roundtrip on
    // every authenticated request. Only fall back to Clerk.users.getUser when
    // the token doesn't include it.
    const tokenEmail = emailFromPayload(payload);
    if (tokenEmail) {
      return { userId, email: tokenEmail };
    }

    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const user = await clerk.users.getUser(userId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? '';

    return { userId, email };
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(401, 'Token verification failed');
  }
}

export class AuthError extends Error {
  constructor(
    public status: number,
    public message: string
  ) {
    super(message);
  }
}
