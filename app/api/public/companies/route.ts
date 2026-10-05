import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Unable to load available companies.' }, { status: 500 });
    }

    return NextResponse.json({ companies: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
