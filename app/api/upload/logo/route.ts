export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.id === 'logos');
  if (!exists) {
    const { error: bucketErr } = await supabase.storage.createBucket('logos', { public: true });
    if (bucketErr) return NextResponse.json({ error: bucketErr.message }, { status: 500 });
  }

  const ext = file.name.split('.').pop() ?? 'png';
  const path = `logo.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('logos')
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
