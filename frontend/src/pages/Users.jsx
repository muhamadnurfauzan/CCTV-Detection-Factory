import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaSearch, FaPenSquare, FaTrash } from 'react-icons/fa';
import { useAlert } from '../components/AlertProvider';
import Pagination from '../components/Pagination';

// Helper: Komponen untuk menampilkan tags CCTV
const CCTVTaggable = ({ cctvs }) => {
    if (!cctvs || cctvs.length === 0) {
        return <span className="text-gray-400 italic text-xs">No CCTV Assigned</span>;
    }
    
    // Hanya tampilkan 2 tag di tabel, sisanya sebagai tooltip (jika ada)
    const displayedCctvs = cctvs.slice(0, 2);
    const remainingCount = cctvs.length - 2;

    return (
        <div className="flex flex-wrap gap-1">
            {displayedCctvs.map((cctv) => (
                <span 
                    key={cctv.id}
                    className="px-2 py-0.5 text-xs font-medium text-indigo-800 bg-indigo-100 rounded-full"
                    title={`Location: ${cctv.location}`}
                >
                    {cctv.name}
                </span>
            ))}
            {remainingCount > 0 && (
                <span 
                    className="px-2 py-0.5 text-xs font-medium text-gray-700 bg-gray-200 rounded-full cursor-pointer"
                    title={cctvs.slice(2).map(c => c.name).join(', ')}
                >
                    +{remainingCount} more
                </span>
            )}
        </div>
    );
};

export default function Users() {
    const { showAlert } = useAlert();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // State Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); 
    
    // State Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalItems, setTotalItems] = useState(0); 

    // --- Debouncing Logic ---
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // --- Data Fetching ---
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                search: debouncedSearchQuery,
                page: currentPage,
                limit: itemsPerPage
            }).toString();
            
            const res = await fetch(`/api/users_with_cctvs?${params}`); 
            if (!res.ok) throw new Error("Failed to fetch user data.");
            
            const data = await res.json();
            
            setUsers(data.users || []); 
            setTotalItems(data.totalItems || 0); 

        } catch (err) {
            setUsers([]);
            setTotalItems(0);
            setError(err.message || 'Error loading user data.');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearchQuery, currentPage, itemsPerPage]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]); 

    // --- Handler CRUD (Placeholder) ---
    const handleAddUser = () => showAlert('Opening Add User Modal...', 'info');
    const handleEdit = (id) => showAlert(`Editing User ID ${id}...`, 'info');
    const handleDelete = (id) => showAlert(`Deleting User ID ${id}...`, 'warning');
    
    // --- Handler Pagination ---
    const handlePageChange = (page) => setCurrentPage(page);
    const handleItemsPerPageChange = (items) => {
        setItemsPerPage(items);
        setCurrentPage(1);
    };

    // Helper untuk tampilan Role yang lebih baik
    const formatRole = (role) => {
        return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    // --- Render ---
    if (error) return <p className="text-center py-8 text-red-500">{error}</p>;

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-sans">
            <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">User Management</h2>
            
            {/* Toolbar dan Search Bar */}
            <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-lg shadow-md gap-2">
                
                <button
                    onClick={handleAddUser}
                    className="flex items-center gap-2 p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                    <FaPlus className="w-4 h-4" /> Add User
                </button>

                {/* Search Bar */}
                <div className="flex items-center relative w-full max-w-sm">
                    <input
                        type="text"
                        placeholder="Search Name, Email, or CCTV Region..."
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
            
            {/* Loading State */}
            {loading ? (
                <div className="p-6 flex items-center justify-center h-48 bg-white rounded-lg shadow-lg">
                    <p className="text-xl font-semibold text-gray-700">Loading User Data...</p>
                </div>
            ) : (
                <>
                    {/* Konten Utama: Tabel */}
                    <div className="bg-white rounded-lg shadow-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-indigo-200 text-center">
                                <tr>
                                    <th className="p-3 text-indigo-800 border-r">No.</th>
                                    <th className="p-3 text-indigo-800 border-r text-left">Full Name</th>
                                    <th className="p-3 text-indigo-800 border-r text-left">Email</th>
                                    <th className="p-3 text-indigo-800 border-r">Role</th>
                                    <th className="p-3 text-indigo-800 border-r">Region (CCTVs)</th>
                                    <th className="p-3 text-indigo-800">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="text-center text-gray-500 p-4">
                                            No users found based on current search or filters.
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((user, i) => (
                                        <tr key={user.id} className="hover:bg-gray-50 transition">
                                            <td className="p-3 text-center text-gray-600 border-r">
                                                {(currentPage - 1) * itemsPerPage + i + 1}
                                            </td>
                                            <td className="p-3 text-gray-700 font-medium whitespace-nowrap border-r">{user.full_name}</td>
                                            <td className="p-3 text-gray-600 whitespace-nowrap border-r">{user.email}</td>
                                            <td className="p-3 text-center border-r">
                                                <span 
                                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        user.role === 'super_admin' ? 'bg-red-100 text-red-800' :
                                                        user.role === 'cctv_editor' ? 'bg-blue-100 text-blue-800' :
                                                        user.role === 'report_viewer' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    {formatRole(user.role)}
                                                </span>
                                            </td>
                                            <td className="p-3 text-left border-r">
                                                {/* Kolom Region/CCTV (menggunakan tags) */}
                                                <CCTVTaggable cctvs={user.cctvs} />
                                            </td>
                                            <td className="p-3 text-center space-x-2 whitespace-nowrap">
                                                {/* Tombol Aksi */}
                                                <button
                                                    onClick={() => handleEdit(user.id)}
                                                    className="text-green-600 hover:text-green-800 transition"
                                                    title="Edit User"
                                                >
                                                    <FaPenSquare className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    className="text-red-600 hover:text-red-800 transition"
                                                    title="Delete User"
                                                >
                                                    <FaTrash className="w-5 h-5" />
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
                </>
            )}
        </div>
    );
}