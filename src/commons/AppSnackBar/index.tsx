'use client';

import { Alert, Snackbar } from '@mui/material';

type AppSnackbarProps = {
  open: boolean;
  message: string;
  severity?: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
};

export default function AppSnackbar({
  open,
  message,
  severity = 'success',
  onClose,
}: AppSnackbarProps) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={3500}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        role={severity === 'error' ? 'alert' : 'status'}
        sx={{
          width: '100%',
          minWidth: { xs: 0, sm: 360 },
          maxWidth: { xs: 'calc(100vw - 24px)', sm: 560 },
          justifyContent: 'center',
          textAlign: 'center',
          borderRadius: 3,
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
