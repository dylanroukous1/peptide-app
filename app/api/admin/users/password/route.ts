import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await req.json();
    const userId = String(body.userId || '').trim();
    const password = String(body.password || '');
    if (!userId || password.trim().length < 12) {
      return NextResponse.json({ error: 'Choose a password with at least 12 characters.' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: authResult, error: authError } = await supabase.auth.getUser(token);
    const adminUser = authResult.user;
    if (authError || !adminUser) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, account_status')
      .eq('id', adminUser.id)
      .single();
    if (profileError || adminProfile?.role !== 'ADMIN' || adminProfile.account_status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Active administrator access is required.' }, { status: 403 });
    }

    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'User account not found.' }, { status: 404 });

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
