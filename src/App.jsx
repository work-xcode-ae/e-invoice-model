import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import { NewsTicker, CookieBanner, WhatsAppButton } from './components/Site';
import Home from './pages/Home';
import Packages from './pages/Packages';
import Requirements from './pages/Requirements';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Register from './pages/Register';
import Cart from './pages/Cart';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import { HowItWorksPage, FaqPage, NewsPage, PartnerPage, AdvertisePage, LegalPage, ObligationTool, UnsubscribePage } from './pages/site/SitePages';
import PartnerPortal from './pages/partner/PartnerPortal';
import { AdminLayout, AdminDashboard, AdminUsers } from './pages/admin/Admin';
import AdminTax from './pages/admin/AdminTax';
import { AdminOverview, AdminSales, AdminSupport, AdminNotifications, AdminReports, AdminCompanies } from './pages/admin/AdminBusiness';
import { AdminInvoicesPage, AdminQueue, AdminRefunds, AdminLogs, AdminIntegrations } from './pages/admin/AdminOps';
import { AdminTasks, AdminStaff, OwnerDashboard, AdminAudit } from './pages/staff/StaffPages';
import { AdminOnboarding } from './pages/staff/Customers';
import { AdminBilling } from './pages/staff/Billing';
import { AdminPartners } from './pages/staff/Partners';
import { AdminCrm } from './pages/staff/Crm';
import { AdminContent } from './pages/staff/Content';
import { SettingsCenter } from './pages/staff/SettingsCenter';
import { AdminFinance } from './pages/staff/Finance';
import { AdminPackagesBrd } from './pages/staff/PackagesAdmin';
import IntegrationErrors from './pages/staff/IntegrationErrors';
import { useAuth } from './context/AuthContext';
import { useLang } from './i18n/LanguageContext';
import { captureReferral } from './services/partners';

/** Section 4.1: a staff member only sees the screens of their role. */
function Gate({ perm, lv, children }) {
  const { staffLevel } = useAuth();
  const { t } = useLang();
  const level = staffLevel(perm);
  if (!level || (lv && !lv.includes(level))) {
    return <div className="card center" style={{ padding: 40 }}><Lock size={30} color="#94a3b8" /><h3 className="mt-1">{t('Not available for your role')}</h3><p className="muted mb-0">{t('Ask the manager if you need access.')}</p></div>;
  }
  return children;
}

const PUBLIC_WIDGETS_HIDDEN = ['/dashboard', '/admin', '/partner', '/login', '/register'];

export default function App() {
  const { pathname, search } = useLocation();
  const hideFooter = ['/login', '/register', '/dashboard', '/partner'].includes(pathname) || pathname.startsWith('/admin');
  const publicPage = !PUBLIC_WIDGETS_HIDDEN.some((p) => pathname.startsWith(p));

  // Referral links: /?ref=CODE on any page is remembered for the configured number of days (PRT-04).
  useEffect(() => {
    const ref = new URLSearchParams(search).get('ref');
    if (ref) captureReferral(ref);
  }, [search]);

  return (
    <>
      <ScrollToTop />
      {publicPage && <NewsTicker />}
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/news/:id" element={<NewsPage />} />
        <Route path="/partners" element={<PartnerPage />} />
        <Route path="/advertise" element={<AdvertisePage />} />
        <Route path="/check" element={<ObligationTool />} />
        <Route path="/terms" element={<LegalPage slug="terms" />} />
        <Route path="/privacy" element={<LegalPage slug="privacy" />} />
        <Route path="/refund-policy" element={<LegalPage slug="refund-policy" />} />
        <Route path="/disclaimer" element={<LegalPage slug="disclaimer" />} />
        <Route path="/partner-agreement" element={<LegalPage slug="partner-agreement" />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route path="/requirements" element={<Requirements />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/partner" element={<PartnerPortal />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Gate perm="reports" lv={['full']}><AdminOverview /></Gate>} />
          <Route path="owner" element={<Gate perm="owner"><OwnerDashboard /></Gate>} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="onboarding" element={<Gate perm="documents"><AdminOnboarding /></Gate>} />
          <Route path="companies" element={<Gate perm="documents"><AdminCompanies /></Gate>} />
          <Route path="users" element={<Gate perm="documents"><AdminUsers /></Gate>} />
          <Route path="support" element={<Gate perm="tickets"><AdminSupport /></Gate>} />
          <Route path="notifications" element={<Gate perm="tickets" lv={['full']}><AdminNotifications /></Gate>} />
          <Route path="refunds" element={<Gate perm="refunds"><AdminRefunds /></Gate>} />
          <Route path="crm" element={<Gate perm="leads"><AdminCrm /></Gate>} />
          <Route path="partners" element={<Gate perm="partners"><AdminPartners /></Gate>} />
          <Route path="billing" element={<Gate perm="bank"><AdminBilling /></Gate>} />
          <Route path="packages" element={<Gate perm="packages"><AdminPackagesBrd /></Gate>} />
          <Route path="sales" element={<Gate perm="reports" lv={['full']}><AdminSales /></Gate>} />
          <Route path="finance" element={<Gate perm="reports"><AdminFinance /></Gate>} />
          <Route path="reports" element={<Gate perm="reports" lv={['full']}><AdminReports /></Gate>} />
          <Route path="integrations" element={<Gate perm="integrations"><AdminIntegrations /><IntegrationErrors /></Gate>} />
          <Route path="monitoring" element={<Gate perm="integrations"><AdminDashboard /></Gate>} />
          <Route path="queue" element={<Gate perm="integrations"><AdminQueue /></Gate>} />
          <Route path="invoices" element={<Gate perm="integrations"><AdminInvoicesPage /></Gate>} />
          <Route path="logs" element={<Gate perm="integrations"><AdminLogs /></Gate>} />
          <Route path="content" element={<Gate perm="settings" lv={['full']}><AdminContent /></Gate>} />
          <Route path="settings" element={<Gate perm="settings"><SettingsCenter /></Gate>} />
          <Route path="staff" element={<Gate perm="staff"><AdminStaff /></Gate>} />
          <Route path="tax" element={<Gate perm="settings" lv={['full']}><AdminTax /></Gate>} />
          <Route path="audit" element={<Gate perm="audit"><AdminAudit /></Gate>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideFooter && <Footer />}
      {publicPage && <WhatsAppButton />}
      <CookieBanner />
    </>
  );
}
