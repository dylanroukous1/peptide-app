'use client';

import type { ElementType, ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { type ScrollDirection, useScrollOverflow } from '@/src/hooks/useScrollOverflow';

type ScrollableResultsProps = {
  children: ReactNode;
  containerClassName?: string;
  containerComponent?: ElementType;
  count: number;
  direction?: ScrollDirection;
  label: string;
  singularLabel: string;
  pluralLabel?: string;
};

export default function ScrollableResults({
  children,
  containerClassName,
  containerComponent: Container = Box,
  count,
  direction = 'vertical',
  label,
  singularLabel,
  pluralLabel = `${singularLabel}s`,
}: ScrollableResultsProps) {
  const {
    ref,
    hasVerticalOverflow,
    hasHorizontalOverflow,
    verticalEnd,
    horizontalEnd,
  } = useScrollOverflow(direction);
  const showVerticalAffordance = hasVerticalOverflow && !verticalEnd;
  const showHorizontalAffordance = hasHorizontalOverflow && !horizontalEnd;

  return (
    <Box className="scroll-affordance">
      <Stack
        className="scroll-affordance__summary"
        direction="row"
        spacing={1}
        useFlexGap
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          {count.toLocaleString('en-US')} {count === 1 ? singularLabel : pluralLabel}
        </Typography>
        {showVerticalAffordance ? (
          <Typography className="scroll-affordance__hint scroll-affordance__hint--vertical" variant="caption" color="text.secondary">
            Scroll to view more ↓
          </Typography>
        ) : null}
        {showHorizontalAffordance ? (
          <Typography className="scroll-affordance__hint scroll-affordance__hint--horizontal" variant="caption" color="text.secondary">
            Scroll right to view more →
          </Typography>
        ) : null}
      </Stack>

      <Box className="scroll-affordance__viewport-wrap">
        <Container
          ref={ref}
          className={['record-results', containerClassName].filter(Boolean).join(' ')}
          role="region"
          aria-label={label}
          tabIndex={0}
        >
          {children}
        </Container>
        <Box
          aria-hidden="true"
          className="scroll-affordance__fade scroll-affordance__fade--bottom"
          data-visible={showVerticalAffordance ? 'true' : 'false'}
        />
        <Box
          aria-hidden="true"
          className="scroll-affordance__fade scroll-affordance__fade--right"
          data-visible={showHorizontalAffordance ? 'true' : 'false'}
        />
      </Box>
    </Box>
  );
}
