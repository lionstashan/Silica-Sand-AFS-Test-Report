# Silica AI Backend

Standalone AI service for the native Flutter app. It is intentionally separate from the live transport web app and only reads fixed aggregate data from the transport database.

## Environment

Copy `.env.example` to `.env` and set:

- `OPENAI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `TRANSPORT_DATABASE_URL`

Use a dedicated read-only database user for `TRANSPORT_DATABASE_URL`.

The SQL template in `scripts/create_ai_readonly_user.sql` grants only the reads needed by the current aggregate queries.

## Run

```bash
npm install
npm start
```

Local URL:

```text
http://localhost:8090
```

Flutter Android emulator default:

```text
http://10.0.2.2:8090
```

## Flutter Production Build

Set the deployed AI service URL at build time:

```bash
flutter build apk --release --dart-define=AI_API_BASE_URL=https://your-ai-service.up.railway.app
```
