# Render deployment settings

## Static website service

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Rewrite: `/*` to `/index.html` with status `200`
- Environment variable: `VITE_API_URL=https://hostel-management-8hst.onrender.com`

The rewrite is required so that refreshing `/admin/login`, `/admin/buildings`,
or another React route loads the application instead of returning `Not Found`.

## Backend service

- Root directory: `backend`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- `FRONTEND_URL=https://hostel-management-web.onrender.com`
- `DATABASE_URL` must point to the active Supabase/Postgres database.

After changing environment variables, redeploy both services. Clear the browser
cookies for `onrender.com`, then sign in again from the website home page.
