import { Route, Routes, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Block } from '@mui/icons-material';
import Layout from './components/Layout';
import { useAuth } from './auth';
import Login from './pages/Login';
import Home from './pages/Home';
import Vehicle from './pages/master/Vehicle';
import Driver from './pages/master/Driver';
import TripRoute from './pages/master/TripRoute';
import TripRouteCustomers from './pages/transaction/TripRouteCustomers';
import TripSheet from './pages/transaction/TripSheet';
import TripSheetBills from './pages/transaction/TripSheetBills';
import Users from './pages/admin/Users';

const SCREENS = [
  ['/master/vehicle', <Vehicle />],
  ['/master/driver', <Driver />],
  ['/master/trip-route', <TripRoute />],
  ['/transaction/trip-route-customers', <TripRouteCustomers />],
  ['/transaction/trip-sheet', <TripSheet />],
  ['/transaction/trip-sheet-bills', <TripSheetBills />],
  ['/admin/users', <Users />],
];

// A screen opens only if the user has the right to it
function Guard({ children }) {
  const { canOpen } = useAuth();
  const { pathname } = useLocation();
  if (canOpen(pathname)) return children;
  return (
    <Box sx={{ p: 6, textAlign: 'center', color: '#666' }}>
      <Block sx={{ fontSize: 48, color: '#b0b4bd' }} />
      <Typography variant="h6" mt={1}>You do not have access to this screen</Typography>
      <Typography variant="body2">Ask an administrator to give you the right to it.</Typography>
    </Box>
  );
}

export default function App() {
  const { user, checking } = useAuth();
  if (checking) {
    return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;
  }
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        {SCREENS.map(([path, element]) => <Route key={path} path={path} element={<Guard>{element}</Guard>} />)}
      </Route>
    </Routes>
  );
}
