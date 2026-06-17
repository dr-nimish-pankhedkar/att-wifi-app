# Security Audit Report — café tan 90° Attendance App
**Date:** 2026-06-14  
**Scope:** Full codebase + schema review  
**Branch audited:** `main` (post-merge)

> **Note on scope:** The audit brief mentions tables (`projects`, `project_assignments`,
> `checklist_templates`, `checklist_responses`, `time_logs`, `project_files`) that do **not
> exist** in this codebase. This is a staff-attendance + kitchen-management app. Those
> sections are answered in terms of the tables that do exist.

---

## Summary Table

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | Middleware redirects unauthenticated users | ❌ FAIL | No `middleware.ts` exists |
| 1.2 | Authenticated users redirected away from /login | ❌ FAIL | No redirect on login page |
| 1.3 | `@supabase/ssr` session refresh wired | ⚠️ NEEDS FIX | Server client correct; no middleware to run it |
| 1.4 | No route bypasses middleware matcher | ⚠️ N/A | Middleware doesn't exist |
| 2.1 | RLS enabled on all tables | ✅ PASS | All 8 tables have RLS on |
| 2.2 | Policies present on all tables | ⚠️ NEEDS FIX | `daily_kitchen_*` policies use `using (true)` |
| 2.3 | Policies match intended access model | ⚠️ NEEDS FIX | Kitchen tables fully public; no admin guard |
| 3.1 | Storage buckets private | ❌ FAIL | Both buckets are `public: true` |
| 3.2 | Storage policies restrict access | ❌ FAIL | Public buckets have no per-user policies |
| 3.3 | Non-admin cannot read outside their scope | ❌ FAIL | Anyone with bucket URL can read all files |
| 3.4 | File URLs are signed/expiring | ❌ FAIL | `getPublicUrl` returns permanent public URLs |
| 4.1 | UI hides admin-only links for non-admins | ✅ PASS | Staff have no Supabase auth session |
| 4.2 | Admin URL protection not UI-only | ❌ FAIL | Pages protected only by client-side `useEffect` |
| 4.3 | Server-side role check before mutations | ❌ FAIL | Routes check `isUser`, not `isAdmin` |
| 5.1 | Server-side Zod validation | ❌ FAIL | No Zod anywhere; manual checks only |
| 5.2 | No raw SQL / unsanitised input in queries | ✅ PASS | All queries use Supabase query builder |
| 6.1 | No secrets committed to repo | ✅ PASS | Only `.env.local.example` committed |
| 6.2 | `.env.local` in `.gitignore` | ✅ PASS | `.env*.local` covered |
| 6.3 | Only safe vars exposed client-side | ✅ PASS | `NEXT_PUBLIC_*` = URL + anon key only |
| 6.4 | RLS enforced where anon key is exposed | ⚠️ NEEDS FIX | Kitchen tables bypass via `using (true)` |
| 7.1 | HTTPS enforced in production | ✅ PASS | Vercel enforces HTTPS automatically |

---

## Detailed Findings & Proposed Fixes

---

### 1. AUTHENTICATION

#### 1.1 ❌ FAIL — No `middleware.ts`

**Finding:** There is no `middleware.ts` file in the project. All admin pages
(`/admin/dashboard`, `/admin/staff`, `/admin/schedule`, `/admin/reports`,
`/admin/inventory`, `/admin/settings`, `/admin/daily-kitchen`) protect themselves
only with a client-side `useEffect`:

```ts
// app/admin/dashboard/page.tsx (representative example)
useEffect(() => {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) router.replace('/admin/login');
  });
}, []);
```

This means:
- The full page HTML + any server-fetched data is **delivered to the browser** before the
  redirect fires.
- A bot or attacker can spider all admin pages without a session.
- Session cookies are never refreshed server-side between page loads.

**`app/admin/layout.tsx` has no auth check at all** — it is a bare passthrough wrapper.

**Proposed fix — create `middleware.ts` at repo root:**

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users away from /admin (except /admin/login)
  if (!user && pathname.startsWith('/admin') && pathname !== '/admin/login') {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Redirect authenticated users away from /admin/login
  if (user && pathname === '/admin/login') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

---

#### 1.2 ❌ FAIL — No redirect from /admin/login for authenticated users

**Finding:** `app/admin/login/page.tsx` performs no check — an already-authenticated
admin will see the login form rather than being redirected to the dashboard.

**Fix:** Covered by the middleware proposed above (`if (user && pathname === '/admin/login')`).

---

#### 1.3 ⚠️ NEEDS FIX — Session refresh not running per-request

**Finding:** `lib/supabase/server.ts` correctly implements `@supabase/ssr` cookie
handling, but without middleware it only runs inside API routes, not on page navigations.
Long-lived sessions may expire mid-session without silent refresh.

**Fix:** The middleware proposed in 1.1 calls `supabase.auth.getUser()` on every
`/admin` request, which triggers the SSR session refresh automatically. No additional
change needed beyond adding the middleware.

---

### 2. ROW-LEVEL SECURITY

#### 2.1 ✅ PASS — RLS enabled on all tables

All tables have `alter table ... enable row level security;` in the schema files:
- `settings`, `shifts`, `profiles`, `attendance` → `supabase/schema.sql`
- `inventory_items`, `inventory_logs` → `supabase/inventory-schema.sql`
- `daily_kitchen_items`, `daily_kitchen_logs` → `supabase/daily-kitchen-schema.sql`

---

#### 2.2 / 2.3 ⚠️ NEEDS FIX — Daily kitchen tables are fully public

**Finding:** `supabase/daily-kitchen-schema.sql` defines:

```sql
create policy "public read kitchen items"  on daily_kitchen_items for select using (true);
create policy "public read kitchen logs"   on daily_kitchen_logs  for select using (true);
create policy "public insert kitchen logs" on daily_kitchen_logs  for insert with check (true);
create policy "public update kitchen logs" on daily_kitchen_logs  for update using (true);
create policy "public delete kitchen logs" on daily_kitchen_logs  for delete using (true);
create policy "admin manage kitchen items" on daily_kitchen_items for all using (true);
```

`using (true)` means **any anonymous caller** with the Supabase URL + anon key can
read, insert, update, and delete kitchen logs — including deleting historical data.

**Risk:** Anyone knowing the Supabase URL can wipe all kitchen logs or inject fake data.

**Proposed fix — run in Supabase SQL Editor:**

```sql
-- Drop all existing permissive kitchen policies
drop policy if exists "public read kitchen items"  on daily_kitchen_items;
drop policy if exists "public read kitchen logs"   on daily_kitchen_logs;
drop policy if exists "public insert kitchen logs" on daily_kitchen_logs;
drop policy if exists "public update kitchen logs" on daily_kitchen_logs;
drop policy if exists "public delete kitchen logs" on daily_kitchen_logs;
drop policy if exists "admin manage kitchen items" on daily_kitchen_items;

-- Items: admin full control; anyone can read (needed for kiosk item list)
create policy "admin_all_kitchen_items"
  on daily_kitchen_items for all using (is_admin());
create policy "public_read_kitchen_items"
  on daily_kitchen_items for select using (true);

-- Logs: admin full control; INSERT allowed without session (kiosk posts with staff_id)
-- SELECT restricted to admin (logs contain operational data)
create policy "admin_all_kitchen_logs"
  on daily_kitchen_logs for all using (is_admin());
create policy "kiosk_insert_kitchen_logs"
  on daily_kitchen_logs for insert with check (true);
```

> **Note:** The kiosk log endpoint (`POST /api/daily-kitchen/log`) uses the
> `service_role` key via `createAdminClient()`, so it bypasses RLS entirely.
> The INSERT policy above is belt-and-suspenders for any future direct client access.
> DELETE from anonymous callers is now blocked at the RLS level.

---

#### RLS policy summary for existing tables

| Table | RLS | Admin policy | Staff / public policy |
|-------|-----|-------------|----------------------|
| `settings` | ✅ | full | authenticated read |
| `shifts` | ✅ | full | public read |
| `profiles` | ✅ | full | self-read only |
| `attendance` | ✅ | full | self-read only |
| `inventory_items` | ✅ | full | **none** (service role only) |
| `inventory_logs` | ✅ | full | **none** (service role only) |
| `daily_kitchen_items` | ✅ | ⚠️ `using (true)` | `using (true)` |
| `daily_kitchen_logs` | ✅ | ⚠️ `using (true)` | full `using (true)` |

---

### 3. STORAGE SECURITY

#### 3.1–3.4 ❌ FAIL — Both buckets are public with permanent URLs

**Finding:** `supabase/schema.sql` creates both buckets with `public: true`:

```sql
-- insert into storage.buckets (id, name, public) values ('staff-photos', 'staff-photos', true);
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true);
```

`app/admin/settings/page.tsx` and `components/admin/StaffTable.tsx` both use
`getPublicUrl()` which returns a **permanent, non-expiring, publicly guessable URL**.

`next.config.js` explicitly allows images from `/storage/v1/object/public/**`,
confirming public access.

**Risk assessment:**
- `logos` bucket: LOW risk — company logo is intentionally public.
- `staff-photos` bucket: MEDIUM risk — staff photos are personal data. Any person
  who discovers the Supabase URL + bucket name + file path can view any photo
  without authentication.

**Proposed fix for `staff-photos`:**

```sql
-- In Supabase dashboard: Storage → staff-photos → make PRIVATE
-- Or via SQL:
update storage.buckets set public = false where id = 'staff-photos';

-- Add RLS policy on storage.objects
create policy "admin_read_staff_photos"
  on storage.objects for select
  using (bucket_id = 'staff-photos' and is_admin());

create policy "admin_write_staff_photos"
  on storage.objects for insert
  with check (bucket_id = 'staff-photos' and is_admin());
```

Then change all `getPublicUrl` calls for staff photos to `createSignedUrl` with a
short TTL:

```ts
// components/admin/StaffTable.tsx — replace getPublicUrl with:
const { data } = await supabase.storage
  .from('staff-photos')
  .createSignedUrl(path, 3600); // 1-hour expiry
const photoUrl = data?.signedUrl ?? null;
```

> `logos` bucket can remain public — branding assets are intentionally public.

---

### 4. ROLE-BASED ACCESS (APPLICATION LAYER)

#### 4.2 ❌ FAIL — Admin pages rely on client-side auth only

See finding 1.1. Even if a user is not authenticated, the server delivers the full
admin page HTML. The `useEffect` redirect is a UX convenience, not a security control.

**Fix:** Middleware (see 1.1) prevents unauthenticated page delivery entirely.

---

#### 4.3 ❌ FAIL — API routes check `isUser` but not `isAdmin`

**Finding:** Functions named `requireAdmin()` in the codebase check only that a
Supabase session exists — they do **not** verify the `admin` role:

```ts
// app/api/staff/[id]/route.ts — misleadingly named
async function requireAdmin() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;  // ← only checks authentication, NOT role
}
```

This means **any authenticated Supabase user** can call:

| Endpoint | Risk |
|----------|------|
| `GET /api/staff` | List all staff names, photos, designations |
| `POST /api/staff` | Create new staff members |
| `PUT /api/staff/[id]` | Change any staff member's PIN |
| `DELETE /api/staff/[id]` | Delete any staff member |
| `GET /api/attendance` | View all attendance records |
| `GET /api/export` | Download full attendance CSV |
| `PUT /api/settings` | Change company name, shift times, allowed IPs |
| `GET/POST /api/shifts` | View/create shifts |
| `PUT/DELETE /api/shifts/[id]` | Modify/delete shifts |
| `GET /api/inventory` | View all inventory |
| `POST /api/inventory` | Add inventory items |

Additionally, `GET /api/settings` has **no auth check at all** — it returns company
name, logo URL, shift start time, and the office IP allowlist to anyone:

```ts
// app/api/settings/route.ts GET handler
export async function GET() {
  const supabase = createAdminClient();
  let { data, error } = await supabase.from('settings').select('*').maybeSingle();
  // ← no auth check here
  return NextResponse.json({ settings: data });
}
```

**In practice** the risk is partially mitigated because staff users are created with
random passwords they don't know and cannot log in via the admin login form. However
this is a weak defence — if an attacker obtains any admin credential they gain full
access, and there is no privilege separation.

**Proposed fix — add a shared `requireAdmin` helper and use it:**

```ts
// lib/auth.ts — new file
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function requireAdmin(): Promise<
  { user: { id: string }; error: null } | { user: null; error: NextResponse }
> {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user: { id: user.id }, error: null };
}
```

Usage in every admin route:

```ts
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  // ... rest of handler
}
```

Also add auth to `GET /api/settings`:

```ts
export async function GET() {
  // Settings contains allowed_ips — restrict to authenticated users
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // ... existing logic
}
```

---

### 5. INPUT VALIDATION

#### 5.1 ❌ FAIL — No Zod server-side validation

**Finding:** No Zod (or equivalent schema library) is used anywhere. Validation is
done with ad-hoc checks:

```ts
if (!body?.name || !body?.pin) { ... }        // presence only
if (!/^\d{4}$/.test(body.pin)) { ... }         // regex on PIN ✓
if (!body?.category || !body?.name) { ... }    // presence only
```

There is no type coercion, length limits, or injection-safe escaping for free-text
fields (names, designations, notes). While Supabase's parameterised queries prevent
SQL injection, stored XSS is possible if an admin name containing `<script>` tags is
rendered without escaping (depends on React's default escaping — React does escape by
default, so risk is low but should be validated server-side explicitly).

**Proposed fix — add Zod validation to mutating routes:**

```ts
// Example: app/api/staff/route.ts POST
import { z } from 'zod';

const CreateStaffSchema = z.object({
  name:        z.string().min(1).max(100),
  pin:         z.string().regex(/^\d{4}$/),
  designation: z.string().max(100).optional(),
  email:       z.string().email().optional(),
  shift_id:    z.string().uuid().optional(),
  photo_url:   z.string().url().optional(),
});

// In POST handler:
const parsed = CreateStaffSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
}
```

Install: `npm install zod`

---

#### 5.2 ✅ PASS — No raw SQL

All database queries use Supabase's query builder (parameterised). No string
interpolation into SQL, no `.rpc()` calls with raw SQL. No injection risk.

---

### 6. SECRETS & ENVIRONMENT

#### 6.1 ✅ PASS — No secrets in repo

Only `.env.local.example` is committed. No `.env.local`, no hardcoded keys.

#### 6.2 ✅ PASS — `.gitignore` covers env files

`.gitignore` contains `.env*.local` — covers `.env.local`, `.env.development.local`, etc.

#### 6.3 ✅ PASS — Only safe vars exposed client-side

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only
`NEXT_PUBLIC_` vars. The service role key (`SUPABASE_SERVICE_ROLE_KEY`) and cron
secret (`CRON_SECRET`) are server-side only.

#### 6.4 ⚠️ NEEDS FIX — Anon key safety assumption broken for kitchen tables

The anon key is safe to expose **only because RLS restricts anonymous access**.
The `daily_kitchen_*` tables have `using (true)` policies, meaning an anonymous
caller with the anon key has unrestricted write/delete access. Fix: see section 2.

---

### 7. TRANSPORT SECURITY

#### 7.1 ✅ PASS — HTTPS enforced

Vercel enforces HTTPS on all deployments and auto-redirects HTTP → HTTPS.
No action required.

---

## Additional Finding: PIN Enumeration via Timing

**Severity:** LOW  
**File:** `app/api/staff/verify-pin/route.ts`, `app/api/checkin/route.ts`

Both endpoints fetch **all** staff profiles and run `bcrypt.compare` in parallel:

```ts
const results = await Promise.all(
  profiles.map(async (p) => ({
    profile: p,
    match: await bcrypt.compare(body.pin, p.pin_hash),
  }))
);
```

bcrypt is intentionally slow, which provides timing resistance per-hash. However,
fetching all profiles on each request means response time scales with staff count.
A more subtle concern: `pin_hash` values are returned from the DB to the API layer.
If the DB were ever compromised, all hashes would be exposed.

**Low risk for this app** (small staff count, bcrypt cost=12). No fix required for
client sign-off, but noted for awareness.

---

## Prioritised Fix List

| Priority | Fix | Effort |
|----------|-----|--------|
| 🔴 HIGH | Add `middleware.ts` for server-side admin route protection | ~30 min |
| 🔴 HIGH | Add `requireAdmin()` role check to all mutating API routes | ~1 hr |
| 🔴 HIGH | Add auth check to `GET /api/settings` | 5 min |
| 🟠 MEDIUM | Fix `daily_kitchen_*` RLS policies (remove `using (true)` on DELETE/UPDATE) | ~10 min SQL |
| 🟠 MEDIUM | Make `staff-photos` bucket private + use signed URLs | ~1 hr |
| 🟡 LOW | Add Zod validation to all mutating API routes | ~2 hr |

**Do NOT apply these automatically** — please review and confirm before changes are made.
