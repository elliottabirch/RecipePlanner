import { useState, useEffect, type ReactNode } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
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
  Tooltip,
  useMediaQuery,
  useTheme,
  Badge,
} from "@mui/material";
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
  Inventory2 as InventoryIcon,
  FactCheck as BackfillIcon,
} from "@mui/icons-material";
import DatabaseSwitcher from "./DatabaseSwitcher";
import { useRecipeQueue } from "../hooks/useRecipeQueue";

const DRAWER_WIDTH = 260;
// Icon-only rail width when the desktop drawer is collapsed — wide enough for a
// centered 24px icon + touch padding.
const COLLAPSED_WIDTH = 72;
const NAV_COLLAPSED_KEY = "nav.collapsed";

const registryItems = [
  { label: "Products", path: "/registries/products", icon: <ProductIcon /> },
  { label: "Stores", path: "/registries/stores", icon: <StoreIcon /> },
  { label: "Sections", path: "/registries/sections", icon: <SectionIcon /> },
  {
    label: "Containers",
    path: "/registries/containers",
    icon: <ContainerIcon />,
  },
  { label: "Tags", path: "/registries/tags", icon: <TagIcon /> },
];

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [registriesOpen, setRegistriesOpen] = useState(true);
  // Desktop icon-rail collapse — persisted so the choice survives a tablet
  // refresh (mirrors how the rest of prep-day state persists).
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const { queueItems } = useRecipeQueue();

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore storage failures (private mode) */
    }
  }, [collapsed]);

  // The one menu button drives both drawers: it toggles the overlay on mobile
  // and the icon-rail collapse on desktop.
  const handleMenuButton = () => {
    if (isMobile) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const desktopWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;
  const widthTransition = theme.transitions.create(["width", "margin"], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  });

  // `mini` = icon-only rail: hide labels, center icons, show a hover tooltip so
  // each destination is still discoverable.
  const renderNav = (
    label: string,
    path: string,
    icon: ReactNode,
    mini: boolean
  ) => (
    <Tooltip title={mini ? label : ""} placement="right" arrow>
      <ListItemButton
        selected={isActive(path)}
        onClick={() => handleNavClick(path)}
        sx={{ justifyContent: mini ? "center" : "flex-start", px: mini ? 2.5 : 2 }}
      >
        <ListItemIcon sx={{ minWidth: mini ? 0 : 40, justifyContent: "center" }}>
          {icon}
        </ListItemIcon>
        {!mini && <ListItemText primary={label} />}
      </ListItemButton>
    </Tooltip>
  );

  const renderDrawer = (mini: boolean) => (
    <Box>
      <Toolbar sx={{ justifyContent: mini ? "center" : "flex-start", px: mini ? 1 : 2 }}>
        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{ fontWeight: "bold" }}
        >
          {mini ? "🍽️" : "🍽️ Meal Planner"}
        </Typography>
      </Toolbar>
      <List>
        {renderNav(
          "Recipes",
          "/recipes",
          <Badge badgeContent={queueItems.length} color="primary" max={99}>
            <RecipeIcon />
          </Badge>,
          mini
        )}
        {renderNav("Weekly Plans", "/plans", <PlanIcon />, mini)}
        {renderNav("Outputs", "/outputs", <OutputIcon />, mini)}
        {renderNav("Inventory", "/inventory", <InventoryIcon />, mini)}
        {renderNav("Step Backfill", "/step-backfill", <BackfillIcon />, mini)}

        {/* Registries (collapsible submenu; in the rail its icon expands the
            drawer so the sub-items become reachable) */}
        <Tooltip title={mini ? "Registries" : ""} placement="right" arrow>
          <ListItemButton
            onClick={() => {
              if (mini) {
                setCollapsed(false);
                setRegistriesOpen(true);
              } else {
                setRegistriesOpen(!registriesOpen);
              }
            }}
            sx={{ justifyContent: mini ? "center" : "flex-start", px: mini ? 2.5 : 2 }}
          >
            <ListItemIcon
              sx={{ minWidth: mini ? 0 : 40, justifyContent: "center" }}
            >
              <RegistryIcon />
            </ListItemIcon>
            {!mini && (
              <>
                <ListItemText primary="Registries" />
                {registriesOpen ? <ExpandLess /> : <ExpandMore />}
              </>
            )}
          </ListItemButton>
        </Tooltip>
        <Collapse in={registriesOpen && !mini} timeout="auto" unmountOnExit>
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
    <Box sx={{ display: "flex" }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${desktopWidth}px)` },
          ml: { md: `${desktopWidth}px` },
          transition: widthTransition,
        }}
      >
        <Toolbar>
          <Tooltip
            title={
              isMobile ? "Menu" : collapsed ? "Expand menu" : "Collapse menu"
            }
          >
            <IconButton
              color="inherit"
              edge="start"
              onClick={handleMenuButton}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" noWrap component="div">
            {location.pathname.includes("/registries")
              ? "Registries"
              : location.pathname.includes("/recipes")
              ? "Recipes"
              : location.pathname.includes("/plans")
              ? "Weekly Plans"
              : location.pathname.includes("/inventory")
              ? "Inventory"
              : location.pathname.includes("/outputs")
              ? "Outputs"
              : location.pathname.includes("/step-backfill")
              ? "Step Backfill"
              : "Meal Planner"}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <DatabaseSwitcher />
        </Toolbar>
      </AppBar>

      {/* Mobile drawer — always the full-width overlay (rail is desktop-only) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleMenuButton}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: DRAWER_WIDTH,
          },
        }}
      >
        {renderDrawer(false)}
      </Drawer>

      {/* Desktop drawer — collapses to an icon rail */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: desktopWidth,
            overflowX: "hidden",
            transition: theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          },
        }}
        open
      >
        {renderDrawer(collapsed)}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { xs: "100vw", md: `calc(100vw - ${desktopWidth}px)` },
          maxWidth: { xs: "100vw", md: `calc(100vw - ${desktopWidth}px)` },
          ml: { xs: 0, md: `${desktopWidth}px` },
          mt: "64px",
          height: "calc(100vh - 64px)", // constrains to viewport minus AppBar
          overflow: "auto",
          boxSizing: "border-box",
          transition: widthTransition,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
