// App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import React, { useState } from 'react';

import Sidebar from './components/Sidebar'; 
import Dashboard from './pages/Dashboard'; 
import CCTVList from './pages/CCTVList';
import ImagesShow from './pages/ImagesShow'; 
import Reports from './pages/Reports';
import { AlertProvider } from './components/AlertProvider';
import ErrorBoundary from './components/ErrorBoundary'; 

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
            <AlertProvider>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cctv/*" element={<CCTVList />} /> 
                <Route path="/images" element={<ImagesShow />} />
                <Route path="/reports" element={<Reports />} />
              </Routes>
            </AlertProvider>
          </ErrorBoundary>
        </div>
      </div>
    </Router>
  );
}

export default App;