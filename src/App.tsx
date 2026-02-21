import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminLayout from './layouts/AdminLayout';
import FarmsList from './pages/Farms/FarmsList';
import FarmDetail from './pages/Farms/FarmDetail';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

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
            isAuthenticated ? <AdminLayout onLogout={() => setIsAuthenticated(false)} /> : <Navigate to="/login" replace />
          }
        >
          <Route index element={<FarmsList />} />
          <Route path="farms/:id" element={<FarmDetail />} />
          {/* We will add config pages here */}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
