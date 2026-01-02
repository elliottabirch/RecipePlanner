import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Restaurant as RecipeIcon,
  CalendarMonth as PlanIcon,
  ListAlt as OutputIcon,
  ExpandLess,
  ExpandMore,
  Store as StoreIcon,
  Category as SectionIcon,
  Inventory as ContainerIcon,
  Label as TagIcon,
  Egg as ProductIcon,
  Settings as RegistryIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 260;

const registryItems = [
  { label: 'Products', path: '/registries/products', icon: <ProductIcon /> },
  { label: 'Stores', path: '/registries/stores', icon: <StoreIcon /> },
  { label: 'Sections', path: '/registries/sections', icon: <SectionIcon /> },
  { label: 'Containers', path: '/registries/containers', icon: <ContainerIcon /> },
  { label: 'Tags', path: '/registries/tags', icon: <TagIcon /> },
];

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [registriesOpen, setRegistriesOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const isActive = (path: string) => location.pathname === path;
  const isRegistryActive = location.pathname.startsWith('/registries');

  const drawerContent = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 'bold' }}>
          🍽️ Meal Planner
        </Typography>
      </Toolbar>
      <List>
        {/* Recipes */}
        <ListItemButton
          selected={isActive('/recipes')}
          onClick={() => handleNavClick('/recipes')}
        >
          <ListItemIcon>
            <RecipeIcon />
          </ListItemIcon>
          <ListItemText primary="Recipes" />
        </ListItemButton>

        {/* Weekly Plans */}
        <ListItemButton
          selected={isActive('/plans')}
          onClick={() => handleNavClick('/plans')}
        >
          <ListItemIcon>
            <PlanIcon />
          </ListItemIcon>
          <ListItemText primary="Weekly Plans" />
        </ListItemButton>

        {/* Outputs */}
        <ListItemButton
          selected={isActive('/outputs')}
          onClick={() => handleNavClick('/outputs')}
        >
          <ListItemIcon>
            <OutputIcon />
          </ListItemIcon>
          <ListItemText primary="Outputs" />
        </ListItemButton>

        {/* Registries (collapsible) */}
        <ListItemButton onClick={() => setRegistriesOpen(!registriesOpen)}>
          <ListItemIcon>
            <RegistryIcon />
          </ListItemIcon>
          <ListItemText primary="Registries" />
          {registriesOpen ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={registriesOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {registryItems.map((item) => (
              <ListItemButton
                key={item.path}
                selected={isActive(item.path)}
                onClick={() => handleNavClick(item.path)}
                sx={{ pl: 4 }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Collapse>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            {location.pathname.includes('/registries')
              ? 'Registries'
              : location.pathname.includes('/recipes')
              ? 'Recipes'
              : location.pathname.includes('/plans')
              ? 'Weekly Plans'
              : location.pathname.includes('/outputs')
              ? 'Outputs'
              : 'Meal Planner'}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { xs: 0, md: `${DRAWER_WIDTH}px` },
          mt: '64px',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}