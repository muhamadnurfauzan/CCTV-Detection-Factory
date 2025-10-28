import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import CCTVTable from "./components/CCTVTable";
import CCTVStream from "./components/CCTVStream";
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
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cctv" element={<CCTVTableWithRouting />} /> {/* Ganti dengan versi routing */}
            <Route path="/stream/:id" element={<CCTVStreamWrapper />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </Router>
  );
}

export default App;