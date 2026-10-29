# LocalAlert

LocalAlert is a mobile app for reporting missing people in South Africa and alerting the community around them.
A Family Administrator reports a verified family member missing, and the alert goes out straight away to
people in the municipality where the person was last seen. The search then widens every 6 hours:

| Level | Who is told |
|---|---|
| 1 | The municipality where they were last seen, and linked family members |
| 2 | Neighbouring municipalities |
| 3 | Municipalities next to those |
| 4 | All LocalAlert users |

Community members can report sightings. Alerts can be shared to WhatsApp, Facebook, X and other apps as a
LocalAlert link, so everyone always sees the latest details. All 213 South African municipalities and their
neighbours are included.

IT Project 700, Richfield Graduate Institute of Technology.

## Technologies

- **App:** React Native with Expo SDK 58 (runs in Expo Go)
- **Backend:** Node.js, Express 5, JWT login, bcrypt, multer (photo uploads), nodemailer (email invitations)
- **Database:** PostgreSQL 18

## Project structure

```
localalert-mobile/
├── backend/                Express API
│   ├── src/
│   │   ├── app.js          routes are mounted here
│   │   ├── server.js       starts the API and the escalation job
│   │   ├── config/         database connection, JWT settings, role names
│   │   ├── controllers/    request handlers (alerts, family, invitations, sharing, users…)
│   │   ├── data/           municipal boundaries (for finding a user's municipality)
│   │   ├── middleware/     login checks, roles, photo uploads
│   │   ├── models/         SQL queries for each table
│   │   ├── routes/         URL → controller
│   │   ├── services/       escalation job, PIN checks, email, location lookup
│   │   └── utils/
│   ├── scripts/            escalation status, create a test user
│   ├── tests/              integration tests (npm test)
│   └── uploads/            photos and ID documents (not in git)
├── db/                     database scripts, run in number order
├── frontend/               Expo app
│   ├── App.js              sign-in flow and the tab navigation
│   ├── assets/             app icon and splash screen
│   └── src/
│       ├── screens/
│       │   ├── auth/       log in, sign up
│       │   ├── alerts/     alerts list, alert details, create alert, report a sighting
│       │   ├── family/     family group, profiles, linking members
│       │   └── account/    profile, notifications, delete account
│       ├── components/     shared building blocks (buttons, inputs, PIN, alert parts)
│       ├── services/       calls to the backend API
│       ├── utils/          dates, ID numbers
│       └── theme.js        colours and sizes
└── docs/                   project documents (kept on this computer, not in git)
```

## Setting up

You need Node.js 20 or newer, PostgreSQL, and the Expo Go app on your phone.

### 1. Database

Create the database, then run the scripts in `db/` in number order.

- **New, empty database:** run every script from `000_base_schema.sql` to the last one.
- **Existing `amber_alert_db`:** it already has the base tables, so start from the first script you have not run yet.

In Command Prompt (Windows), from the project folder:

```
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGPASSWORD=your-postgres-password
%PSQL% -U postgres -c "CREATE DATABASE amber_alert_db"
for %f in (db\*.sql) do %PSQL% -U postgres -d amber_alert_db -v ON_ERROR_STOP=1 -f "%f"
```

### 2. Backend

```
cd backend
copy .env.example .env      (then fill in the database password, JWT secret and the rest)
npm install
npm run dev
```

The API runs on port 5000. Opening `http://localhost:5000` should say the API is running.

### 3. App

```
cd frontend
copy .env.example .env
npm install
npm run lan
```

Scan the QR code with Expo Go. The phone and the computer must be on the same Wi-Fi.

## Everyday commands

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Starts the API and restarts it when code changes |
| backend | `npm test` | Runs all integration tests on a separate test database |
| backend | `npm test -- --fresh` | Rebuilds the test database from scratch, then runs the tests |
| backend | `npm run escalation-status` | Shows each open alert's level and when it moves up next |
| backend | `npm run tunnel` | Makes the API reachable from other networks (localtunnel) |
| frontend | `npm run lan` | Starts the app for phones on the same Wi-Fi |
| frontend | `npm run remote` | Starts the app through a tunnel, for a phone on another network |

### Testing on a phone on another network

1. In `backend`: `npm run dev`, and in a second window `npm run tunnel`.
2. For share links that work for anyone, start a Cloudflare tunnel:
   `cloudflared tunnel --protocol http2 --url http://localhost:5000`,
   and put the `https://….trycloudflare.com` address in `PUBLIC_BASE_URL` in `backend/.env`.
3. In `frontend`: `npm run remote`, and send the Expo link to the other phone.

## Tests

`npm test` (in `backend`) creates a test database called `<DB_NAME>_test` from the `db/` scripts (and runs any
new ones you add later), then runs every file in `backend/tests/`. The tests cover sign-up and municipalities, creating alerts
and escalation, sightings and marking as found, sharing links, notifications, profile editing and removal,
deleting accounts and photo access. They use a temporary uploads folder and never send emails, so your real
data is not touched.

## Environment settings

`backend/.env.example` and `frontend/.env.example` list every setting with an explanation.
The real `.env` files hold passwords and secrets and are never committed.
