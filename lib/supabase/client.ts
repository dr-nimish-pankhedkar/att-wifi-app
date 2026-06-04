import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Fallback placeholders prevent build-time throws when env vars aren't set.
  // At runtime the real values are always present via .env.local or Vercel env.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
  );
}
