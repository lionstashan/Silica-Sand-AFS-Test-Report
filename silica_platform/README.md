# Silica Platform Monorepo

This repository hosts the new mobile, web, and Firebase backend for Silica Mines Operations. The legacy Python app remains in the root `app/` folder and operates independently.

## Structure
- `mobile/` — Flutter app (offline-first, OTP auth)
- `web-admin/` — Next.js admin dashboard
- `functions/` — Firebase Cloud Functions (workflows, triggers)
- `infra/` — Firebase config, rules, indexes, emulators
- `docs/` — Architecture and runbooks

## Quick Start
1. Install Firebase CLI and Node 18+.
2. In `functions/`:
   ```bash
   npm install
   npm run build
   ```
3. Emulators:
   ```bash
   firebase emulators:start --project silica-mines-dev
   ```
4. Web Admin:
   ```bash
   cd web-admin
   npm install
   npm run dev
   ```
5. Mobile:
   - Run `flutter create mobile` or scaffold manually, then implement OTP login and offline sync.

## Notes
- Set custom claims for roles (Manager, QC, Dispatch, Accounts, Director).
- Deploy indexes via `infra/firestore.indexes.json` and rules via `infra/firestore.rules`.
