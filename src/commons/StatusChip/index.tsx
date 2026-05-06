'use client';

import { StyledStatusChip } from './styles';

type StatusChipProps = {
  status?: string | null;
  label?: string;
};

function normalizeStatusKey(status?: string | null) {
  const value = String(status || '')
    .trim()
    .toUpperCase();

  switch (value) {
    case 'SUBMITTED':
      return 'submitted';
    case 'UNDER_REVIEW':
      return 'underReview';
    case 'APPROVED':
      return 'approved';
    case 'IN_PRODUCTION':
      return 'inProduction';
    case 'FULFILLED':
      return 'fulfilled';
    case 'CANCELLED':
      return 'cancelled';
    case 'EXPIRED':
      return 'expired';
    case 'OPEN':
      return 'open';
    case 'CLOSED':
      return 'closed';
    case 'ARCHIVED':
      return 'archived';
    case 'PENDING':
      return 'pending';
    case 'ACTIVE':
      return 'active';
    case 'SUSPENDED':
      return 'suspended';
    case 'CONFIRMED':
      return 'confirmed';
    case 'CONVERTED_TO_BATCH':
      return 'converted';
    default:
      return 'default';
  }
}

function formatLabel(value?: string | null) {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

export default function StatusChip({ status, label }: StatusChipProps) {
  const statusKey = normalizeStatusKey(status);
  const displayLabel = label || formatLabel(status);

  return <StyledStatusChip label={displayLabel} statuskey={statusKey} />;
}