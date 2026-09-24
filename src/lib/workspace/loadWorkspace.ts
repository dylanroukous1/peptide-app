import type { User } from '@supabase/supabase-js';
import { supabase } from '@/src/supabase/client';
import { singleRelation } from '@/src/lib/supabase/relations';

export type WorkspaceRole = 'ADMIN' | 'USER';

export type WorkspaceProfile = {
  id: string;
  role: WorkspaceRole;
  company_id: string | null;
};

export type CustomerPeptide = {
  id: string;
  name: string;
  default_unit_price: number;
};

export type CustomerAddress = {
  id: string;
  label: string | null;
  recipient_name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

export type AdminOrder = {
  id: string;
  order_number: string;
  requested_quantity: number | null;
  approved_quantity: number | null;
  unit_price_at_submission: number | null;
  total_price: number;
  discount_type: 'PERCENT' | 'FIXED' | null;
  discount_value: number | null;
  discount_amount: number;
  final_total: number;
  status: string;
  user_notes: string | null;
  submitted_at: string;
  items: Array<{
    id: string;
    requested_quantity: number;
    approved_quantity: number | null;
    unit_price_at_submission: number;
    unit_price_final: number | null;
    line_total: number;
    peptide?: { name: string } | null;
  }>;
  peptide?: { name: string } | null;
  company?: { name: string } | null;
  user?: { first_name: string; last_name: string; email: string | null } | null;
  batch?: {
    batch_code: string;
    eta_date: string | null;
    peptide?: { name: string } | null;
  } | null;
  address?: { label: string | null; line1: string; city: string } | null;
  shipment?: {
    id: string;
    tracking_number: string | null;
    ship_date: string | null;
    estimated_delivery_date: string | null;
    carrier_name: string | null;
    shipment_notes: string | null;
  } | null;
};

export type PreparedWorkspace =
  | {
      userId: string;
      role: 'ADMIN';
      destination: '/admin/orders';
      orders: AdminOrder[];
    }
  | {
      userId: string;
      role: 'USER';
      destination: '/dashboard';
      peptides: CustomerPeptide[];
      addresses: CustomerAddress[];
    };

export async function loadAdminOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      requested_quantity,
      approved_quantity,
      unit_price_at_submission,
      total_price,
      discount_type,
      discount_value,
      discount_amount,
      final_total,
      status,
      user_notes,
      submitted_at,
      items:order_items(
        id,
        requested_quantity,
        approved_quantity,
        unit_price_at_submission,
        unit_price_final,
        line_total,
        peptide:peptides(name)
      ),
      peptide:peptides(name),
      company:companies(name),
      user:profiles!orders_user_id_fkey(first_name, last_name, email),
      batch:batches(batch_code, eta_date, peptide:peptides(name)),
      address:company_addresses(label, line1, city),
      shipment:shipments(id, tracking_number, ship_date, estimated_delivery_date, carrier_name, shipment_notes)
    `)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(`Unable to load admin orders: ${error.message}`);

  return (data || []).map((row) => {
    const batch = singleRelation(row.batch);
    return {
      ...row,
      items: (row.items || []).map((item) => ({
        ...item,
        peptide: singleRelation(item.peptide),
      })),
      peptide: singleRelation(row.peptide),
      company: singleRelation(row.company),
      user: singleRelation(row.user),
      batch: batch ? { ...batch, peptide: singleRelation(batch.peptide) } : null,
      address: singleRelation(row.address),
      shipment: singleRelation(row.shipment),
    } as AdminOrder;
  });
}

export async function loadCustomerOrderingData(companyId: string | null) {
  const peptideRequest = supabase
    .from('peptides')
    .select('id, name, default_unit_price')
    .eq('is_active', true)
    .order('name');
  const addressRequest = companyId
    ? supabase
        .from('company_addresses')
        .select('id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default')
        .eq('company_id', companyId)
        .order('is_default', { ascending: false })
    : Promise.resolve({ data: [] as CustomerAddress[], error: null });
  const [peptideResult, addressResult] = await Promise.all([peptideRequest, addressRequest]);

  if (peptideResult.error || addressResult.error) {
    throw new Error(
      `Unable to load customer workspace: ${peptideResult.error?.message || addressResult.error?.message}`
    );
  }

  return {
    peptides: (peptideResult.data || []) as CustomerPeptide[],
    addresses: (addressResult.data || []) as CustomerAddress[],
  };
}

export async function loadPreparedWorkspace(
  user: User,
  profile: WorkspaceProfile
): Promise<PreparedWorkspace> {
  if (profile.role === 'ADMIN') {
    return {
      userId: user.id,
      role: 'ADMIN',
      destination: '/admin/orders',
      orders: await loadAdminOrders(),
    };
  }

  const data = await loadCustomerOrderingData(profile.company_id);
  return {
    userId: user.id,
    role: 'USER',
    destination: '/dashboard',
    ...data,
  };
}
