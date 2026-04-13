# Transport Management System

A simple full-stack transport management system using Node.js, Express, PostgreSQL, and vanilla HTML/CSS/JavaScript.

## Features

- Create new trips
- List all trips
- Update existing trips
- PostgreSQL-powered storage

## Setup

1. Navigate to the project folder:

   ```bash
   cd transport-management-system
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your database URL:

   ```bash
   cp .env.example .env
   ```

   Example content:

   ```env
   DATABASE_URL=postgres://username:password@localhost:5432/your_database
   ```

4. Start the application:

   ```bash
   npm start
   ```

5. Open the app in your browser:

   ```text
   http://localhost:3000
   ```

## Development

To run in development mode with automatic restart:

```bash
npm run dev
```

## Database

The app automatically creates the `trips` table on startup if it does not already exist.

## API Endpoints

- `POST /trip` — create a new trip
- `GET /trips` — retrieve all trips
- `PUT /trip/:id` — update a trip by ID
