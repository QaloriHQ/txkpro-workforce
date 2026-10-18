# SEC-IMP-02 handoff — ordinary actions only

## SEC-IMP-02 revised scope (owner approval)
High-risk actions are categorically **excluded**. API-only classifications are insufficient: the complete implementation must also deny financial, security, access-control and irreversible writes through browser Supabase, RLS/RPC and provider callbacks. Ordinary writes require true selected-user scoping and actual Super Admin attribution. Do not activate the feature until these are demonstrated.

## Current blockers

1. **No staging issuer**: Vercel preview environment currently has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only Supabase keys, but **no staging `SUPABASE_JWT_SECRET`**. Never copy production secrets or mint unsigned tokens.
2. **Direct browser Supabase**: `createBrowserSupabaseClient()` uses `@supabase/ssr` and direct PostgREST RPCs. No app-only path filter can enforce the target's role or deny high-risk direct RPCs.
3. **Server identity**: `getVerifiedIdentity()` uses Supabase JWT subject; a registry cookie does not change `auth.uid()` or RLS.
4. **Admin provenance**: the 169+ API routes and sensitive RPCs lack a shared authenticated actor/target/correlation context; many operations mutate external systems. An ordinary write through an unbound target JWT could not be distinguished from the target signing in.

## Required SEC-IMP-02 completion work

- Implement a **Supabase-supported issuance path** with a separate staging key or signing integration, verified actor and target claims, short TTL, server-side revocation and no standalone target bearer token.
- Unify browser Supabase, server-side requests and RLS/RPC on issuer-verified target access. Confirm that an ordinary JWT belonging to the administrator cannot gain target permissions.
- Enforce the excluded-actions policy at **every relevant boundary**, including PostgREST/RPC and Next.js API, not solely by UI, cookie or route filters. Unknown writes fail closed.
- Attribute ordinary writes with real actor ID, target ID, selected membership, impersonation session and request ID; reject on missing provenance.
- Build the global banner and Exit flow atop an actually active, revocable impersonation context. Verify multi-tab, session expiry, target deactivation and mobile UX.
- Complete negative cross-tenant, finance/security/role-change bypass tests, perform real signed-in staging UAT and only then flip `IMPERSONATION_DATA_PLANE_CERTIFIED`.

**Release state:** staging foundation is merged; registry migration is present in staging Supabase. Entire View as feature remains hard-disabled pending the issuer/data-plane work. Do not claim completion.
