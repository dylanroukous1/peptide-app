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
      sx={{
        '&.MuiSnackbar-root': {
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
        },
      }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        sx={{
          width: '100%',
          minWidth: { xs: 280, sm: 360 },
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