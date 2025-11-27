// src/components/ProtectedRoute.jsx 
import { useAuth } from '../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

export const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-xl text-indigo-600">Loading...</div>
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