import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom";
import React, { useState } from 'react';

import Sidebar from './components/Sidebar'; 
import Dashboard from './pages/Dashboard'; 
import ImagesShow from './pages/ImagesShow'; 
import CCTVTable from './components/CCTVTable';
import CCTVStream from './components/CCTVStream';
import ErrorBoundary from './components/ErrorBoundary'; 

await fetch('http://localhost:3000/invalidate-cache', { method: 'POST' });

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
      <div className="relative min-h-screen bg-gray-50 overflow-x-hidden flex flex-col items-center">
        <Sidebar 
          isExpanded={isSidebarExpanded} 
          setIsExpanded={setIsSidebarExpanded} 
        />

        {isSidebarExpanded && (
          <div
            className="fixed inset-0 bg-black bg-opacity-40 z-30"
            onClick={() => setIsSidebarExpanded(false)}
          />
        )}

        {/* Konten utama */}
        <div
          className="transition-all duration-300 p-4 md:p-8 ml-8 2xl:mx-auto max-w-[1440px] w-full"
          style={{ paddingLeft: isSidebarExpanded ? '80px' : '80px' }}
        >
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cctv" element={<CCTVTableWithRouting />} />
              <Route path="/stream/:id" element={<CCTVStreamWrapper />} />
              <Route path="/images" element={<ImagesShow />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </Router>
  );
}

export default App;