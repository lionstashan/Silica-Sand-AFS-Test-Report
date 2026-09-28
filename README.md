# Silica India Systems

This repository contains the source used by the active Silica India services and a separate archive for non-live projects.

## Live services

| Service | Environment | Source path |
| --- | --- | --- |
| [www.silicasand.in](https://www.silicasand.in) | Production | `app/` and root Python deployment files |
| [ops.indussilicasand.in](https://ops.indussilicasand.in) | Production | `transport-management-system/` |
| [Indus Ops staging](https://ops-web-staging-987e.up.railway.app) | Staging | `transport-management-system/` |
| [transport-demo](https://demo-web-production-afc6.up.railway.app) | Demo | `transport-management-system/` |

`silica_platform/` contains the mobile clients that connect to the active Ops environments. The live Railway root paths remain unchanged so deployments continue to use the existing configuration.

## Repository layout

- `app/`: public website application.
- `transport-management-system/`: shared Ops production, staging, and demo application.
- `silica_platform/`: mobile and client applications for Ops.
- `portfolio/` and `reports_pdfs/`: content used by the public website.
- `Adhoc/`: non-live projects retained for reference or future work.

See `Adhoc/README.md` for the archived-project inventory.
