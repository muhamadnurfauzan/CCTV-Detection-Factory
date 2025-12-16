import React, { useState, useEffect, useCallback } from 'react';
import { FaFilter, FaSearch, FaArrowUp, FaArrowDown, FaEnvelope, FaFileImage, FaTrash, FaPaperPlane } from 'react-icons/fa';
import { useAlert } from '../components/AlertProvider';
import Pagination from '../components/Pagination';
import ModalDeleteReport from '../components/ModalDeleteReport';
import RoleButton from '../components/RoleButton';
import ModalSendRecap from '../components/ModalSendRecap';

// --- Helper Modal Preview Gambar ---
const ImagePreviewModal = ({ imageUrl, onClose }) => {
    if (!imageUrl) return null;

    return (
        // MODAL 
        <div
            className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="relative bg-white rounded-lg p-2 shadow-2xl max-w-5xl max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <img
                    src={imageUrl}
                    alt="Violation Preview"
                    className="max-w-full max-h-[85vh] object-contain"
                    loading="lazy"
                />
            </div>
            {/* INFO DI BAWAH */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white place-content-center text-center mt-2">
                <p className='text-base'>Clik here to close the image.</p>
            </div>
        </div>
    );
};

export default function Reports() {
    const { showAlert } = useAlert();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // State Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); 
    const [sortOrder, setSortOrder] = useState('desc');
    
    // State Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalItems, setTotalItems] = useState(0); 

    // --- State Modal Preview Image ---
    const [showImageModal, setShowImageModal] = useState(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState(null);

    // --- State Modal Delete Report ---
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedReportData, setSelectedReportData] = useState(null);

    // --- State Multi-Select ---
    const [selectedReportIds, setSelectedReportIds] = useState([]);

    // --- State for Modal Manual Recap Email ---
    const [showRecapModal, setShowRecapModal] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [allCCTVs, setAllCCTVs] = useState([]);

    // --- Efek 1: Debouncing Search Input ---
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]); 
    
    // --- Data Fetching Menggunakan API Asli ---
    const fetchReports = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        if (debouncedSearchQuery.length < 3 && debouncedSearchQuery.length > 0) {
            // Optional: Tampilkan pesan "Search minimal 3 karakter"
            return;
        }

        try {
            const params = new URLSearchParams({
                search: debouncedSearchQuery,
                sort: sortOrder,
                page: currentPage,
                limit: itemsPerPage
            }).toString();
            
            const res = await fetch(`/api/reports?${params}`); 
            if (!res.ok) throw new Error("Failed to fetch reports data.");
            
            const data = await res.json();
            
            setReports(data.reports || []); 
            setTotalItems(data.totalItems || 0); 

        } catch (err) {
            setReports([]);
            setTotalItems(0);
            setError(err.message || 'Error loading reports.');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearchQuery, sortOrder, currentPage, itemsPerPage]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]); 

    // --- Websocket fetching data realtime  ---
    useEffect(() => {
        const eventSource = new EventSource('/api/sse');

        eventSource.onmessage = () => {
            setCurrentPage(1);
            fetchReports();
            showAlert('New violation detected!', 'success');
        };

        eventSource.onerror = () => {
            eventSource.close();
            setTimeout(() => new EventSource('/api/reports/sse'), 3000);
        };

        return () => eventSource.close();
    }, [showAlert]);

    // --- Fetch Data Users & CCTVs untuk Modal ---
    useEffect(() => {
        const fetchFilterData = async () => {
            try {
                // 1. Fetch Users
                const userRes = await fetch('/api/users-list'); 
                if (!userRes.ok) throw new Error("Failed to fetch user list.");
                const userData = await userRes.json();
                setAllUsers(userData);

                // 2. Fetch CCTVs
                const cctvRes = await fetch('/api/cctvs-list');
                if (!cctvRes.ok) throw new Error("Failed to fetch CCTV list.");
                const cctvData = await cctvRes.json();
                setAllCCTVs(cctvData);

            } catch (err) {
                console.error("Error fetching filter data:", err);
                showAlert(`Failed to load filter data: ${err.message}`, 'error'); 
            }
        };
        fetchFilterData();
    }, []);

    // --- Handler Aksi ---
    // --- Handler Kirim Email ---
    const handleReport = async (reportId) => {
        showAlert(`Sending email notification for Violation ID ${reportId}...`, 'info');
        
        try {
            const res = await fetch(`/api/send-email/${reportId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });            
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Failed to send email. Check backend log.");
            }
            showAlert(data.message || `Email report successfully sent for Violation ID ${reportId}!`, 'success');
        } catch (err) {
            showAlert(`Error: ${err.message}`, 'error');
        }
    };

    // --- Handler Checkbox (Individual) ---
    const handleSelectReport = (reportId) => {
        setSelectedReportIds(prevIds => 
            prevIds.includes(reportId)
                ? prevIds.filter(id => id !== reportId) 
                : [...prevIds, reportId] 
        );
    };

    // --- Handler Checkbox (Pilih Semua) ---
    const handleSelectAll = () => {
        if (selectedReportIds.length === reports.length) {
            // Jika semua sudah dipilih di halaman ini, batalkan semua
            setSelectedReportIds([]);
        } else {
            // Pilih semua ID di halaman saat ini
            const allIds = reports.map(report => report.id);
            setSelectedReportIds(allIds);
        }
    };

    // --- Handler Panggil Modal Delete (Tunggal/Massal) ---
    const handleDeleteReport = (report) => {
        setSelectedReportData(report);
        setShowDeleteModal(true);
    };

    // --- Handler Delete Massal (Memanggil Modal) ---
    const handleDeleteSelected = () => {
        if (selectedReportIds.length === 0) return;

        // Data ringkasan untuk modal
        const isBatch = selectedReportIds.length > 1; // Jika lebih dari 1 adalah Batch Delete
        
        const reportDataForModal = {
            // Menggunakan string koma untuk menandakan ini adalah aksi massal
            id: selectedReportIds.join(', '), 
            cctv_name: isBatch ? `Total: ${selectedReportIds.length} Reports Selected` : 'Single Report Selected',
            violation_name: isBatch ? 'BATCH DELETE' : selectedReportIds[0],
            timestamp: new Date().toISOString(),
        };

        setSelectedReportData(reportDataForModal);
        setShowDeleteModal(true);
    };

    // --- Handler Kirim Rekap Manual ---
    const handleSendRecapManual = async ({ 
        startDate, 
        endDate, 
        reportType: templateKey, 
        selectedUserIds, 
        selectedCctvIds, 
        setLoading 
    }) => { 
        console.log("REPORTS.JSX RECEIVED:", { selectedUserIds, selectedCctvIds });
        setLoading(true);
        showAlert(`Trigger Recap delivery (${startDate} to ${endDate})...`, 'info');
        
        try {
            const res = await fetch(`/api/send-recap`, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    start_date: startDate,
                    end_date: endDate,
                    report_type: templateKey,
                    selected_user_ids: selectedUserIds, 
                    selected_cctv_ids: selectedCctvIds  
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.message || "Failed to trigger recap send.");
            }
            
            showAlert(data.message || `Email Recap triggered successfully!`, 'success');
            setShowRecapModal(false); 

        } catch (err) {
            showAlert(`Error: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- Handler Preview Image Violation ---
    const handlePreviewImage = (imageUrl) => {
        setSelectedImageUrl(imageUrl);
        setShowImageModal(true);
    };

    // --- Handler Konfirmasi Penghapusan (dipanggil dari ModalDeleteReport) ---
    const handleConfirmDelete = (deletedReportId) => {
        setSelectedReportIds([]);
        fetchReports(); 
    };

    // --- Handler Pagination ---
    const handlePageChange = (page) => setCurrentPage(page);
    const handleItemsPerPageChange = (items) => {
        setItemsPerPage(items);
        setCurrentPage(1);
    };
    
    // --- Render ---
    return (
        <div className="p-6 bg-gray-100 min-h-screen font-sans">
            <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Violation Reports</h2>
            {/* Filter dan Search Bar */}
            <div className="grid grid-flow-col justify-stretch items-center mb-4 bg-white p-3 rounded-lg shadow-md gap-2">
                <div className="flex justify-start">
                    {/* Tombol Filter (Sort Order) */}
                    <RoleButton
                        allowedRoles={['super_admin', 'report_viewer']} 
                        disabled={error}
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                        className={`
                            flex items-center gap-2 p-3  text-white rounded-lg
                            ${error 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700 transition'}
                            `}
                        title={`Sort by Timestamp: ${sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}`}
                    >
                        <FaFilter className="w-4 h-4" />
                        {sortOrder === 'desc' ? <FaArrowDown className='w-3 h-3'/> : <FaArrowUp className='w-3 h-3'/>}
                    </RoleButton>
                </div>

                <div className='flex items-center justify-end gap-2'>
                    {/* Tombol Kirim Rekap Manual */}
                    <RoleButton
                        allowedRoles={['super_admin', 'report_viewer']} 
                        onClick={() => setShowRecapModal(true)}
                        disabled={error}
                        className={`
                            flex items-center gap-2 p-3 text-white rounded-lg
                            ${error 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700 transition'}
                        `}
                        title="Send Manual Summary Report (Weekly/Monthly)"
                    >
                        <FaPaperPlane className='h-4 w-4'/>
                    </RoleButton>

                    {/* Delete All Button */}
                    <div className="flex">
                        <RoleButton
                            allowedRoles={['super_admin']} 
                            onClick={handleDeleteSelected}
                            disabled={selectedReportIds.length < 2 || error} 
                            className={`
                            flex items-center gap-2 px-3 py-2 text-white rounded-lg 
                            ${selectedReportIds.length >= 2 
                                ? 'bg-red-600 hover:bg-red-700 transition'
                                : 'bg-gray-400 cursor-not-allowed'          
                            }
                            `}
                            title={`Delete ${selectedReportIds.length} selected reports`}
                        >
                            <FaTrash className='h-4 w-4'/>({selectedReportIds.length})
                        </RoleButton>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="flex items-center relative w-full max-w-sm">
                        <input
                            disabled={error}
                            type="text"
                            placeholder="Type CCTV Name..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1); 
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 pl-10"
                        />
                        <FaSearch className="absolute left-3 text-gray-400 w-4 h-4" />
                    </div>
                </div>
            </div>

            {loading ? (
            <p className="flex justify-center w-full py-6 bg-white rounded-xl shadow-lg text-gray-600 h-48 items-center">Loading reports...</p>
            ) : (
            <>
                {/* Konten Utama: Tabel dan Pagination */}
                <div className="bg-white rounded-lg shadow-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-indigo-200 text-center">
                            <tr>
                                <th className="p-2 text-indigo-800 border-r w-10">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedReportIds.length > 0 && selectedReportIds.length === reports.length}
                                        onChange={handleSelectAll} 
                                        title="Select All on this page"
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-2 text-indigo-800 border-r">No</th>
                                <th className="p-2 text-indigo-800 border-r">CCTV</th>
                                <th className="p-2 text-indigo-800 border-r">Violation</th>
                                <th className="p-2 text-indigo-800 border-r whitespace-nowrap">Date</th>
                                <th className="p-2 text-indigo-800">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center text-gray-500 p-4">
                                        No reports found based on current filters.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report, i) => (
                                    <tr key={report.id} className="hover:bg-gray-50 transition">
                                        <td className="border-r p-2 text-gray-700 text-center whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                checked={selectedReportIds.includes(report.id)}
                                                onChange={() => handleSelectReport(report.id)}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="border-r p-2 text-center text-gray-600 whitespace-nowrap">
                                            {(currentPage - 1) * itemsPerPage + i + 1}
                                        </td>
                                        <td className="border-r p-2 text-gray-700 whitespace-nowrap">{report.cctv_name}</td>
                                        <td className="border-r p-2 text-gray-700 text-center whitespace-nowrap">{report.violation_name}</td>
                                        <td className="border-r p-2 text-gray-600 text-center whitespace-nowrap">
                                            {new Date(report.timestamp).toLocaleString("id-ID", {timeZone: "UTC"})}
                                            {/* {new Date(report.timestamp).toLocaleString()} */}
                                        </td>
                                        <td className="p-2 text-center space-x-2 whitespace-nowrap">
                                            <div className='flex flex-col sm:flex-row justify-center items-center gap-2 transition-all duration-300 ease-in-out'>
                                                <RoleButton
                                                    allowedRoles={['super_admin', 'report_viewer']} 
                                                    onClick={() => handlePreviewImage(report.image_url)}
                                                    className="text-green-600 hover:text-green-800 transition p-1 rounded-full bg-green-100"
                                                    title="Preview Violation Image"
                                                >
                                                    <FaFileImage className="w-5 h-5" />
                                                </RoleButton>
                                                <RoleButton
                                                    allowedRoles={['super_admin', 'report_viewer']} 
                                                    onClick={() => handleReport(report.id)}
                                                    className="text-indigo-600 hover:text-indigo-800 transition p-1 rounded-full bg-indigo-100"
                                                    title="Send Manual Report via Email"
                                                >
                                                    <FaEnvelope className="w-5 h-5" />
                                                </RoleButton>
                                                {/* Tombol Delete */}
                                                <RoleButton
                                                    allowedRoles={['super_admin']} 
                                                    onClick={() => handleDeleteReport(report)} 
                                                    className="text-red-600 hover:text-red-800 transition p-1 rounded-full bg-red-100"
                                                >
                                                    <FaTrash className="w-5 h-5" />
                                                </RoleButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
        
                {/* Pagination */}
                {totalItems > 0 && (
                    <Pagination
                        totalItems={totalItems}
                        itemsPerPage={itemsPerPage}
                        currentPage={currentPage}
                        onPageChange={handlePageChange}
                        onItemsPerPageChange={handleItemsPerPageChange}
                    />
                )}
            </>)}

            {/* Modal Gambar */}
            {showImageModal && (
                <ImagePreviewModal 
                    imageUrl={selectedImageUrl}
                    onClose={() => setShowImageModal(false)}
                />
            )}

            {/* Modal Delete Report */}
            {showDeleteModal && (
                <ModalDeleteReport 
                    open={showDeleteModal}
                    onClose={() => setShowDeleteModal(false)}
                    onConfirm={handleConfirmDelete} 
                    reportData={selectedReportData}
                />
            )}

            {/* Modal Send Recap Email Manually */}
            {showRecapModal && (
                <ModalSendRecap
                    open={showRecapModal}
                    onClose={() => setShowRecapModal(false)}
                    onSend={handleSendRecapManual}
                    allUsers={allUsers}
                    allCCTVs={allCCTVs}
                />
            )}
        </div>
    );
}