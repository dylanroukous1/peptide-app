import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';

function randomPassword(length = 18) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('');
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await req.json();
    const requestId = String(body.requestId || '').trim();
    const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
    if (!requestId || !action) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

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

    if (action === 'reject') {
      const { error } = await supabase.rpc('admin_reject_access_request', {
        p_request_id: requestId,
        p_admin_id: adminUser.id,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, status: 'REJECTED' });
    }

    const { data: request, error: requestError } = await supabase
      .from('account_requests')
      .select('id, first_name, last_name, email, company_id, company_name, status')
      .eq('id', requestId)
      .single();
    if (requestError || !request) return NextResponse.json({ error: 'Access request not found.' }, { status: 404 });
    if (request.status !== 'PENDING') return NextResponse.json({ error: 'This access request is no longer pending.' }, { status: 409 });

    let companyId = request.company_id as string | null;
    if (!companyId && request.company_name) {
      const { data: matchingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('is_active', true)
        .ilike('name', request.company_name.trim())
        .limit(1)
        .maybeSingle();
      companyId = matchingCompany?.id || null;
    }
    if (!companyId) return NextResponse.json({ error: 'This request has no available company. Ask the requester to submit a new request.' }, { status: 400 });

    const password = randomPassword();
    const { data: createdAuth, error: createError } = await supabase.auth.admin.createUser({
      email: String(request.email).trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { first_name: request.first_name, last_name: request.last_name },
    });
    if (createError || !createdAuth.user) {
      return NextResponse.json({ error: createError?.message || 'Could not create the sign-in account.' }, { status: 400 });
    }

    const { data: createdProfile, error: finalizeError } = await supabase.rpc('admin_finalize_access_request', {
      p_request_id: requestId,
      p_admin_id: adminUser.id,
      p_auth_user_id: createdAuth.user.id,
    });
    if (finalizeError || !createdProfile) {
      await supabase.auth.admin.deleteUser(createdAuth.user.id);
      return NextResponse.json({ error: finalizeError?.message || 'Could not finish approving the request.' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      profile: createdProfile,
      email: String(request.email).trim().toLowerCase(),
      generatedPassword: password,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
