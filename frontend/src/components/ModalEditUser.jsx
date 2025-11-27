import React, { useState, useEffect } from 'react';
import { FaTimes, FaUserEdit, FaUsers, FaEye, FaEyeSlash } from 'react-icons/fa'; 
import { useAlert } from './AlertProvider'; 
import Multiselect from './Multiselect'; 
import RoleButton from './RoleButton';

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
    const [showEmailTooltip, setShowEmailTooltip] = useState(false);
    const [showUsernameTooltip, setShowUsernameTooltip] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);

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

    const validateGmail = (email) => {
        return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
    };

    const validateUsername = (username) => {
        return /^[a-z][a-z0-9_]{7,19}$/.test(username);
    };

    const validatePassword = (password) => {
        const minLength = password.length >= 8;
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSymbol = /[@$!%*?&]/.test(password);

        if (!minLength) return "Password must be at least 8 characters";
        if (!hasUppercase) return "Password must contain an uppercase letter";
        if (!hasLowercase) return "Password must contain a lowercase letter";
        if (!hasNumber) return "Password must contain a number";
        if (!hasSymbol) return "Password must contain a symbol (@$!%*?&)";
        return null;
    };

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

        // Validasi Basic
        if (!form.username?.trim()) return showAlert('Username is required.', 'warning'); 
        if (!form.full_name?.trim()) return showAlert('User\'s full name is required.', 'warning'); 
        if (!form.email?.trim()) return showAlert('Email is required.', 'warning'); 
        if (!form.role?.trim()) return showAlert('User\' role is required.', 'warning'); 

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
            const passwordError = validatePassword(form.password);
            if (passwordError) {
                showAlert(passwordError, 'warning');
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

    const UsernameTooltip = ({ isVisible }) => {
        if (!isVisible) return null;
        return (
            <div className="absolute z-10 -top-2 left-1/2 -translate-x-1/2 -translate-y-full">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-3 px-4 shadow-xl whitespace-nowrap">
                    <p className="font-semibold mb-2 text-center">Username must be:</p>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span>✓</span>
                            <span>At least 8 characters</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>✓</span>
                            <span>Only lowercase letters, numbers, and underscores</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>✓</span>
                            <span>Must start with a lowercase letter</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>✗</span>
                            <span>No spaces, periods, or other symbols</span>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-3 h-3 bg-gray-900"></div>
                </div>
            </div>
        );
    };

    // Fungsi untuk cek syarat password secara real-time
    const getPasswordStrength = (password) => {
        return {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            symbol: /[@$!%*?&]/.test(password),
        };
    };

    const strength = getPasswordStrength(form.password);
    const allValid = Object.values(strength).every(Boolean);

    const PasswordTooltip = ({ strength, isVisible }) => {
        if (!isVisible) return null;
        return (
            <div className="absolute z-10 -top-2 left-1/2 -translate-x-1/2 -translate-y-full mb-2">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-3 px-4 shadow-xl whitespace-nowrap">
                    <p className="font-semibold mb-2 text-center">
                        {allValid ? '✓ Strong password!' : 'Password must be:'}
                    </p>
                    <div className="space-y-1">
                        <div className={`flex items-center gap-2 ${strength.length ? 'text-green-400' : 'text-red-400'}`}>
                            <span>{strength.length ? '✓' : '✗'}</span>
                            <span>At least 8 characters</span>
                        </div>
                        <div className={`flex items-center gap-2 ${strength.uppercase ? 'text-green-400' : 'text-red-400'}`}>
                            <span>{strength.uppercase ? '✓' : '✗'}</span>
                            <span>One uppercase letter (A-Z)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${strength.lowercase ? 'text-green-400' : 'text-red-400'}`}>
                            <span>{strength.lowercase ? '✓' : '✗'}</span>
                            <span>One lowercase letter (a-z)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${strength.number ? 'text-green-400' : 'text-red-400'}`}>
                            <span>{strength.number ? '✓' : '✗'}</span>
                            <span>One number (0-9)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${strength.symbol ? 'text-green-400' : 'text-red-400'}`}>
                            <span>{strength.symbol ? '✓' : '✗'}</span>
                            <span>One symbol (@$!%*?&)</span></div>
                    </div>
                    {/* Panah bawah */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-3 h-3 bg-gray-900"></div>
                </div>
            </div>
        );
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
                
                {/* Full Name & Email */}
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <div className='relative'>
                             <input
                                type="email"
                                required
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                onFocus={() => setShowEmailTooltip(true)}
                                onBlur={() => setShowEmailTooltip(false)}
                                className={`w-full px-3 py-2 pr-12 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${
                                    form.email && !validateGmail(form.email)
                                        ? 'border-red-500 focus:border-red-500'
                                        : 'border-gray-300'
                                }`}
                                placeholder="Use Gmail account!"
                            />

                            {/* Indikator valid */}
                            {form.email && (
                                <div className="absolute right-3 top-2.5">
                                    {validateGmail(form.email) ? (
                                        <span className="text-green-600 text-xl">✓</span>
                                    ) : (
                                        <span className="text-red-600 text-xl">✗</span>
                                    )}
                                </div>
                            )}

                            {/* Tooltip Gmail Only */}
                            <div className={`absolute z-10 -top-2 left-1/2 -translate-x-1/2 -translate-y-full ${showEmailTooltip && form.email ? 'block' : 'hidden'}`}>
                                <div className="bg-gray-900 text-white text-xs rounded-lg py-3 px-4 shadow-xl whitespace-nowrap font-medium">
                                    <p className="flex items-center gap-2">
                                        <span>Only Gmail emails are allowed!</span>
                                    </p>
                                    <p className="text-xs mt-1 opacity-90">
                                        Example: yourname@gmail.com
                                    </p>
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-3 h-3 bg-gray-900"></div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* Username & Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                        <div className='relative'>
                            <input
                            type="text"
                            required
                            value={form.username}
                            onChange={(e) => {
                                const value = e.target.value.toLowerCase(); 
                                setForm({ ...form, username: value });
                            }}
                            onFocus={() => setShowUsernameTooltip(true)}
                            onBlur={() => setShowUsernameTooltip(false)}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${
                                form.username && !validateUsername(form.username)
                                    ? 'border-red-500 focus:border-red-500'
                                    : 'border-gray-300'
                            }`}
                            placeholder="Min. 8 characters, starting with a lowercase letter, can add numbers or underscores"
                            maxLength={20}
                            />
                            {/* Indikator valid */}
                            {form.username && (
                                <div className="absolute right-3 top-2.5 items-center">
                                    {validateUsername(form.username) ? (
                                        <span className="text-green-600 text-xl">✓</span>
                                    ) : (
                                        <span className="text-red-600 text-xl">✗</span>
                                    )}
                                </div>
                            )}

                            {/* Tooltip */}
                            <UsernameTooltip isVisible={showUsernameTooltip && form.username.length > 0} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {userData ? 'New Password' : 'Password'} *
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required={!userData} 
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                                onFocus={() => setShowTooltip(true)}
                                onBlur={() => setShowTooltip(false)}
                                className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                placeholder="Min. 8 char, with uppercase, number & symbol"
                            />
                            {/* Tombol Show/Hide */}
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-2.5 text-gray-500 hover:text-gray-700"
                            >
                                {showPassword ? <FaEye className="w-5 h-5" /> : <FaEyeSlash className="w-5 h-5" />}
                            </button>

                            {/* Tooltip Password Strength */}
                            <PasswordTooltip strength={strength} isVisible={showTooltip && form.password.length > 0} />
                        </div>

                        {userData && (
                            <p className="text-xs text-gray-500 mt-2">Leave blank to keep current password.</p>
                        )}
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

                    {form.role !== 'viewer' && (
                        <div>
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
                    )}
                </div>
                
                {/* Footer */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancel</button>
                    <RoleButton
                        allowedRoles={['super_admin']} 
                        type="submit" 
                        disabled={submitting}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                        {submitting ? 'Updating...' : 'Update User'}
                    </RoleButton>
                </div>
            </form>
        </dialog>
    );
}