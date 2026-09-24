export type AuditEvent = {
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
};

export type AuditReferences = {
  actors: Record<string, string>;
  orders: Record<string, {
    orderNumber: string;
    productName?: string;
    itemCount?: number;
    totalQuantity?: number;
    totalPrice?: number;
  }>;
  peptides: Record<string, string>;
  companies: Record<string, string>;
  users: Record<string, string>;
};

export function humanizeAuditValue(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function auditActorLabel(actorId: string | null, references: AuditReferences) {
  if (!actorId) return 'System';
  return references.actors[actorId] || 'Unknown administrator';
}

function money(value: unknown) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatAuditMessage(event: AuditEvent, references: AuditReferences) {
  const actor = auditActorLabel(event.actor_user_id, references);
  const action = event.action.toUpperCase();
  const order = references.orders[event.entity_id];
  const orderNumber = order?.orderNumber || String(event.after_json?.order_number || event.entity_id);
  const productName =
    order?.productName ||
    references.peptides[String(event.after_json?.peptide_id || '')] ||
    'the selected product';
  const itemCount = Number(order?.itemCount ?? event.after_json?.item_count ?? 1);
  const totalQuantity = Number(
    order?.totalQuantity ??
    event.after_json?.total_quantity ??
    event.after_json?.requested_quantity ??
    0
  );
  const totalPrice = Number(order?.totalPrice ?? event.after_json?.total_price ?? 0);

  if (action === 'ORDER_SUBMITTED' || action === 'ORDER_CREATED') {
    if (itemCount > 0 && totalQuantity > 0) {
      return `${actor} submitted order ${orderNumber} containing ${itemCount} ${itemCount === 1 ? 'product' : 'products'} and ${totalQuantity.toLocaleString('en-US')} vials for ${money(totalPrice)}.`;
    }
    return `${actor} submitted order ${orderNumber} for ${productName}.`;
  }
  if (action === 'ORDER_STATUS_UPDATED') {
    const before = humanizeAuditValue(event.before_json?.status || 'previous status');
    const after = humanizeAuditValue(event.after_json?.status || 'updated status');
    if (after === 'Approved' && itemCount > 0) {
      return `${actor} approved order ${orderNumber} containing ${itemCount} ${itemCount === 1 ? 'product' : 'products'}.`;
    }
    return `${actor} changed order ${orderNumber} from ${before} to ${after}.`;
  }
  if (action === 'ORDER_TRACKING_ADDED') {
    return `${actor} added ${String(event.after_json?.carrier_name || 'carrier')} tracking ${String(event.after_json?.tracking_number || '')} to order ${orderNumber}.`;
  }
  if (action === 'ORDER_SHIPMENT_UPDATED') {
    return `${actor} updated shipping information for order ${orderNumber}.`;
  }
  if (action === 'ORDER_DISCOUNT_UPDATED') {
    return `${actor} applied a ${money(event.after_json?.discount_amount)} discount to order ${orderNumber}.`;
  }
  if (action === 'ORDER_DISCOUNT_REMOVED') {
    return `${actor} removed the discount from order ${orderNumber}.`;
  }
  if (action === 'ORDER_VOIDED') {
    const finalTotal = event.after_json?.final_total ?? order?.totalPrice ?? 0;
    const reason = String(event.after_json?.reason || 'No reason recorded').trim();
    return `${actor} voided order ${orderNumber} for ${money(finalTotal)}. Reason: ${reason}.`;
  }
  if (action === 'ORDER_REACTIVATED') {
    const reason = String(event.after_json?.reason || 'No reason recorded').trim();
    return `${actor} reactivated order ${orderNumber}. Reason: ${reason}.`;
  }
  if (action === 'ORDER_DELETED') {
    const deletedOrderNumber = String(event.before_json?.order_number || orderNumber);
    return `${actor} permanently deleted order ${deletedOrderNumber}.`;
  }

  const entityType = event.entity_type.toLowerCase();
  if (entityType === 'peptide') {
    const name = references.peptides[event.entity_id] || String(event.after_json?.name || 'a product');
    if (action.includes('ACTIV')) return `${actor} activated ${name}.`;
    if (action.includes('DEACTIV')) return `${actor} deactivated ${name}.`;
    return `${actor} updated ${name}.`;
  }
  if (entityType === 'company') {
    const name = references.companies[event.entity_id] || String(event.after_json?.name || 'a company');
    if (action === 'COMPANY_ADDRESS_CREATED') return `${actor} added a shipping address for ${name}.`;
    if (action === 'COMPANY_ADDRESS_UPDATED') {
      return event.after_json?.is_default
        ? `${actor} updated the default shipping address for ${name}.`
        : `${actor} updated a shipping address for ${name}.`;
    }
    if (action.includes('CREAT')) return event.after_json?.has_shipping_address
      ? `${actor} created company ${name} with a primary shipping address.`
      : `${actor} created ${name}.`;
    return `${actor} updated ${name}’s company details.`;
  }
  if (entityType === 'profile' || entityType === 'user') {
    const name = references.users[event.entity_id] || String(event.after_json?.email || 'a user');
    if (action.includes('CREAT')) return `A new user account was created for ${name}.`;
    return `${actor} updated the account for ${name}.`;
  }

  return `${actor} ${humanizeAuditValue(event.action).toLowerCase()} ${humanizeAuditValue(event.entity_type).toLowerCase() || 'a record'}.`;
}

const sensitiveKey = /(password|token|secret|service.?role|authorization|credential)/i;

export function sanitizeAuditDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditDetails);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, nested]) => [key, sanitizeAuditDetails(nested)])
  );
}
