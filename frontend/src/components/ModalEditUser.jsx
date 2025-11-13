import React, { useState, useEffect } from 'react';
import { FaTimes, FaUserEdit, FaUsers } from 'react-icons/fa'; 
import { useAlert } from './AlertProvider'; 
import Multiselect from './Multiselect'; 

const VALID_ROLES = [
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'cctv_editor', label: 'CCTV Editor' },
    { value: 'report_viewer', label: 'Report Viewer' },
    { value: 'viewer', label: 'Viewer' }
];

export default function ModalEditUser({ open, onClose, onUpdate, userData }) {
    const { showAlert } = useAlert();
    const [form, setForm] = useState({
        username: '', 
        full_name: '', 
        email: '', 
        password: '', 
        role: 'viewer', 
        cctv_ids: []
    });
    const [cctvList, setCctvList] = useState([]);
    const [loadingCctv, setLoadingCctv] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open && userData) {
            setForm({
                username: userData.username || '', 
                full_name: userData.full_name || '',
                email: userData.email || '',
                password: '', 
                role: userData.role || 'viewer',
                cctv_ids: userData.cctvs ? userData.cctvs.map(c => c.id) : [] 
            });
            fetchCctvList();
        }
    }, [open, userData]);

    const fetchCctvList = async () => {
        setLoadingCctv(true);
        try {
            const res = await fetch('/api/cctv_all'); 
            if (!res.ok) throw new Error("Gagal mengambil daftar CCTV.");
            const data = await res.json();
            
            const formattedList = data.map(cctv => ({
                id: cctv.id, 
                label: `${cctv.name} (${cctv.location})`,
                value: cctv.id 
            }));
            setCctvList(formattedList);
        } catch (err) {
            showAlert('Error fetching CCTV: ' + err.message, 'error');
            setCctvList([]);
        } finally {
            setLoadingCctv(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        const payload = {
            username: form.username.trim(), 
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            role: form.role,
            cctv_ids: form.cctv_ids
        };

        if (!payload.username) {
             showAlert('Username is required!', 'warning');
             setSubmitting(false);
             return;
        }

        if (form.password) {
             if (form.password.length < 6) {
                 showAlert('New password min 6 characters!', 'warning');
                 setSubmitting(false);
                 return;
            }
            payload.password = form.password;
        }

        try {
            const res = await fetch(`/api/user_update/${userData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const result = await res.json();
                
                onUpdate(); 
                
                onClose();
                showAlert(`User '${payload.full_name}' successfully updated.`, 'success');
            } else {
                const err = await res.json();
                showAlert(err.error || 'Failed to update user.', 'error');
            }
        } catch {
            showAlert('Network error: Unable to connect to server.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700">
                    <FaUserEdit className="w-6 h-6" /> Edit User: {userData?.full_name}
                </h2>
                <button onClick={onClose} className="text-2xl text-gray-500 hover:text-red-500"><FaTimes className="w-6 h-6" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Full Name & Username */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                        <input
                            type="text"
                            required
                            value={form.full_name}
                            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                        <input
                            type="text"
                            required
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {/* Email & Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input
                            type="email"
                            required
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                        <input
                            type="password"
                            minLength={6}
                            placeholder="Min 6 characters"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave blank to retain old password.</p>
                    </div>
                </div>

                {/* Role & CCTV Assignment */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                    <div className="relative mb-4">
                        <FaUsers className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                        <select
                            required
                            value={form.role}
                            onChange={(e) => setForm({ ...form, role: e.target.value })}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 appearance-none"
                        >
                            {VALID_ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>

                    <label className="block text-sm font-medium text-gray-700 mb-1">Regions CCTV (Optional)</label>
                    {loadingCctv ? (
                        <p className="text-gray-500 italic text-sm p-3 border rounded-lg bg-gray-50">Loading CCTVs...</p>
                    ) : (
                        <Multiselect
                            options={cctvList}
                            selectedValues={form.cctv_ids}
                            onSelect={(selected) => setForm({ ...form, cctv_ids: selected })}
                            placeholder="Select CCTV to manage..."
                        />
                    )}
                    <p className="text-xs text-gray-500 mt-1">Only the 'CCTV Editor' role requires this assignment.</p>
                </div>
                
                {/* Footer */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition">Delete</button>
                    <button type="submit" disabled={submitting} className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                        {submitting ? 'Updating...' : 'Update User'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}