import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Packages from './pages/Packages';
import Requirements from './pages/Requirements';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Register from './pages/Register';
import Cart from './pages/Cart';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import { AdminLayout, AdminDashboard, AdminUsers } from './pages/admin/Admin';
import AdminTax from './pages/admin/AdminTax';
import { AdminOverview, AdminSales, AdminSupport, AdminNotifications, AdminReports, AdminCompanies } from './pages/admin/AdminBusiness';
import { AdminInvoicesPage, AdminQueue, AdminRefunds, AdminPackages, AdminLogs, AdminSettings, AdminIntegrations } from './pages/admin/AdminOps';

export default function App() {
  const { pathname } = useLocation();
  const hideFooter = ['/login', '/register', '/dashboard'].includes(pathname) || pathname.startsWith('/admin');

  return (
    <>
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/requirements" element={<Requirements />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="monitoring" element={<AdminDashboard />} />
          <Route path="sales" element={<AdminSales />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="invoices" element={<AdminInvoicesPage />} />
          <Route path="packages" element={<AdminPackages />} />
          <Route path="companies" element={<AdminCompanies />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="queue" element={<AdminQueue />} />
          <Route path="refunds" element={<AdminRefunds />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="integrations" element={<AdminIntegrations />} />
          <Route path="tax" element={<AdminTax />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideFooter && <Footer />}
    </>
  );
}
