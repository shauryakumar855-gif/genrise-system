# GenRise Student Opportunities — Starter Full-Stack System

## Features
- GenRise teal/gold responsive homepage
- Student signup and login
- Password hashing with bcryptjs
- Session-based authentication
- SQLite database
- Opportunity listing
- Save opportunities to a student dashboard
- Logout

## Run locally
1. Install Node.js LTS.
2. Open this folder in VS Code.
3. Open a terminal in the folder.
4. Run: `npm install`
5. Run: `npm start`
6. Open: `http://localhost:3000`

The database is created automatically at `data/genrise.db`.

## Important before publishing
Set a strong `SESSION_SECRET` environment variable. For production, use HTTPS and a persistent session store rather than the default in-memory session store. Add email verification, password reset, rate limiting, CSRF protection, and an admin panel before using real student data at scale.


## Admin Dashboard

Open `http://localhost:3000/admin-login.html`.

Local default admin:
- Email: `admin@genrise.local`
- Password: `Admin@12345`

For deployment, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and a strong `SESSION_SECRET` environment variable before starting the server. Change the local default credentials if this project will be exposed publicly.
