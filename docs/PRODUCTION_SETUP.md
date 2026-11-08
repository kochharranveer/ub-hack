# Supabase and Render production setup

This release replaces fixed demo identities and local-only storage when `PANDA_RUNTIME=production`. Local development stays in explicit demo mode. Doctor booking, real pose tracking, medical-reference retrieval and clinical evaluation are separate features.

## Deployed topology

One Render Node web service runs Panda, Care and Rehab. Only Panda binds `0.0.0.0:$PORT`; Care and Rehab bind private loopback ports3001/3002. The gateway preserves `/care` and `/rehab`. PostgreSQL lives in Supabase and stores separate Care, Rehab, voice and patient-memory rows per patient. No production patient record depends on Render's ephemeral disk.

`render.yaml` defines a free initial preview with manual deployment. Free hosting can sleep and has512MB memory; it is for initial verification, not an availability commitment. Measure memory and load before selecting an always-on compute plan. No paid upgrade is automatic.

## Authentication and authorization

Supabase Auth owns passwords, email verification and recovery. This app uses `@supabase/ssr` on the server with Secure, HttpOnly, SameSite=Lax cookies; tokens are not returned in account JSON. Every API verifies the user with `getUser`. Session reads only forward a token after verification. Page proxy checks improve navigation but do not replace API authorization.

Accounts are invitation-based. Verified Supabase invitations (or an explicit administrator grant) activate an empty patient profile; public self-signup alone cannot activate app access: no fictional medicines or inferred diagnosis. A server-owned `principals.role` and explicit `patient_grants` authorize clinicians; editable user metadata never grants privileges. Patients cannot import/approve plans or acknowledge requests/reports. Clinicians cannot use the patient's voice or self-report actions. Patient responses omit drafts. Every peer API independently verifies the forwarded bearer token and validates its patient assignment.

Postgres tables are private and have forced row-level security. The app connects with a dedicated NOINHERIT/NOBYPASSRLS login and explicitly selects `panda_runtime` within each transaction. Subject/patient settings are transaction-local. Database credentials never go to the browser. The runtime login cannot assign clinicians or patient grants.

CSRF origin validation protects cookie-authenticated writes. Bounded streaming body readers protect JSON and audio uploads. Shared Postgres rate limits cap API and paid-provider attempts; audit entries contain subject, patient, action/status and time, never transcripts or passwords. Browser responses are private/no-store. Security headers restrict framing, referrers, camera/mic and browser network access. CSP retains inline script/style support for Next.js; nonce-based CSP is a future hardening option.

## Configuration

Keep development `.env.local` intact. Supply production values through Render's private environment settings:

- `PANDA_RUNTIME=production`, `PANDA_INTEGRATION=connected`.
- `PANDA_PUBLIC_ORIGIN`: exact HTTPS site origin, with no trailing slash. The automatic Render hostname is also supported when this variable is omitted.
- `PANDA_SUPABASE_URL`, `PANDA_SUPABASE_PUBLISHABLE_KEY`.
- `PANDA_DATABASE_URL`: restricted runtime login, session pooler port5432 for IPv4 hosts.
- `PANDA_DATABASE_CA`: Supabase's published CA certificate. TLS verifies both chain and hostname; verification is never disabled.
- Existing Gemini and ElevenLabs settings, with real account quota. No `NEXT_PUBLIC_` secret variables.
- `NODE_VERSION=24`, `NEXT_TELEMETRY_DISABLED=1`.

Do not put `PANDA_MIGRATION_DATABASE_URL`, a Supabase secret/service key, or administrative credentials on the web service.

## Database installation and changes

SQL migrations are under `supabase/migrations`. The initial installation uses the Supabase migration API and is followed by security advisories and actual test queries. A restricted login is provisioned with a separately generated password, outside source control.

For another environment, `npm run db:migrate` accepts a separately supplied administrative `PANDA_MIGRATION_DATABASE_URL` and applies migrations transactionally. It refuses to replay the baseline over an already initialized hosted schema. Baseline its migration history deliberately if switching from Supabase-managed migration history; never reset a live database to resolve history differences.

The current repositories use domain-owned JSONB aggregates with per-patient row locks, retaining existing domain/idempotency behavior and atomic updates across instances. They are an initial production migration, not an unlimited-scale design: voice/check-in transactions can hold a patient lock during provider work. Locks time out rather than allowing partial writes. Normalize growing memory/transcript tables and move generation outside write transactions before high-volume rollout. No JSON/SQLite clinical demo data is automatically imported into real accounts.

## First accounts

1. In Supabase Authentication, set Site URL to the final Panda HTTPS origin. Allow the exact `/auth/callback` recovery redirect.
2. Configure invitation email links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`, and recovery links with `type=recovery`. The app also accepts PKCE callback codes.
3. Enable email confirmation, disable public signup/anonymous login, and configure the password policy (minimum12 characters). Set up a custom SMTP provider for external-user delivery. Test delivery, expiration and password recovery before inviting patients.
4. Invite the first patient and clinician through the authenticated Supabase administration surface. The application does not send an unsolicited invitation.
5. Use `npm run account:grant -- CLINICIAN_UUID PATIENT_UUID` with administrative database credentials to establish the role/assignment. It checks that both Supabase accounts exist. Sign out/in after role changes.
6. Test a reviewed care plan, patient check-in, help acknowledgement, and saved exercise report using separate accounts. Exercise measurements remain explicitly simulated until the pose module is connected.

## Deployment and operations

`npm run check` runs deterministic tests with production credentials removed, even during a cloud build. `npm run build` builds all apps. `npm run start:production` validates configuration, refuses fixture peers and launches the connected product. The gateway `/api/health` checks installed schema and both private apps; provider quota outages do not make database readiness look successful conversation generation.

Native Render builds require development dependencies for TypeScript/tsx and checks: `npm ci --include=dev && npm run check && npm run build`.

Monitor Render deployment/runtime logs and `/api/health`. Logs omit patient text and provider secrets; use `X-Request-Id` to correlate failures. Secrets rotate through private provider settings. Database schema changes are additive; application rollback does not restore database contents.

Before use with real patient data: establish backup retention and test a restore into an isolated project; configure uptime/error alerts and operational ownership; test session expiry/revocation and actual phone microphone/camera; review vendor data handling, consent/retention requirements and clinical behavior with the responsible team. This implementation is not a regulatory compliance or clinical-safety certification.

## Wire compatibility

Local synthetic records retain contract2.0.0. Production Care snapshots use2.1.0 and allow `plan.demoOnly=false`; all three apps accept both versions. Existing2.0-only consumers must update before reading production plans. Panda's check-in and exercise bridge shapes remain additive; the exercise bridge stays1.0.0. Care remains authoritative for plans/tasks/help/acknowledgements and Rehab for sessions/reports.

## References

- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase verified database TLS](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Render Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
