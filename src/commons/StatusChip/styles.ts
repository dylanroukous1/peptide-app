import { Chip, styled } from '@mui/material';

type StatusColorKey =
  | 'default'
  | 'submitted'
  | 'underReview'
  | 'approved'
  | 'inProduction'
  | 'fulfilled'
  | 'cancelled'
  | 'expired'
  | 'open'
  | 'closed'
  | 'archived'
  | 'pending'
  | 'active'
  | 'suspended'
  | 'confirmed'
  | 'converted';

const statusColorMap: Record<StatusColorKey, { bg: string; color: string; border: string }> = {
  default: {
    bg: '#F8FAFC',
    color: '#475569',
    border: '#E2E8F0',
  },
  submitted: {
    bg: '#F8FAFC',
    color: '#475569',
    border: '#CBD5E1',
  },
  underReview: {
    bg: '#EFF6FF',
    color: '#1D4ED8',
    border: '#BFDBFE',
  },
  approved: {
    bg: '#ECFDF5',
    color: '#047857',
    border: '#A7F3D0',
  },
  inProduction: {
    bg: '#F5F3FF',
    color: '#6D28D9',
    border: '#DDD6FE',
  },
  fulfilled: {
    bg: '#F0FDF4',
    color: '#15803D',
    border: '#BBF7D0',
  },
  cancelled: {
    bg: '#FEF2F2',
    color: '#B91C1C',
    border: '#FECACA',
  },
  expired: {
    bg: '#FFFBEB',
    color: '#B45309',
    border: '#FDE68A',
  },
  open: {
    bg: '#ECFDF5',
    color: '#047857',
    border: '#A7F3D0',
  },
  closed: {
    bg: '#F8FAFC',
    color: '#475569',
    border: '#CBD5E1',
  },
  archived: {
    bg: '#F8FAFC',
    color: '#475569',
    border: '#CBD5E1',
  },
  pending: {
    bg: '#FFF7ED',
    color: '#C2410C',
    border: '#FED7AA',
  },
  active: {
    bg: '#ECFDF5',
    color: '#047857',
    border: '#A7F3D0',
  },
  suspended: {
    bg: '#FEF2F2',
    color: '#B91C1C',
    border: '#FECACA',
  },
  confirmed: {
    bg: '#ECFDF5',
    color: '#047857',
    border: '#A7F3D0',
  },
  converted: {
    bg: '#F0FDF4',
    color: '#166534',
    border: '#BBF7D0',
  },
};

export const StyledStatusChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== 'statuskey',
})<{ statuskey: StatusColorKey }>(({ statuskey }) => {
  const palette = statusColorMap[statuskey] || statusColorMap.default;

  return {
    height: 32,
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0.2,
    backgroundColor: palette.bg,
    color: palette.color,
    border: `1px solid ${palette.border}`,
    '& .MuiChip-label': {
      paddingLeft: 12,
      paddingRight: 12,
    },
  };
});