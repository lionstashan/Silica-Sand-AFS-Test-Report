# Firestore Data Model

This document defines collections, subcollections, fields, relationships, and recommended indexes for the Silica Mines Operations platform.

## Collections Overview
- `tickets` — All operational tickets (Mining, Production, Drying, QC, Dispatch, Maintenance, Accounts)
  - Subcollections: `logs`, `photos`
- `stocks` — Inventory snapshots (Fresh, ReadyAFS, ReadyDry)
- `plants` — Master list of plants (attributes for wet/dry)
- `beds` — Master list of drying beds
- `grades` — Master list of silica grades
- `operators` — Workers/operators registry
- `orders` — Customer orders
  - Subcollection: `dispatches`
- `users` — User roles and devices
  - Subcollection: `devices`
- `deviceTokens` — FCM tokens (flat collection, optional)
- `summaries` — Aggregated metrics (e.g., `last24h`)

---

## tickets
Stores all ticket types using a common envelope with type-specific fields.

Common fields:
- `type`: string — One of `Mining|Production|Drying|QC|Dispatch|Maintenance|Accounts`
- `status`: string — Lifecycle per type (e.g., Mining flow: Open → In-Progress → Downtime → Downtime-Fix → Downtime-Fix-Completed → Ready-To-Resume → Completed → Closed)
- `createdAt`: timestamp
- `updatedAt`: timestamp
- `createdBy`: uid
- `updatedBy`: uid
- `assignedTo`: uid (optional)
- `notes`: string (optional)

Type-specific examples:
- Mining:
  - `mine`: number (1–3)
  - `pit`: number (1–4)
  - `expectedDumpers`: number
  - `machineOperator`: string
  - `dumperOperators`: array<string>
  - `dumpersLoaded`: number
  - `downtimeReasons`: array<string>
- Production:
  - `plant`: string (ref: plants.id)
  - `productionQty`: number
  - `gradeBreakup`: map<string grade, number qty>
  - `qc`: { `status`: `Pass|Fail|Pending`, `feedback`: string, `grade`: string? }
- Drying:
  - `bed`: string (ref: beds.id)
  - `grade`: string (ref: grades.id)
  - `moistureStart`: number
  - `moistureEnd`: number
  - `dryStart`: timestamp
  - `dryEnd`: timestamp
  - `qc`: { `status`: `Pass|Fail|Pending`, `feedback`: string, `grade`: string? }
  - `dryQty`: number
- QC:
  - `sampleRef`: string
  - `parameters`: map<string, number>
  - `status`: `Open|In-Progress|Completed`
- Dispatch:
  - `orderId`: string (ref: orders.id)
  - `vehicleNumber`: string
  - `driverName`: string
  - `loadQty`: number
  - `status`: `Open|In-Progress|Completed|Closed`
- Maintenance:
  - `assetId`: string
  - `issue`: string
  - `status`: `Open|In-Progress|Downtime|Fix-In-Progress|Completed|Closed`

Subcollections:
- `logs`: { `ts`: timestamp, `from`: string?, `to`: string, `by`: uid, `note`: string? }
- `photos`: { `storagePath`: string, `uploadedAt`: timestamp, `by`: uid, `caption`: string? }

Indexes:
- `type ASC`, `status ASC`, `createdAt DESC`

---

## stocks
Represents inventory snapshots across categories.

Fields:
- `category`: `Fresh|ReadyAFS|ReadyDry`
- `grade`: string (ref: grades.id)
- `plant`: string? (for Fresh)
- `bed`: string? (for ReadyAFS)
- `qty`: number
- `updatedAt`: timestamp

Indexes:
- `category ASC`, `grade ASC`, `updatedAt DESC`

---

## plants
Fields:
- `id`: string
- `name`: string
- `type`: `Wet|Dry`
- `active`: boolean

## beds
Fields:
- `id`: string
- `name`: string
- `capacity`: number
- `active`: boolean

## grades
Fields:
- `id`: string
- `name`: string
- `description`: string?
- `active`: boolean

## operators
Fields:
- `id`: string
- `name`: string
- `role`: string (e.g., `Dumper`, `Machine`, `QC`)
- `phone`: string?
- `active`: boolean

---

## orders
Fields:
- `customer`: string
- `items`: array<{ `grade`: string, `qty`: number }>
- `status`: `Open|Pending|Ready|Dispatching|Completed|Cancelled`
- `dueDate`: timestamp
- `createdAt`: timestamp

Subcollection `dispatches`:
- `orderId`: string
- `vehicleNumber`: string
- `loadQty`: number
- `createdAt`: timestamp

Indexes:
- `status ASC`, `dueDate ASC`, `createdAt DESC`

---

## users
Fields:
- `roles`: array<string> — Custom claims mirror
- `displayName`: string?
- `phoneNumber`: string?

Subcollection `devices`:
- `token`: string
- `platform`: string
- `ts`: timestamp

---

## deviceTokens (optional)
Flat collection to store tokens when users are unauthenticated during token capture.

Fields:
- `uid`: string
- `token`: string
- `platform`: string
- `ts`: timestamp

---

## summaries
Fields:
- `totals`: map<string type, number>
- `ts`: timestamp

---

## Relationships
- `tickets.plant` references `plants.id`
- `tickets.bed` references `beds.id`
- `tickets.grade` references `grades.id`
- `tickets.assignedTo` references `users/{uid}`
- `dispatch.ticketId` (implicit) links to `tickets/{id}` with type `Dispatch`
- `orders.dispatches` tie back by `orderId`

---

## Seed Data
See `infra/seeds/*.json` for sample master data to bootstrap the project.
