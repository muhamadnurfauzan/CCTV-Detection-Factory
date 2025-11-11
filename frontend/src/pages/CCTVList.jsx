// CCTVList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaSlidersH, FaArrowLeft } from 'react-icons/fa';
import { useAlert } from '../components/AlertProvider';
import CCTVTable from '../components/CCTVTable';
import CCTVStream from '../components/CCTVStream';
import CCTVViolation from '../components/CCTVViolation';
import ModalAddCCTV from '../components/ModalAddCCTV';
import ModalEditCCTV from '../components/ModalEditCCTV';
import ModalDeleteCCTV from '../components/ModalDeleteCCTV';
import Pagination from '../components/Pagination';

const CCTVList = () => {
  const [view, setView] = useState('table');
  const [selectedCCTV, setSelectedCCTV] = useState(null);
  const [search, setSearch] = useState('');
  const [cctvs, setCctvs] = useState([]);
  const [violations, setViolations] = useState([]);
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEditCCTV, setSelectedEditCCTV] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const { showAlert } = useAlert();
  
  // --- STATE PAGINATION BARU ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // -----------------------------

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
        
        // Sorting awal untuk menjaga urutan (misalnya berdasarkan ID)
        const sortedCctvs = cctvRes.sort((a, b) => a.id - b.id); 
        
        setCctvs(sortedCctvs);
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
        showAlert('Failed to load CCTV data.', 'error'); 
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);
  
  // --- Handler Pagination ---
  const handlePageChange = useCallback((page) => {
      setCurrentPage(page);
  }, []);

  const handleItemsPerPageChange = useCallback((items) => {
      setItemsPerPage(items);
      setCurrentPage(1); // Reset ke halaman 1 saat items per page berubah
  }, []);

  // --- Handler Update Data (Tambahkan sorting) ---
  const handleUpdate = useCallback(async (id, data) => {
    try {
      const res = await fetch(`/api/cctv_update/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        let updated;
        try {
            updated = await res.json();
        } catch (jsonError) {
            updated = { ...data, id: id };
        }
        
        // Update dan Sort ulang agar item yang diedit tidak pindah posisi
        setCctvs(prev => {
            const updatedList = prev.map(c => c.id === id ? updated : c);
            return updatedList.sort((a, b) => a.id - b.id); // Sorting konsisten
        });
        setShowEditModal(false);
      } else {
        let errorMessage = 'Update failed';
        try {
            const err = await res.json();
            errorMessage = err.error || errorMessage;
        } catch {}
        showAlert(errorMessage, 'error');
      }
    } catch {
      showAlert('Network error during update.', 'error');
    }
  }, [showAlert]);


  // --- Filter CCTV ---
  const filteredCctvs = cctvs.filter(cctv =>
    cctv.name.toLowerCase().includes(search.toLowerCase()) ||
    (cctv.location && cctv.location.toLowerCase().includes(search.toLowerCase())) ||
    cctv.ip_address.toLowerCase().includes(search.toLowerCase())
  );
  
  // --- LOGIKA PAGINATION ---
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredCctvs.slice(indexOfFirstItem, indexOfLastItem);
  // --- END LOGIKA PAGINATION ---


  // --- Handler Lainnya (Tidak berubah) ---
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
    const current = configs[cctv_id] || [];
    const newEnabled = current.includes(Number(class_id))
      ? current.filter(id => id !== Number(class_id))
      : [...current, Number(class_id)];

    setConfigs(prev => ({ ...prev, [cctv_id]: newEnabled }));

    try {
      const res = await fetch(`/api/cctv_violations/${cctv_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_class_ids: newEnabled }),
      });

      if (!res.ok) throw new Error("Failed to save violation config.");

      await fetch('/api/refresh_config', { method: 'POST' });
      showAlert('Violation configuration saved successfully.', 'success'); 
    } catch (e) {
      showAlert(e.message || 'Failed to save configuration. Reverting changes.', 'error'); 
      setConfigs(prev => ({ ...prev, [cctv_id]: current })); 
    }
  };

  const handleEdit = useCallback(async (id) => {
    const cctv = cctvs.find(c => c.id === id);
    if (cctv) {
        setSelectedEditCCTV(cctv);
        setShowEditModal(true);
    } else {
        showAlert(`CCTV ID ${id} not found. Please refresh the list.`, 'warning');
    }
  }, [cctvs, showAlert]);


  const handleDelete = useCallback((id) => {
    setShowDeleteModal(id);
  }, []);

  const handleDeleteConfirm = useCallback((id) => {
      setCctvs(prev => prev.filter(c => c.id !== id));
      setShowDeleteModal(null);
  }, []);
  
  // Perbarui handler onSuccess ModalAddCCTV untuk sorting
  const handleAddSuccess = useCallback((newCctv) => {
      setCctvs(prev => {
          const updatedList = [...prev, newCctv];
          return updatedList.sort((a, b) => a.id - b.id); 
      });
      setShowAddModal(false);
  }, []);
  
  // Efek untuk reset halaman jika hasil filter kosong
  useEffect(() => {
    if (filteredCctvs.length > 0 && currentPage > Math.ceil(filteredCctvs.length / itemsPerPage)) {
        setCurrentPage(Math.ceil(filteredCctvs.length / itemsPerPage));
    } else if (filteredCctvs.length === 0 && currentPage !== 1) {
        setCurrentPage(1);
    }
  }, [filteredCctvs.length, itemsPerPage, currentPage]);


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

        <div className='grid grid-flow-col gap-2 justify-stretch items-center mb-2'>
            {/* Back Button - hanya muncul di stream/violation */}
            {(view === 'stream' || view === 'violation') && (
                <div className="flex justify-start" >
                    <button
                        onClick={handleBack}
                        title="Back to CCTV List"
                        className="bg-indigo-600 text-white px-2 p-2 rounded-lg hover:bg-indigo-700 transition"
                    >
                        <FaArrowLeft className='h-4 w-4'/>
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
                            className="bg-indigo-600 text-white px-2 p-2 rounded-lg hover:bg-indigo-700 transition"
                            title="Configure Violations"
                            >
                            <FaSlidersH className='h-4 w-4'/>
                            </button>
                            <button
                              onClick={() => setShowAddModal(true)}
                              className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition"
                              title="Add New CCTV"
                            >
                              <FaPlus className='h-4 w-4'/>
                            </button>
                        </>
                        )}
                        <>
                          <input
                              type="text"
                              placeholder="Type Name, IP, or Loc..."
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              className="flex w-full min-w-[200px] px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </>
                    </div>
                </div>
            )}
        </div>

      {/* Main Content */}
      <div className="overflow-x-auto">
        {view !== 'stream' ? (
          <div>
            <div className='bg-white rounded-t-lg'>
                {view === 'table' && (
                    <CCTVTable
                        cctvs={currentItems} 
                        onSelect={handleSelect}
                        onEdit={handleEdit}     
                        onDelete={handleDelete}
                        startNo={indexOfFirstItem + 1} 
                    />
                )}
                {view === 'violation' && (
                    <CCTVViolation
                        cctvs={currentItems} 
                        violations={violations}
                        configs={configs}
                        onToggle={handleToggleViolation}
                        startNo={indexOfFirstItem + 1} 
                    />
                )}
            </div>
            <div>
              {/* Komponen Pagination */}
                {(view === 'table' || view === 'violation') && (
                    <Pagination
                        totalItems={filteredCctvs.length}
                        itemsPerPage={itemsPerPage}
                        currentPage={currentPage}
                        onPageChange={handlePageChange}
                        onItemsPerPageChange={handleItemsPerPageChange}
                    />
                )}
            </div>
          </div>
        )
         : selectedCCTV && (
            <CCTVStream cctvId={selectedCCTV} />
         )}
      </div>
      {/* MODAL */}
      <ModalAddCCTV
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
      />
      <ModalEditCCTV
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onUpdate={handleUpdate}
        cctvData={selectedEditCCTV}
      />
      <ModalDeleteCCTV
        open={showDeleteModal !== null}
        onClose={() => setShowDeleteModal(null)}
        onConfirm={handleDeleteConfirm}
        cctvId={showDeleteModal}
      />
    </div>
  );
};

export default CCTVList;