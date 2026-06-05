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
  const docType = formData?.get('type') as string | null; // 'aadhar' | 'pan'
  const staffId = formData?.get('staffId') as string | null;

  if (!file || !docType || !staffId) {
    return NextResponse.json({ error: 'file, type, and staffId are required' }, { status: 400 });
  }
  if (!['aadhar', 'pan'].includes(docType)) {
    return NextResponse.json({ error: 'type must be aadhar or pan' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.id === 'staff-docs')) {
    await supabase.storage.createBucket('staff-docs', { public: false });
  }

  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${staffId}/${docType}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('staff-docs')
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate a signed URL (private bucket, 1 year)
  const { data: signed } = await supabase.storage
    .from('staff-docs')
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  // Save URL to profile
  const field = docType === 'aadhar' ? 'aadhar_url' : 'pan_url';
  await supabase.from('profiles').update({ [field]: path }).eq('id', staffId);

  return NextResponse.json({ path, url: signed?.signedUrl });
}

export async function GET(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase.storage.from('staff-docs').createSignedUrl(path, 300); // 5 min
  if (!data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
