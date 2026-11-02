import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Box, Collapse, Drawer, IconButton, InputAdornment, InputBase, List, ListItemButton, ListItemIcon,
  ListItemText, Typography,
} from '@mui/material';
import {
  AccountBalanceWallet, Apartment, Assessment, Close, ExpandMore, FolderOpen, Handyman, Menu as MenuIcon,
  QueryStats, Search, Shuffle,
} from '@mui/icons-material';
import api, { errorMessage } from '../api';

const DRAWER_WIDTH = 320;
const RAIL_WIDTH = 56;
const BLUE = '#1a35b0';

// Icon for each main menu, matched on its name; anything else gets a folder
const MENU_ICONS = [
  [/master/i, Apartment],
  [/transaction/i, Shuffle],
  [/report/i, Assessment],
  [/query/i, QueryStats],
  [/utilit/i, Handyman],
  [/financ|account/i, AccountBalanceWallet],
];
const menuIcon = (name) => (MENU_ICONS.find(([re]) => re.test(name)) || [null, FolderOpen])[1];

// Main menus come from sys_menufile, the items under them from sys_programfile.
// The menu opens from the button at the top left; one main menu is expanded at a time.
export default function Layout() {
  const [menus, setMenus] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/menu')
      .then(({ data }) => {
        setMenus(data);
        if (data.length) setExpanded(data[0].menu_code);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // While searching, show only matching items and expand every menu that has one
  const q = search.trim().toLowerCase();
  const shown = menus
    .map((m) => ({ ...m, programs: m.programs.filter((p) => !q || p.name.toLowerCase().includes(q)) }))
    .filter((m) => !q || m.programs.length);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSearch('');
  };

  return (
    <Box>
      {/* Blue rail down the left: menu button at the top, version at the bottom */}
      <Box
        sx={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: RAIL_WIDTH, bgcolor: BLUE, color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: (t) => t.zIndex.appBar,
        }}
      >
        <IconButton aria-label="open menu" onClick={() => setDrawerOpen(true)} sx={{ color: '#fff', mt: 0.5 }}>
          <MenuIcon fontSize="large" />
        </IconButton>
        <Box sx={{ mt: 'auto', mb: 1.5, textAlign: 'center', fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
          V1
          <br />
          {__APP_VERSION__}
        </Box>
      </Box>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', p: 1 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <InputBase
            autoFocus
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startAdornment={(
              <InputAdornment position="start">
                <Search sx={{ color: '#888' }} />
              </InputAdornment>
            )}
            sx={{ flex: 1, bgcolor: '#eee', borderRadius: 1, px: 1.5, py: 0.75, fontSize: 16 }}
          />
          <IconButton aria-label="close menu" onClick={closeDrawer} sx={{ color: BLUE }}>
            <Close fontSize="large" />
          </IconButton>
        </Box>

        <List disablePadding>
          {error && <Typography color="error" sx={{ px: 2 }} variant="body2">{error}</Typography>}
          {q && shown.length === 0 && <Typography sx={{ px: 2, color: '#888' }} variant="body2">No matching menu</Typography>}
          {shown.map((menu) => {
            const isOpen = Boolean(q) || expanded === menu.menu_code;
            const Icon = menuIcon(menu.name);
            return (
              <Box key={menu.menu_code}>
                <ListItemButton
                  onClick={() => setExpanded(isOpen ? null : menu.menu_code)}
                  sx={{
                    borderRadius: 1.5,
                    mb: 0.5,
                    color: isOpen ? '#fff' : '#222',
                    bgcolor: isOpen ? BLUE : 'transparent',
                    '&:hover': { bgcolor: isOpen ? BLUE : '#f0f2f8' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={menu.name} primaryTypographyProps={{ fontWeight: 700 }} />
                  <ExpandMore sx={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </ListItemButton>
                <Collapse in={isOpen} unmountOnExit>
                  <List disablePadding sx={{ mb: 0.5 }}>
                    {menu.programs.length === 0 && <ListItemText sx={{ pl: 7, py: 0.5 }} secondary="No items" />}
                    {menu.programs.map((p) => (
                      <ListItemButton
                        key={p.program_code}
                        component={NavLink}
                        to={p.route}
                        onClick={closeDrawer}
                        sx={{
                          pl: 7,
                          py: 0.75,
                          borderRadius: 1.5,
                          '&.active': { bgcolor: '#e3e8f8', color: BLUE, fontWeight: 600 },
                        }}
                      >
                        <ListItemText primary={p.name} primaryTypographyProps={{ fontWeight: 'inherit' }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Drawer>

      <Box component="main" sx={{ ml: `${RAIL_WIDTH}px` }}>
        <Outlet />
      </Box>
    </Box>
  );
}
