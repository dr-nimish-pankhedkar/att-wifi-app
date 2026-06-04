# Staff Attendance Tracking App

Next.js 14 + Supabase + Tailwind CSS — kiosk-style PIN check-in with full admin panel.

---

## 1. Supabase Project Setup

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose a name, region, and database password → **Create project**
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Database Schema

1. In Supabase dashboard → **SQL Editor → New query**
2. Paste the contents of `supabase/schema.sql` and run it
3. Go to **Storage → New bucket** → name it `staff-photos`, enable **Public bucket**

---

## 3. Create First Admin User

1. Supabase dashboard → **Authentication → Users → Add user**
2. Enter admin email + a strong password → **Create user**
3. Copy the user's UUID from the users table
4. Run in SQL Editor:
   ```sql
   insert into profiles (id, name, designation, pin_hash, role)
   values (
     '<paste-uuid-here>',
     'Admin Name',
     'Administrator',
     '$2a$12$placeholder',   -- admin doesn't need a PIN
     'admin'
   );
   ```

---

## 4. Local Development

```bash
# Clone & install
npm install

# Copy env template
cp .env.local.example .env.local
# Fill in your Supabase values + a random CRON_SECRET

# Start dev server
npm run dev
# Open http://localhost:3000
```

---

## 5. Vercel Deployment

1. Push this repo to GitHub
2. Import on [vercel.com](https://vercel.com) → **New Project**
3. Add environment variables (same as `.env.local`)
4. Deploy — Vercel auto-detects Next.js

---

## 6. Vercel Cron Job

`vercel.json` already configures the nightly absent-marker:

```json
{
  "crons": [{
    "path": "/api/cron/mark-absent",
    "schedule": "30 13 * * *"
  }]
}
```

The cron POSTs to `/api/cron/mark-absent` with `Authorization: Bearer <CRON_SECRET>`.  
Runs at **13:30 UTC = 6:30 PM IST** every day.

---

## Architecture Notes

- **Kiosk (`/`)** — Full-screen PIN pad, no auth required, WiFi-gated
- **Admin (`/admin`)** — Supabase Auth email+password login
- **Staff PINs** — bcrypt-hashed in `profiles.pin_hash`; staff have no Supabase Auth session
- **Timestamps** — stored as UTC in Supabase, displayed in IST via `lib/time.ts`
- **RLS** — all tables have Row Level Security; API routes use `service_role` key to bypass RLS

## Routes

| Path | Description |
|------|-------------|
| `/` | Kiosk PIN pad |
| `/admin/login` | Admin sign-in |
| `/admin/dashboard` | Today's summary |
| `/admin/staff` | Manage staff |
| `/admin/reports` | Filter + export CSV |
| `/admin/settings` | Shift times & company name |
| `POST /api/checkin` | PIN verify + attendance log |
| `GET /api/dashboard` | Today's stats |
| `GET /api/attendance` | Paginated records |
| `GET/POST /api/staff` | List/create staff |
| `PUT/DELETE /api/staff/[id]` | Update/delete staff |
| `GET /api/export` | CSV download |
| `PUT /api/settings` | Update settings |
| `POST /api/cron/mark-absent` | Nightly cron |
