# ZenAlpha Logistics — Starter Project

## Run locally on Windows
1. Extract this folder and open the `ZenAlpha` folder in VS Code.
2. Open Terminal → New Terminal.
3. Run `Copy-Item .env.example .env` (only if `.env` does not already exist).
4. Open `.env` and change `ADMIN_PASSWORD` and `SESSION_SECRET` to private values.
5. Install packages: `npm.cmd install`
6. Start server: `npm.cmd start`
7. Open `http://localhost:3000`

## Included
- Server-rendered login route with password hashing and session-based access.
- Responsive ZenAlpha dashboard and premium navigation labels.
- Dropdowns for Dispatch Center, Jobsheet Control, Earnings & Rewards, and Returns & Reconciliation.
- Starter workflow forms for each submenu.
- Sample dashboard figures and shipment rows.

## Important limitations
This is a local development prototype. Dashboard figures are sample data, and operation forms do not save records to a database. The default Express session MemoryStore is not suitable for production. Before real staff use or public deployment, add a persistent database, a production session store, HTTPS, rate limiting, secure secret management, and role-based permissions. Do not use default credentials online.
