# Auth session hardening

This change addresses two issues reproduced in mobile Safari while TXKPRO Workforce is running through a GitHub Codespaces forwarded port.

## Password login

A confirmed Supabase Auth user can still receive `Invalid login credentials` when the entered password does not match the stored credential. TXKPRO does not alter `auth.users.encrypted_password` directly.

The sign-in page now provides two supported recovery paths:

1. **Forgot password** — sends a Supabase recovery email and returns through `/auth/confirm?next=/reset-password`.
2. **One-time sign-in link** — uses `signInWithOtp` with `shouldCreateUser: false`, so it cannot create a new account or grant a role.

After successful password or one-time-link authentication, the browser performs a full navigation to `/dashboard` so SSR cookies are present before the role-specific workspace is resolved.

## Sign-out

Production pages no longer navigate a raw HTML form POST to `/auth/signout`.

The shared client SignOutButton:

1. signs out the browser Supabase client locally;
2. POSTs to the server sign-out route as cookie cleanup fallback;
3. replaces the browser location with `/login?loggedOut=1`.

This avoids Safari displaying a POST response as a `data:`/zero-byte document.

The server `/auth/signout` route remains available as a fallback and uses HTTP 303 semantics.
