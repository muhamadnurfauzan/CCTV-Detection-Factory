// src/components/ProtectedRoute.jsx 
import { useAuth } from '../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { OrbitProgress } from "react-loading-indicators";

export const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <OrbitProgress variant="disc" color={["#6366F1", "#10B981", "#FFD54F", "#EF4444"]} size="medium" text="" textColor="" />
      </div>
    );
  }

  // Jika belum login → kirim ke login (tapi simpan halaman tujuan)
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Jika role tidak diizinkan → redirect ke Dashboard (atau halaman aman)
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
    // atau kalau mau lebih pintar: redirect ke halaman terakhir yang boleh dia buka
    // return <Navigate to="/dashboard" replace />;
  }

  // Jika semua OK → tampilkan halaman
  return children;
};