import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom";
import Navbar from "./components/Navbar";

import Dashboard from "./pages/Dashboard";
import CCTVTable from "./components/CCTVTable";
import CCTVStream from "./components/CCTVStream";

// ---- Wrapper agar streaming tetap kompatibel ----
const CCTVStreamWrapper = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  return <CCTVStream cctvId={parseInt(id)} onBack={() => navigate("/cctv")} />;
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cctv" element={<CCTVTableWithRouting />} />
          <Route path="/stream/:id" element={<CCTVStreamWrapper />} />
        </Routes>
      </div>
    </Router>
  );
}

// ---- CCTVTable versi baru, langsung navigasi ke stream ----
const CCTVTableWithRouting = () => {
  const navigate = useNavigate();
  return <CCTVTable onSelect={(id) => navigate(`/stream/${id}`)} />;
};

export default App;
