import { useState, useEffect } from 'react';
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


export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Clear session on page refresh/reload
  useEffect(() => {
    localStorage.removeItem('access_token');
  }, []);

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('access_token');
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <Login onLogin={() => setIsAuthenticated(true)} />
          }
        />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            isAuthenticated ? <AdminLayout onLogout={handleLogout} /> : <Navigate to="/login" replace />
          }
        >
          <Route path="overview" element={<Overview />} />
          <Route index element={<FarmsList />} />
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
