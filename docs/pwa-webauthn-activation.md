# PWA WebAuthn activation

## Configuration

Set these backend environment variables to the production relying-party domain and exact allowed web origins:

```text
WEBAUTHN_RP_ID=examtips.abanise.com
WEBAUTHN_ORIGINS=https://examtips.abanise.com,https://www.examtips.abanise.com
```

For local development, explicitly include the development origin (for example
`http://localhost:3000`) in `WEBAUTHN_ORIGINS`. WebAuthn still requires a secure
context; localhost is treated as secure by browsers.

## How activation works

- Tauri Windows and Android continue using `POST /api/software/activate`.
- PWA activation first requests options from `POST /api/software/pwa/options`.
- The browser creates a platform WebAuthn credential on first activation, or
  signs a fresh challenge with the registered credential for later installations.
- `POST /api/software/pwa/verify` verifies the one-use, five-minute challenge
  and response. New/recovered PWA identities are stored as ordinary
  `SoftwareInstallation` records tied to a `SoftwarePwaDeviceBinding`.
- One active device binding may have at most ten active PWA installation
  records. Slot reservation uses one atomic MongoDB update; revoking an
  installation releases a slot.
- Super Admin endpoints list and revoke PWA installations:
  `GET /api/software/admin/pwa/:tokenId/installations` and
  `POST /api/software/admin/pwa/installations/:installationId/revoke`.

The original installation ID and signing key remain PWA-installation identity,
not hardware identity. WebAuthn verifies possession of an authenticator
credential. This implementation refuses credentials reported as synced or
multi-device, but WebAuthn/platform authenticators cannot provide a general
cryptographic guarantee that a credential is tied to one physical chassis.
Where that guarantee is essential, require manual support review; never reset
the binding based only on browser data, IP address, user-agent, or fingerprint.

## Existing token migration

An existing active PWA identity can enroll a device credential in place. The
user must still have that exact PWA ID and signing key. The server attaches the
new binding to that existing installation without consuming a second slot.
Tokens with multiple legacy active PWA identities are ambiguous and cannot be
automatically migrated; support must review them. If a legacy installation's
browser data has already been erased, do not allow it to claim a device binding.

Back up MongoDB before deployment. With `DATA_BASE` configured, run
`npm run migrate:pwa-webauthn` from `backend-cbt` before enabling the new PWA
activation UI. This creates the unique credential/token indexes and the
challenge TTL index without dropping existing indexes.
