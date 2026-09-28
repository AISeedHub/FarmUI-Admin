import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminLayout from './layouts/AdminLayout';
import Overview from './pages/Overview/Overview';
import FarmsList from './pages/Farms/FarmsList';
import FarmDetail from './pages/Farms/FarmDetail';
import UsersList from './pages/Users/UsersList';
import RolesList from './pages/Roles/RolesList';
import FleetAnalytics from './pages/Analytics/FleetAnalytics';
import SystemHealth from './pages/Health/SystemHealth';
import NotificationsManager from './pages/Notifications/NotificationsManager';
import { isTokenValid, getTokenRemainingTime } from './utils/auth';


export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return isTokenValid(localStorage.getItem('access_token'));
  });

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    localStorage.removeItem('access_token');
  }, []);

  // Listen to 401 unauthorized events and schedule auto-logout when JWT expires
  useEffect(() => {
    const handleAuthExpired = () => {
      handleLogout();
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    if (isAuthenticated) {
      const token = localStorage.getItem('access_token');
      if (!isTokenValid(token)) {
        handleLogout();
      } else {
        const remainingMs = getTokenRemainingTime(token);
        if (remainingMs > 0) {
          const timer = setTimeout(() => {
            handleLogout();
          }, remainingMs);
          return () => {
            clearTimeout(timer);
            window.removeEventListener('auth:expired', handleAuthExpired);
          };
        }
      }
    }

    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, [isAuthenticated, handleLogout]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/overview" replace /> : <Login onLogin={() => setIsAuthenticated(true)} />
          }
        />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            isAuthenticated ? <AdminLayout onLogout={handleLogout} /> : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="farms" element={<FarmsList />} />
          <Route path="farms/:id" element={<FarmDetail />} />
          <Route path="users" element={<UsersList />} />
          <Route path="notifications" element={<NotificationsManager />} />
          <Route path="roles" element={<RolesList />} />
          <Route path="analytics" element={<FleetAnalytics />} />
          <Route path="health" element={<SystemHealth />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
