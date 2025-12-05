// App.jsx 
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CCTVList from './pages/CCTVList';
import ImagesShow from './pages/ImagesShow';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import { AlertProvider } from './components/AlertProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';

const RequireAuthOrRedirect = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  return user ? <Navigate to="/" replace /> : children;
};

function AppContent() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const { user } = useAuth(); // DETEKSI APAKAH SUDAH LOGIN

  return (
    <div className="min-h-screen bg-gray-50">

      {/* SIDEBAR – Hanya muncul kalau sudah login */}
      {user && (
        <ProtectedRoute allowedRoles={['super_admin', 'cctv_editor', 'report_viewer', 'viewer']}>
          <Sidebar isExpanded={isSidebarExpanded} setIsExpanded={setIsSidebarExpanded} />
        </ProtectedRoute>
      )}

      {/* Overlay mobile */}
      {user && isSidebarExpanded && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 z-40 lg:hidden"
          onClick={() => setIsSidebarExpanded(false)}
        />
      )}

      {/* MAIN CONTENT */}
      <main className="relative z-10 min-h-screen flex items-start justify-center">
        <div 
          className={`
            w-full max-w-[1440px] 
            px-4 py-8 md:px-8 lg:px-12
            transition-all duration-300 ease-in-out
            ${user ? 'pl-4 sm:pl-24 md:pl-28 lg:pl-32' : 'px-4'}  
          `}
        >
          <ErrorBoundary>
            <AlertProvider>
              <Routes>
                {/* Login hanya bisa diakses jika belum login */}
                <Route 
                  path="/login" 
                  element={
                    <RequireAuthOrRedirect>
                      <Login />
                    </RequireAuthOrRedirect>
                  } 
                />
                {/* Semua halaman lain = sidebar overlay */}
                <Route path="/" element={
                  <ProtectedRoute allowedRoles={['super_admin', 'cctv_editor', 'report_viewer', 'viewer']}>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/cctv/*" element={
                  <ProtectedRoute allowedRoles={['super_admin', 'cctv_editor', 'report_viewer', 'viewer']}>
                    <CCTVList />
                  </ProtectedRoute>
                } />
                <Route path="/images" element={
                  <ProtectedRoute allowedRoles={['super_admin', 'report_viewer']}>
                    <ImagesShow />
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute allowedRoles={['super_admin', 'report_viewer']}>
                    <Reports />
                  </ProtectedRoute>
                } />
                <Route path="/users" element={
                  <ProtectedRoute allowedRoles={['super_admin']}>
                    <Users />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute allowedRoles={['super_admin']}>
                    <Settings />
                  </ProtectedRoute>
                } />
              </Routes>
            </AlertProvider>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;