import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom";
import React, { useState } from 'react';
import Sidebar from './components/Sidebar'; 
import Dashboard from './pages/Dashboard'; 
import CCTVTable from './components/CCTVTable';
import CCTVStream from './components/CCTVStream';
import ErrorBoundary from './components/ErrorBoundary'; 

// ---- Wrapper agar streaming tetap kompatibel ----
const CCTVStreamWrapper = () => {
  const { id } = useParams(); // Ambil id dari URL
  const navigate = useNavigate();

  // Validasi id
  const cctvId = id ? parseInt(id, 10) : null;
  if (cctvId === null || isNaN(cctvId)) {
    return <div>Invalid CCTV ID</div>; // Fallback kalau id nggak valid
  }

  return <CCTVStream cctvId={cctvId} onBack={() => navigate("/cctv")} />;
};

// ---- CCTVTable versi baru, langsung navigasi ke stream ----
const CCTVTableWithRouting = () => {
  const navigate = useNavigate();
  return <CCTVTable onSelect={(id) => navigate(`/stream/${id}`)} />;
};

function App() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  return (
    <Router>
      <div className="relative min-h-screen bg-gray-50 overflow-x-hidden">
        {/* Sidebar Overlay */}
        <Sidebar 
          isExpanded={isSidebarExpanded} 
          setIsExpanded={setIsSidebarExpanded} 
        />

        {/* Backdrop (opsional) */}
        {isSidebarExpanded && (
          <div
            className="fixed inset-0 bg-black bg-opacity-40 z-30"
            onClick={() => setIsSidebarExpanded(false)}
          />
        )}

        {/* Konten utama (tidak bergeser) */}
        <div className="transition-all duration-300 p-4 md:p-8" style={{ marginLeft: isSidebarExpanded ? '80px' : '80px' }}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cctv" element={<CCTVTableWithRouting />} />
              <Route path="/stream/:id" element={<CCTVStreamWrapper />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </Router>
  );
}

export default App;