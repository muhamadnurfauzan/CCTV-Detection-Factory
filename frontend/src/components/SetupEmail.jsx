// components/SetupEmail.jsx
import React, { useState, useEffect } from 'react';
import { useAlert } from './AlertProvider'; 
import RoleButton from './RoleButton';

const initialFormData = {
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '', 
    smtp_from: '',
    enable_auto_email: false,
};

// Fungsi insert tag
const insertAtCursor = (field, text) => {
  setTemplate(prev => {
    const old = prev[field] || '';
    return { ...prev, [field]: old + text };
  });
};

const SetupEmail = () => {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState(initialFormData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [newPassword, setNewPassword] = useState('');

    // 1. Fetch data saat komponen dimuat (GET /api/settings)
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                if (!res.ok) throw new Error('Failed to fetch settings.');
                const data = await res.json();
                
                // Set data ke form state. Password diisi placeholder
                setFormData({
                    ...data,
                    enable_auto_email: data.enable_auto_email || false,
                    smtp_pass_current: data.smtp_pass 
                });
            } catch (err) {
                setError(err.message);
                showAlert(`Error loading settings: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handlePasswordChange = (e) => {
        setNewPassword(e.target.value);
    };

    // 2. Handle Submit (POST /api/settings)
    const handleSubmit = async (e) => {
        e.preventDefault();
        showAlert('Saving configuration...', 'info');
        
        // Data yang akan dikirim ke backend
        const dataToSend = {
            ...formData,
            smtp_pass: newPassword || formData.smtp_pass_current,
            smtp_pass_new: newPassword,
            smtp_pass_current: formData.smtp_pass_current 
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend),
            });
            
            if (!res.ok) throw new Error('Failed to save settings.');
            
            const result = await res.json();
            showAlert(result.message || 'Configuration saved successfully!', 'success');
            
            setNewPassword(''); 
            setIsEditing(false);
            
        } catch (err) {
            showAlert(`Error saving: ${err.message}`, 'error');
        }
    };

    const [template, setTemplate] = useState({
        subject_template: '',
        body_template: ''
    });

    useEffect(() => {
        const fetchTemplate = async () => {
            try {
            const res = await fetch('/api/email-template/ppe-violation');
            if (res.ok) {
                const data = await res.json();
                setTemplate({
                subject_template: data.subject_template || '',
                body_template: data.body_template || ''
                });
            }
            } catch (err) {
            console.error("Failed to load email template:", err);
            }
        };
        fetchTemplate();
    }, []);

    if (loading) return <p className="text-gray-600 p-6 bg-white shadow rounded-lg text-center">Loading configuration...</p>;
    if (error) return <p className="text-red-500 p-6 bg-white shadow rounded-lg text-center">Error: {error}</p>;

    return (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-2'>
            <div className="bg-white p-6 rounded-lg shadow-md mb-4">
                {/* --- Tombol Edit/Cancel --- */}
                <div className="flex justify-end mb-4">
                    {isEditing ? (
                        <RoleButton
                            allowedRoles={['super_admin']} 
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
                        >
                            Cancel Edit
                        </RoleButton>
                    ) : (
                        <RoleButton
                            allowedRoles={['super_admin']} 
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition"
                        >
                            Edit Configuration
                        </RoleButton>
                    )}
                </div>

                <h3 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">SMTP Server Configuration</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Bagian Kredensial SMTP */}
                    <fieldset disabled={!isEditing} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">SMTP Host (e.g., smtp.gmail.com)</label>
                                <input
                                    type="text"
                                    name="smtp_host"
                                    value={formData.smtp_host}
                                    onChange={handleChange}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:bg-gray-100"
                                    required
                                    disabled={!isEditing} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">SMTP Port (e.g., 587 or 465)</label>
                                <input
                                    type="number"
                                    name="smtp_port"
                                    value={formData.smtp_port}
                                    onChange={handleChange}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:bg-gray-100"
                                    required
                                    disabled={!isEditing} 
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Sender Email (Username)</label>
                            <input
                                type="email"
                                name="smtp_user"
                                value={formData.smtp_user}
                                onChange={handleChange}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:bg-gray-100"
                                required
                                disabled={!isEditing} 
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email 'From' Address</label>
                            <input
                                type="email"
                                name="smtp_from"
                                value={formData.smtp_from}
                                onChange={handleChange}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:bg-gray-100"
                                required
                                disabled={!isEditing} 
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">SMTP Password (App Password)</label>
                            <input
                                type="password"
                                placeholder={isEditing ? "Leave blank to keep existing password" : formData.smtp_pass_current}
                                value={newPassword}
                                onChange={handlePasswordChange}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                disabled={!isEditing} 
                            />
                            <p className="mt-1 text-xs text-gray-500">Only fill this if you want to change the password.</p>
                        </div>

                        {/* Bagian Toggle Notifikasi Otomatis */}
                        <div className="flex items-center justify-between border-t pt-4">
                            <span className="text-base font-medium text-gray-700">Enable Automatic Violation Email</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="enable_auto_email"
                                    checked={formData.enable_auto_email}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                    disabled={!isEditing} 
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                            </label>
                        </div>
                    </fieldset>
                    
                    <div className="pt-4">
                        <RoleButton
                            allowedRoles={['super_admin']} 
                            type="submit"
                            disabled={!isEditing} 
                            className={`w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition ${!isEditing ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                        >
                            Save Email Configuration
                        </RoleButton>
                    </div>
                </form>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md mb-4">
                <h3 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">
                    Email Template Configuration – PPE Violation
                </h3>

                {/* Tombol Tag */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {[
                    {l: "Full Name", v: "${full_name}"},
                    {l: "Violation Type", v: "${violation_name}"},
                    {l: "CCTV Name", v: "${cctv_name}"},
                    {l: "CCTV Location", v: "${location}"},
                    {l: "Time of Incident", v: "${timestamp}"}
                    ].map(t => (
                    <button
                        key={t.v}
                        type="button"
                        onClick={() => insertAtCursor('body', t.v)}
                        className="px-3 py-1 text-xs bg-indigo-100 text-indigo-800 rounded-full hover:bg-indigo-200 transition"
                        disabled={!isEditing}
                    >
                        {t.l}
                    </button>
                    ))}
                </div>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Template
                    </label>
                    <input
                        type="text"
                        value={template.subject_template}
                        onChange={(e) => setTemplate(prev => ({...prev, subject_template: e.target.value}))}
                        className="w-full px-4 py-2 border rounded-lg"
                        disabled={!isEditing}
                        placeholder="[URGENT] PPE Violation: {violation_name} at {cctv_name}"
                    />
                </div>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Body Template
                    </label>
                    <textarea
                        rows="20"
                        value={template.body_template || ''}
                        onChange={(e) => setTemplate(prev => ({...prev, body_template: e.target.value}))}
                        className="w-full font-mono text-sm p-4 border rounded-lg bg-gray-50"
                        disabled={!isEditing}
                        placeholder="Paste or edit HTML template here..."
                    />
                </div>
            </div>
        </div>
        
    );
};

export default SetupEmail;