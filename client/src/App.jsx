import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './lib/auth.jsx';
import Icon from './components/Icon.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import PaySearch from './pages/PaySearch.jsx';
import PayAmount from './pages/PayAmount.jsx';
import TxnDetail from './pages/TxnDetail.jsx';
import History from './pages/History.jsx';
import Person from './pages/Person.jsx';
import Requests from './pages/Requests.jsx';
import Split from './pages/Split.jsx';
import Bills from './pages/Bills.jsx';
import BillPay from './pages/BillPay.jsx';
import Rewards from './pages/Rewards.jsx';
import Profile from './pages/Profile.jsx';
import Accounts from './pages/Accounts.jsx';
import AddMoney from './pages/AddMoney.jsx';
import MyQR from './pages/MyQR.jsx';
import Scan from './pages/Scan.jsx';
import Notifications from './pages/Notifications.jsx';
import Security from './pages/Security.jsx';

function RequireAuth() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="screen center"><Spinner label="Loading PayFlow" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

function GuestOnly() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

function TabLayout() {
  const { counts } = useAuth();
  const tabs = [
    { to: '/', icon: 'home', label: 'Home', end: true },
    { to: '/history', icon: 'clock', label: 'History' },
    { to: '/scan', icon: 'scan', label: 'Scan', primary: true },
    { to: '/rewards', icon: 'gift', label: 'Rewards', badge: counts.unscratched },
    { to: '/profile', icon: 'user', label: 'Profile' },
  ];
  return (
    <>
      <main className="tab-content"><Outlet /></main>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'is-active' : ''} ${t.primary ? 'tab--primary' : ''}`}>
            <span className="tab__icon">
              <Icon name={t.icon} size={t.primary ? 26 : 22} />
              {t.badge > 0 && <span className="dot-badge">{t.badge}</span>}
            </span>
            {!t.primary && <span>{t.label}</span>}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<TabLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<History />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="/scan" element={<Scan />} />
          <Route path="/pay" element={<PaySearch />} />
          <Route path="/pay/to/:handle" element={<PayAmount />} />
          <Route path="/txn/:id" element={<TxnDetail />} />
          <Route path="/people/:id" element={<Person />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/split" element={<Split />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/bills/:billerId" element={<BillPay />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/wallet/add" element={<AddMoney />} />
          <Route path="/qr" element={<MyQR />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/security" element={<Security />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
