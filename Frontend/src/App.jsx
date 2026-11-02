import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Vehicle from './pages/master/Vehicle';
import Driver from './pages/master/Driver';
import TripRoute from './pages/master/TripRoute';
import TripRouteCustomers from './pages/transaction/TripRouteCustomers';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/master/vehicle" element={<Vehicle />} />
        <Route path="/master/driver" element={<Driver />} />
        <Route path="/master/trip-route" element={<TripRoute />} />
        <Route path="/transaction/trip-route-customers" element={<TripRouteCustomers />} />
      </Route>
    </Routes>
  );
}
