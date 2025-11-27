// App.jsx – FINAL VERSION (Overlay Sidebar, No Push)
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';

function App() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  return (
    <AuthProvider>
      <Router>
        {/* Background utama */}
        <div className="min-h-screen bg-gray-50">

          {/* SIDEBAR */}
          {(
            <ProtectedRoute allowedRoles={['super_admin', 'cctv_editor', 'report_viewer', 'viewer']}>
              <Sidebar 
                isExpanded={isSidebarExpanded} 
                setIsExpanded={setIsSidebarExpanded} 
              />
            </ProtectedRoute>
          )}

          {/* Overlay */}
          {isSidebarExpanded && (
            <div
              className="fixed inset-0 bg-black bg-opacity-60 z-40 lg:hidden"
              onClick={() => setIsSidebarExpanded(false)}
            />
          )}

          {/* MAIN CONTENT */}
          <main className="relative z-10">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
              <ErrorBoundary>
                <AlertProvider>
                  <Routes>
                    {/* Login = full background */}
                    <Route path="/login" element={<Login />} />

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
      </Router>
    </AuthProvider>
  );
}

export default App;