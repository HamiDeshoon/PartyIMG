# Security Audit & Hardening

## Authentication & Session Management
- **Insecure Defaults Removed:** The application previously fell back to a default `SESSION_SECRET` in production which is a critical vulnerability. Now it checks via `validateEnv()` on boot and will `process.exit(1)` if a secure 32+ character secret is not provided.
- **CSRF Protection:** Upgraded cookies to use `sameSite: "strict"` in production to prevent Cross-Site Request Forgery attacks.
- **Admin Setup Hardening:** Hardcoded admin fallback passwords are removed in favor of strict environment variable checks in production.

## Uploads
- **MIME Checking:** Ensured `multer` checks MIME types specifically.
- **Path Traversal:** Handled strictly through parameter validation and path joins.

## Rate Limiting
- **API Limiter:** 1000 requests per 15 mins.
- **Login Limiter:** Strict 10 attempts per 15 minutes to prevent brute-force attacks against the admin account.

## Missing Features / Edge Cases (Covered)
- `helmet` is active, though constrained by modern SPA canvas needs.
- Added strict environmental startup validation.
