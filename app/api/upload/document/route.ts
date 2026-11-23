export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/serverAuth';

export async function POST(request: NextRequest) {
  const user = await getAdminUser();
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

  // ID documents: only images/PDF, saved under a fixed name per staff member.
  const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'Upload a photo (JPG/PNG) or PDF' }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) return NextResponse.json({ error: 'Invalid staff' }, { status: 400 });
  const path = `${staffId}/${docType}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('staff-docs')
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate a signed URL (private bucket, 1 year)
  const { data: signed } = await supabase.storage
    .from('staff-docs')
    .createSignedUrl(path, 300); // short-lived link; a fresh one is made each time it is opened

  // Save URL to profile
  const field = docType === 'aadhar' ? 'aadhar_url' : 'pan_url';
  await supabase.from('profiles').update({ [field]: path }).eq('id', staffId);

  return NextResponse.json({ path, url: signed?.signedUrl });
}

export async function GET(request: NextRequest) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path || !/^[0-9a-f-]{36}\/(aadhar|pan)\.(jpg|jpeg|png|webp|pdf|[a-z0-9]{1,5})$/i.test(path)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase.storage.from('staff-docs').createSignedUrl(path, 300); // 5 min
  if (!data) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
