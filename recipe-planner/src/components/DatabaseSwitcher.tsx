import { useState } from 'react';
import {
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert
} from '@mui/material';
import { Storage, SwapHoriz } from '@mui/icons-material';
import { type DbEnvironment } from '../lib/db-config';
import { getEnvironment, switchDatabase, getDbUrl } from '../lib/pocketbase';

export default function DatabaseSwitcher() {
  const [currentEnv, setCurrentEnv] = useState<DbEnvironment>(getEnvironment());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingEnv, setPendingEnv] = useState<DbEnvironment | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectEnvironment = (env: DbEnvironment) => {
    handleClose();
    
    // If switching to production, show confirmation dialog
    if (env === 'production' && currentEnv !== 'production') {
      setPendingEnv(env);
      setConfirmDialogOpen(true);
    } else {
      performSwitch(env);
    }
  };

  const performSwitch = async (env: DbEnvironment) => {
    if (env === currentEnv) return;
    
    try {
      await switchDatabase(env);
      // Note: Page will reload, so the following lines won't execute
      setCurrentEnv(env);
    } catch (error) {
      console.error('Failed to switch database:', error);
      alert('Failed to switch database. Please try again.');
    }
  };

  const handleConfirmSwitch = () => {
    setConfirmDialogOpen(false);
    if (pendingEnv) {
      performSwitch(pendingEnv);
      setPendingEnv(null);
    }
  };

  const handleCancelSwitch = () => {
    setConfirmDialogOpen(false);
    setPendingEnv(null);
  };

  const isProduction = currentEnv === 'production';
  const chipColor = isProduction ? 'error' : 'success';
  const chipLabel = isProduction ? 'PROD' : 'TEST';
  const icon = <Storage fontSize="small" />;

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          icon={icon}
          label={chipLabel}
          color={chipColor}
          size="small"
          onClick={handleClick}
          sx={{
            fontWeight: 'bold',
            cursor: 'pointer',
            '&:hover': {
              opacity: 0.8
            }
          }}
        />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem 
          onClick={() => handleSelectEnvironment('test')}
          selected={currentEnv === 'test'}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: 'success.main'
              }}
            />
            <Typography>Test Database</Typography>
          </Box>
        </MenuItem>
        <MenuItem 
          onClick={() => handleSelectEnvironment('production')}
          selected={currentEnv === 'production'}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: 'error.main'
              }}
            />
            <Typography>Production Database</Typography>
          </Box>
        </MenuItem>
      </Menu>

      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelSwitch}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SwapHoriz color="warning" />
          Switch to Production Database?
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            You are about to switch to the PRODUCTION database.
          </Alert>
          <Typography variant="body1" gutterBottom>
            All changes made will affect live data. Please ensure you are ready to work with production data.
          </Typography>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Current:</strong> {getDbUrl()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Switching to:</strong> http://192.168.50.95:8090
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelSwitch} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmSwitch} 
            variant="contained" 
            color="error"
            autoFocus
          >
            Switch to Production
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
