'use client';

import { Box, Skeleton, Stack } from '@mui/material';

type PageSkeletonProps = {
  cards?: number;
  rows?: number;
  label?: string;
};

export default function PageSkeleton({
  cards = 4,
  rows = 4,
  label = 'Loading page content',
}: PageSkeletonProps) {
  return (
    <Stack
      spacing={3}
      role="status"
      aria-live="polite"
      aria-label={label}
      sx={{ width: '100%' }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            xl: `repeat(${Math.min(cards, 4)}, minmax(0, 1fr))`,
          },
          gap: 2,
        }}
      >
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton
            key={index}
            variant="rounded"
            height={112}
            sx={{ borderRadius: 2 }}
          />
        ))}
      </Box>

      <Box
        sx={{
          border: '1px solid #E2E8F0',
          borderRadius: 2,
          backgroundColor: '#FFFFFF',
          p: { xs: 2, sm: 3 },
        }}
      >
        <Skeleton width="32%" height={34} />
        <Skeleton width="58%" height={22} sx={{ mb: 2 }} />
        <Stack spacing={1.5}>
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={64} sx={{ borderRadius: 1.5 }} />
          ))}
        </Stack>
      </Box>
      <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {label}
      </Box>
    </Stack>
  );
}
