// CCTVList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaArrowLeft, FaSearch } from 'react-icons/fa';
import { useAlert } from '../components/AlertProvider';
import RoleButton from '../components/RoleButton';
import CCTVTable from '../components/CCTVTable';
import CCTVStream from '../components/CCTVStream';
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
        // Gunakan Promise.all untuk mengambil data CCTV dan Violation sekaligus
        const [cctvRes, violationRes] = await Promise.all([
          fetch('/api/cctv-all').then(r => r.ok ? r.json() : []),
          fetch('/api/object/object-classes').then(r => r.ok ? r.json() : []) 
        ]);

        const sortedCctvs = cctvRes.sort((a, b) => a.id - b.id); 
        
        setCctvs(sortedCctvs);
        setViolations(violationRes); 
      } catch (err) {
        setError('Failed to load data.');
        showAlert('Failed to load data.', 'error'); 
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [showAlert]);
  
  // --- Handler Pagination ---
  const handlePageChange = useCallback((page) => {
      setCurrentPage(page);
  }, []);

  const handleItemsPerPageChange = useCallback((items) => {
      setItemsPerPage(items);
      setCurrentPage(1); 
  }, []);

  // --- Handler Update Data (Tambahkan sorting) ---
  const handleUpdate = useCallback(async (id, data) => {
    try {
      const res = await fetch(`/api/cctv-update/${id}`, {
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

  // --- Handler Lainnya ---
  const handleSelect = (id) => {
    setSelectedCCTV(id);
    setView('stream');
  };

  const handleBack = () => {
    setView('table');
    setSelectedCCTV(null);
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
  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-6">
        {/* Header */}
        <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">
        {view === 'table' && "CCTVs' List"}
        {view === 'stream' && `Streaming CCTV #${selectedCCTV}`}
        </h2>

        <div className='grid grid-flow-col justify-stretch items-center mb-4 bg-white p-3 rounded-lg shadow-md gap-2'>
            {/* Back Button - hanya muncul di stream/violation */}
            {(view === 'stream') && (
                <div className="flex justify-start" >
                    <RoleButton
                      allowedRoles={['super_admin', 'report_viewer', 'viewer']} 
                      disabled={error || currentItems.length === 0}
                      onClick={handleBack}
                      title="Back to CCTV List"
                      className={`
                            flex items-center gap-2 p-3 text-white rounded-lg
                            ${error || currentItems.length === 0
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700 transition'}
                            `}
                    >
                      <FaArrowLeft className='h-4 w-4'/>
                    </RoleButton>
                </div>
            )}

            {/* Toolbar - hanya di table & violation */}
            {(view === 'table') && (
                <div className="flex items-center justify-end gap-2">
                  <RoleButton
                    allowedRoles={['super_admin']}
                    disabled={error || currentItems.length === 0}
                    onClick={() => setShowAddModal(true)}
                    className={`
                        flex items-center gap-2 p-3 text-white rounded-lg
                        ${error || currentItems.length === 0
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-green-600 hover:bg-green-700 transition'}
                        `}
                    title="Add New CCTV"
                  >
                    <FaPlus className='h-4 w-4'/>
                  </RoleButton>

                  <div className='flex items-center relative w-full max-w-sm'>
                    <input
                      disabled={error || currentItems.length === 0}
                      type="text"
                      placeholder="Type Name, IP, or Location..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 pl-10"
                    />
                    <FaSearch className="absolute left-3 text-gray-400 w-4 h-4" />
                  </div>
                </div>
            )}
        </div>

        {/* Main Content */}
        {loading ? (
          <p className="flex justify-center w-full py-6 bg-white rounded-xl shadow-lg text-gray-600 h-48 items-center">Loading content...</p>
        ) : (
        <>
          {view !== 'stream' ? (
            <>
              <div className='bg-white rounded-lg shadow-lg overflow-x-auto'>
                <CCTVTable
                  cctvs={currentItems} 
                  onSelect={handleSelect}
                  onEdit={handleEdit}     
                  onDelete={handleDelete}
                  startNo={indexOfFirstItem + 1} 
                />
              </div>
              <Pagination
                totalItems={filteredCctvs.length}
                itemsPerPage={itemsPerPage}
                currentPage={currentPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </>
          )
          : selectedCCTV && (
              <CCTVStream cctvId={selectedCCTV} />
          )}
        </>)}

      {/* MODAL */}
      <ModalAddCCTV
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
        violations={violations}
      />
      <ModalEditCCTV
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onUpdate={handleUpdate}
        cctvData={selectedEditCCTV}
        violations={violations}
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