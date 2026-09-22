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
  orders: Record<string, { orderNumber: string; productName?: string }>;
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

export function formatAuditMessage(event: AuditEvent, references: AuditReferences) {
  const actor = auditActorLabel(event.actor_user_id, references);
  const action = event.action.toUpperCase();
  const order = references.orders[event.entity_id];
  const orderNumber = order?.orderNumber || String(event.after_json?.order_number || event.entity_id);
  const productName =
    order?.productName ||
    references.peptides[String(event.after_json?.peptide_id || '')] ||
    'the selected product';

  if (action === 'ORDER_SUBMITTED' || action === 'ORDER_CREATED') {
    return `${actor} created order ${orderNumber} for ${productName}.`;
  }
  if (action === 'ORDER_STATUS_UPDATED') {
    const before = humanizeAuditValue(event.before_json?.status || 'previous status');
    const after = humanizeAuditValue(event.after_json?.status || 'updated status');
    return `${actor} changed order ${orderNumber} from ${before} to ${after}.`;
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
    if (action.includes('CREAT')) return `${actor} created ${name}.`;
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
