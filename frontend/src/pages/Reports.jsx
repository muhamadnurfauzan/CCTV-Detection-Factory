import React, { useState, useEffect, useCallback } from 'react';
import { FaFilter, FaSearch, FaArrowUp, FaArrowDown, FaEnvelope } from 'react-icons/fa';
import { useAlert } from '../components/AlertProvider';
import Pagination from '../components/Pagination';

// Helper component untuk menampilkan gambar (Anda perlu membuat ini di folder components)
const ReportImagePreview = ({ imageUrl }) => (
    // Gunakan URL aktual dari database
    <img 
        src={imageUrl} 
        alt="Violation" 
        className="w-16 h-12 object-cover rounded-md shadow-sm border" 
    />
);

export default function Reports() {
    const { showAlert } = useAlert();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // State Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('desc');
    
    // State Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalItems, setTotalItems] = useState(0); // <-- State untuk total item

    // --- Data Fetching Menggunakan API Asli ---
    const fetchReports = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                search: searchQuery,
                sort: sortOrder,
                page: currentPage,
                limit: itemsPerPage
            }).toString();
            
            const res = await fetch(`/api/reports?${params}`); 
            if (!res.ok) throw new Error("Failed to fetch reports data.");
            
            const data = await res.json();
            
            // 1. Simpan data laporan halaman saat ini
            setReports(data.reports || []); 
            
            // 2. Simpan total item dari backend untuk pagination
            setTotalItems(data.totalItems || 0); 

        } catch (err) {
            // Jika backend mengembalikan 0 totalItems, pastikan data list juga kosong.
            setReports([]);
            setTotalItems(0);
            setError(err.message || 'Error loading reports.');
        } finally {
            setLoading(false);
        }
    }, [searchQuery, sortOrder, currentPage, itemsPerPage]);

    useEffect(() => {
        // Panggil fetchReports setiap kali parameter filter/pagination berubah
        fetchReports();
    }, [fetchReports]); 

    // --- Handler Aksi (Manual Report) ---
    const handleReport = (reportId) => {
        showAlert(`Manually reporting violation ID ${reportId}... (Logic to send email here)`, 'info');
    };
    
    // --- Handler Pagination ---
    const handlePageChange = (page) => setCurrentPage(page);
    const handleItemsPerPageChange = (items) => {
        setItemsPerPage(items);
        setCurrentPage(1);
    };
    
    // --- Render ---
    if (loading) return <div className="p-6 flex items-center justify-center h-screen bg-gray-100"><p className="text-xl font-semibold text-gray-700">Loading Reports...</p></div>;
    if (error) return <p className="text-center py-8 text-red-500">{error}</p>;

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-sans">
            <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Violation Reports</h2>
            
            {/* Filter dan Search Bar */}
            <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-lg shadow-md">
                <div className="flex space-x-3">
                    {/* Tombol Filter (Sort Order) */}
                    <button
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                        className="flex items-center gap-2 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                        title={`Sort by Timestamp: ${sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}`}
                    >
                        <FaFilter className="w-4 h-4" />
                        {sortOrder === 'desc' ? <FaArrowDown className='w-3 h-3'/> : <FaArrowUp className='w-3 h-3'/>}
                    </button>
                </div>

                {/* Search Bar */}
                <div className="flex items-center relative w-full max-w-sm">
                    <input
                        type="text"
                        placeholder="Type CCTV Name..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1); // Reset halaman saat search
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 pl-10"
                    />
                    <FaSearch className="absolute left-3 text-gray-400 w-4 h-4" />
                </div>
            </div>

            {/* Konten Utama: Tabel dan Pagination */}
            <div className="bg-white rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-indigo-200 text-center">
                        <tr>
                            <th className="p-2 text-indigo-800 border-r">No</th>
                            <th className="p-2 text-indigo-800 border-r">CCTV</th>
                            <th className="p-2 text-indigo-800 border-r">Violation</th>
                            <th className="p-2 text-indigo-800 border-r">Picture</th>
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
                                    <td className="border-r p-2 text-center text-gray-600 whitespace-nowrap">
                                        {(currentPage - 1) * itemsPerPage + i + 1}
                                    </td>
                                    <td className="border-r p-2 text-gray-700 whitespace-nowrap">{report.cctv_name}</td>
                                    <td className="border-r p-2 text-gray-700 text-center whitespace-nowrap">{report.violation_name}</td>
                                    <td className="border-r p-2 text-center justify-center flex">
                                        <ReportImagePreview imageUrl={report.image_url} />
                                    </td>
                                    <td className="border-r p-2 text-gray-600 text-center whitespace-nowrap">
                                        {new Date(report.timestamp).toLocaleString()}
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => handleReport(report.id)}
                                            className="text-indigo-600 hover:text-indigo-800 transition p-1 rounded-full bg-indigo-100"
                                            title="Send Manual Report via Email"
                                        >
                                            <FaEnvelope className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* Komponen Pagination */}
            {totalItems > 0 && (
                <Pagination
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                />
            )}
        </div>
    );
}