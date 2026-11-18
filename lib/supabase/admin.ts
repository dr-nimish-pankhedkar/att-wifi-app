import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with the service role.
 * Every request bypasses Next.js' fetch/Data Cache: without this, GET route handlers
 * (e.g. the POS floor and kitchen board) could keep serving an old copy of the data.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-role-key',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}
