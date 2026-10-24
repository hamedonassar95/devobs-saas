# Account email verification

## New registrations

Registration creates a short-lived pending record, not a user, organization, membership, password hash, or session. The record contains the normalized email, requested name and organization name, a SHA-256 hash of a random 32-byte token, and a 24-hour expiry. The token itself is sent only in the Resend email. Completing signup requires the recipient to open the link and choose a password; loading the link alone has no side effect. The verify endpoint hashes that password and consumes the pending record while creating the user, organization, owner membership, and session in one database transaction.

The verification endpoint is single-use and checks expiry again inside the transaction. Resending rotates the token, invalidating the earlier link. The token is placed in the URL fragment, so the browser does not send it with the page request. The page removes the fragment from browser history before the user confirms. Request responses do not reveal whether an email is already registered or has a pending signup. Resend attempts are limited to three per email per 15 minutes and 100 sends across the application per day; verification attempts are limited per token. Rate-limit keys are HMACed with `DATABASE_URL` before storage.

## Existing accounts and rollout

The migration adds `emailVerificationRequired` with a default of `false`, so existing accounts and active sessions are not locked out by deployment. New accounts are created only after email confirmation and have this field set to `true` with `emailVerifiedAt` populated. Existing accounts are grandfathered and are not asserted to have verified addresses. If the product later requires verification for existing users, that needs a separate rollout with recovery and support planning.

## Delivery configuration

The app reuses the existing server-side `RESEND_API_KEY` and `CONTACT_FROM_EMAIL`. The sender must be verified with Resend for production. `APP_URL` must be the public HTTPS origin in Netlify Production and Deploy Preview; it is used to construct the link and is never derived from request headers. The email request rejects redirects and has an eight-second timeout. Provider response bodies and error details are not logged or returned to clients.

If delivery fails, registration still returns the same generic accepted response to avoid account enumeration. The pending record remains available for a later resend. Operators should monitor the fixed server log event `[auth] Verification email delivery failed.` without adding recipient addresses or provider response text.

## Security and operational limits

- The mailbox owner chooses a password on the verification page; the pending registration stores no password. The password is hashed with the existing password hashing utility when the verified account is created; no plaintext password is stored or emailed.
- Pending registrations expire after 24 hours. Expired rows are removed when the matching address requests another link or submits an expired link; a scheduled cleanup job is not part of this change.
- The global mail-send limit reduces provider-cost abuse but a distributed attacker could exhaust it and delay legitimate verification. IP-based limiting should be added only using a trusted proxy/client-IP source.
- The page uses `no-referrer`, is dynamically rendered, and requires an explicit POST with a password selected by the mailbox owner. Link scanners that only make GET requests cannot activate accounts.
- Unit tests mock Resend and use synthetic addresses. They do not prove that Netlify secrets, sender-domain verification, DNS, or mailbox delivery are configured.
