'use client';

import { Alert, Button, IconButton, Snackbar, Stack } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { AppToastAction } from '@/src/hooks/useAppToast';

type AppSnackbarProps = {
  open: boolean;
  message: string;
  severity?: 'success' | 'error' | 'info' | 'warning';
  action?: AppToastAction;
  onClose: () => void;
};

export default function AppSnackbar({
  open,
  message,
  severity = 'success',
  action,
  onClose,
}: AppSnackbarProps) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={action ? 15000 : 3500}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        onClose={onClose}
        action={action ? (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Button color="inherit" size="small" onClick={() => void action.onClick()} sx={{ whiteSpace: 'nowrap', fontWeight: 800 }}>
              {action.label}
            </Button>
            <IconButton color="inherit" size="small" aria-label="Close notification" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : undefined}
        severity={severity}
        variant="filled"
        role={severity === 'error' ? 'alert' : 'status'}
        sx={{
          width: '100%',
          minWidth: { xs: 0, sm: 360 },
          maxWidth: { xs: 'calc(100vw - 24px)', sm: 560 },
          justifyContent: 'center',
          textAlign: 'center',
          overflowWrap: 'anywhere',
          borderRadius: 3,
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
