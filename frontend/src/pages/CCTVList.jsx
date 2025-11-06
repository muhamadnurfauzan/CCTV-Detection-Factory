// CCTVList.jsx
import React, { useState, useEffect } from 'react';
import { FaPlus, FaSlidersH, FaArrowLeft } from 'react-icons/fa';
import CCTVTable from '../components/CCTVTable';
import CCTVStream from '../components/CCTVStream';
import CCTVViolation from '../components/CCTVViolation';

const CCTVList = () => {
  const [view, setView] = useState('table');
  const [selectedCCTV, setSelectedCCTV] = useState(null);
  const [search, setSearch] = useState('');
  const [cctvs, setCctvs] = useState([]);
  const [violations, setViolations] = useState([]);
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Fetch semua data sekali di parent ---
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cctvRes, violRes] = await Promise.all([
          fetch('/api/cctv_all').then(r => r.ok ? r.json() : []),
          fetch('/api/object_classes').then(r => r.ok ? r.json() : [])
        ]);

        const filteredViolations = violRes.filter(v => v.is_violation);
        setCctvs(cctvRes);
        setViolations(filteredViolations);

        // Ambil semua config sekaligus
        const configPromises = cctvRes.map(cctv =>
          fetch(`/api/cctv_violations/${cctv.id}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => ({ [cctv.id]: data }))
        );

        const configResults = await Promise.all(configPromises);
        setConfigs(Object.assign({}, ...configResults));
      } catch (err) {
        setError('Failed to load CCTV data.');
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // --- Handler ---
  const handleSelect = (id) => {
    setSelectedCCTV(id);
    setView('stream');
  };

  const handleBack = () => {
    setView('table');
    setSelectedCCTV(null);
  };

  const handleOpenViolation = () => {
    setView('violation');
  };

  const handleToggleViolation = async (cctv_id, class_id) => {
    const key = `${cctv_id}-${class_id}`;
    const current = configs[cctv_id] || [];
    const newEnabled = current.includes(Number(class_id))
      ? current.filter(id => id !== Number(class_id))
      : [...current, Number(class_id)];

    // Optimistic UI
    setConfigs(prev => ({ ...prev, [cctv_id]: newEnabled }));

    try {
      const res = await fetch(`/api/cctv_violations/${cctv_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_class_ids: newEnabled }),
      });

      if (!res.ok) throw new Error();
      await fetch('/api/refresh_config', { method: 'POST' });
    } catch {
      alert('Failed to save. Reverting...');
      setConfigs(prev => ({ ...prev, [cctv_id]: current })); // rollback
    }
  };

  // --- Filter CCTV ---
  const filteredCctvs = cctvs.filter(cctv =>
    cctv.name.toLowerCase().includes(search.toLowerCase()) ||
    (cctv.location && cctv.location.toLowerCase().includes(search.toLowerCase())) ||
    cctv.ip_address.toLowerCase().includes(search.toLowerCase())
  );

  // --- Render ---
  if (loading) return <div className="p-4 flex items-center justify-center h-screen bg-gray-100"><p className="text-xl font-semibold text-gray-700">Loading CCTV Datas...</p></div>;
  if (error) return <p className="text-center py-8 text-red-500">{error}</p>;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-6">
        {/* Header */}
        <h2 className="text-3xl font-bold mb-4 text-gray-800 border-b pb-2">
        {view === 'table' && "CCTVs' List"}
        {view === 'stream' && `Streaming CCTV #${selectedCCTV}`}
        {view === 'violation' && "Violation Configurations"}
        </h2>

        <div className='grid grid-flow-col justify-stretch items-center mb-2'>
            {/* Back Button - hanya muncul di stream/violation */}
            {(view === 'stream' || view === 'violation') && (
                <div className="flex justify-start" >
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-2 p-2 rounded-lg hover:bg-indigo-700 transition"
                    >
                        <FaArrowLeft /> Back
                    </button>
                </div>
            )}

            {/* Toolbar - hanya di table & violation */}
            {(view === 'table' || view === 'violation') && (
                <div className="flex items-center justify-end gap-2">
                    <div className="flex gap-2">
                        {view === 'table' && (
                        <>
                            <button
                            onClick={handleOpenViolation}
                            className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition"
                            title="Configure Violations"
                            >
                            <FaSlidersH className="w-5 h-5" />
                            </button>
                            <button
                            className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition"
                            title="Add New CCTV"
                            >
                            <FaPlus className="w-5 h-5" />
                            </button>
                        </>
                        )}
                    </div>

                    <div className='flex'>
                        <input
                            type="text"
                            placeholder="Search by Name, IP, or Location..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-64 px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            )}
        </div>

      {/* Main Content */}
      <div className=" overflow-x-auto">
        {view !== 'stream' ? (
            <div className='bg-white'>
                {view === 'table' && (
                    <CCTVTable
                        cctvs={filteredCctvs}
                        onSelect={handleSelect}
                    />
                )}
                {view === 'violation' && (
                    <CCTVViolation
                        cctvs={filteredCctvs}
                        violations={violations}
                        configs={configs}
                        onToggle={handleToggleViolation}
                    />
                )}
            </div>
        )
         : selectedCCTV && (
            <CCTVStream cctvId={selectedCCTV} />
         )}
      </div>
    </div>
  );
};

export default CCTVList;