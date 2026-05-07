import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';

function randomPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let output = '';

  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }

  return output;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'USER';
    const companyId = String(body.companyId || '').trim();
    const accountStatus = body.accountStatus === 'SUSPENDED' ? 'SUSPENDED' : body.accountStatus === 'PENDING' ? 'PENDING' : 'ACTIVE';

    if (!email || !firstName || !lastName) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    if (role === 'USER' && !companyId) {
      return NextResponse.json({ error: 'Company is required for USER accounts.' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: adminProfile, error: adminProfileError } = await supabase
      .from('profiles')
      .select('role, account_status')
      .eq('id', user.id)
      .single();

    if (
      adminProfileError ||
      !adminProfile ||
      adminProfile.role !== 'ADMIN' ||
      adminProfile.account_status !== 'ACTIVE'
    ) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const finalPassword = password || randomPassword();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create auth user.' },
        { status: 400 }
      );
    }

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        account_status: accountStatus,
        company_id: role === 'ADMIN' ? null : companyId,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      authUserId: authData.user.id,
      email,
      password: finalPassword,
      generatedPassword: password ? null : finalPassword,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
