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

// Fungsi insert tag (di luar, agar reusable)
const insertAtCursor = (setTemplate, field, text) => {
  setTemplate(prev => ({
    ...prev,
    [field]: (prev[field] || '') + text
  }));
};

const SetupEmail = () => {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState(initialFormData);
    const [formDataOriginal, setFormDataOriginal] = useState(null); 
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isEditingSMTP, setIsEditingSMTP] = useState(false); 
    const [isEditingTemplate, setIsEditingTemplate] = useState(false); 
    const [newPassword, setNewPassword] = useState('');
    const [template, setTemplate] = useState({
        subject_template: '',
        body_template: ''
    });
    const [templateOriginal, setTemplateOriginal] = useState(null);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [savingSMTP, setSavingSMTP] = useState(false); // NEW: Loading state per section

    // Fetch SMTP settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                if (!res.ok) throw new Error('Failed to fetch settings.');
                const data = await res.json();
                const formattedData = {
                    ...data,
                    enable_auto_email: data.enable_auto_email || false,
                    smtp_pass_current: data.smtp_pass 
                };
                setFormData(formattedData);
                setFormDataOriginal(formattedData); // Snapshot awal untuk SMTP
            } catch (err) {
                setError(err.message);
                showAlert(`Error loading settings: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    // Fetch Template
    useEffect(() => {
        const fetchTemplate = async () => {
            try {
                const res = await fetch('/api/email-template/ppe-violation');
                if (res.ok) {
                    const data = await res.json();
                    const formattedTemplate = {
                        subject_template: data.subject_template || '',
                        body_template: data.body_template || ''
                    };
                    setTemplate(formattedTemplate);
                    setTemplateOriginal(formattedTemplate);
                }
            } catch (err) {
                console.error("Failed to load email template:", err);
                showAlert("Failed to load email template", "error");
            }
        };
        fetchTemplate();
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

    // Handle Submit SMTP (POST /api/settings)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (savingSMTP) return;
        setSavingSMTP(true);
        showAlert('Saving SMTP configuration...', 'info');
        
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
            showAlert(result.message || 'SMTP configuration saved successfully!', 'success');
            
            setNewPassword(''); 
            setFormDataOriginal({ ...formData }); // Update snapshot
            setIsEditingSMTP(false);
            
        } catch (err) {
            showAlert(`Error saving SMTP: ${err.message}`, 'error');
        } finally {
            setSavingSMTP(false);
        }
    };

    // Handle Save Template
    const handleSaveTemplate = async () => {
        if (savingTemplate) return;
        setSavingTemplate(true);

        try {
            const res = await fetch('/api/email-template/ppe-violation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject_template: template.subject_template,
                    body_template: template.body_template
                })
            });

            if (!res.ok) throw new Error('Failed to save email template');

            const result = await res.json();
            showAlert('Email template saved successfully!', 'success');
            setTemplateOriginal({ ...template });
            setIsEditingTemplate(false);
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
        } finally {
            setSavingTemplate(false);
        }
    };

    // Deteksi perubahan
    const hasSMTPChanged = JSON.stringify(formData) !== JSON.stringify(formDataOriginal || {}) || newPassword !== '';
    const hasTemplateChanged = JSON.stringify(template) !== JSON.stringify(templateOriginal || {});

    if (loading) return <p className="text-gray-600 p-6 bg-white shadow rounded-lg text-center">Loading configuration...</p>;
    if (error) return <p className="text-red-500 p-6 bg-white shadow rounded-lg text-center">Error: {error}</p>;

    return (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* === KIRI: SMTP CONFIG === */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className='flex justify-between items-center mb-4 border-b pb-2'>
                    <h3 className="text-xl font-semibold text-gray-700">SMTP Server</h3>
                </div>
                
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4"> 
                    <fieldset disabled={!isEditingSMTP} className="space-y-4">
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
                                    disabled={!isEditingSMTP} 
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
                                    disabled={!isEditingSMTP} 
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
                                disabled={!isEditingSMTP} 
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
                                disabled={!isEditingSMTP} 
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">SMTP Password (App Password)</label>
                            <input
                                type="password"
                                placeholder={isEditingSMTP ? "Leave blank to keep existing password" : formData.smtp_pass_current}
                                value={newPassword}
                                onChange={handlePasswordChange}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                disabled={!isEditingSMTP} 
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
                                    disabled={!isEditingSMTP} 
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                            </label>
                        </div>
                    </fieldset>

                    <div className="pt-4">
                        {isEditingSMTP ? (
                            <div className='flex gap-2'> 
                                <button
                                    onClick={() => {
                                        setFormData(formDataOriginal || initialFormData);
                                        setNewPassword('');
                                        setIsEditingSMTP(false);
                                    }}
                                    className="w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition bg-gray-200 border-gray-300 hover:bg-gray-100"
                                    disabled={savingSMTP}
                                >
                                    Cancel
                                </button>
                                <RoleButton
                                    allowedRoles={['super_admin']} 
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!hasSMTPChanged || savingSMTP}
                                    className={`w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition text-white ${
                                        hasSMTPChanged && !savingSMTP
                                            ? 'bg-indigo-600 hover:bg-indigo-700'
                                            : 'bg-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    {savingSMTP ? 'Saving...' : 'Save SMTP'}
                                </RoleButton>
                            </div>
                        ) : (
                            <RoleButton
                                allowedRoles={['super_admin']} 
                                type="button"
                                onClick={() => setIsEditingSMTP(true)}
                                className="w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition text-white bg-green-600 hover:bg-green-700"
                            >
                                Edit SMTP
                            </RoleButton>
                        )}
                    </div>
                </form>
            </div>

            {/* === KANAN: TEMPLATE EMAIL === */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-semibold text-gray-700">
                        Email Template
                    </h3>
                </div>

                {/* Tag Buttons */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {[
                        { l: "Full Name", v: "${full_name}" },
                        { l: "Violation Type", v: "${violation_name}" },
                        { l: "CCTV Name", v: "${cctv_name}" },
                        { l: "CCTV Location", v: "${location}" },
                        { l: "Time of Incident", v: "${timestamp}" },
                        { l: "Violation ID", v: "${violation_id}" }
                    ].map(t => (
                        <button
                            key={t.v}
                            type="button"
                            onClick={() => insertAtCursor(setTemplate, 'body_template', t.v)}
                            disabled={!isEditingTemplate}
                            className="px-4 py-1.5 text-xs bg-indigo-100 text-indigo-800 rounded-full hover:bg-indigo-200 transition"
                        >
                            {t.l}
                        </button>
                    ))}
                </div>

                {/* Subject */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Template
                    </label>
                    <input
                        type="text"
                        value={template.subject_template}
                        onChange={e => setTemplate(prev => ({ ...prev, subject_template: e.target.value }))}
                        disabled={!isEditingTemplate}
                        className="w-full px-4 py-2 border rounded-lg disabled:bg-gray-50"
                        placeholder="[URGENT] PPE Violation: ${violation_name} at ${location}"
                    />
                </div>

                {/* Body */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Body Template (HTML)
                    </label>
                    <textarea
                        rows="22"
                        value={template.body_template}
                        onChange={e => setTemplate(prev => ({ ...prev, body_template: e.target.value }))}
                        disabled={!isEditingTemplate}
                        className="w-full font-mono text-sm p-4 border rounded-lg bg-gray-50 disabled:bg-gray-100"
                        placeholder="Paste atau edit HTML template di sini..."
                    />
                </div>

                <div className="pt-4">
                    {isEditingTemplate ? (
                        <div className='flex gap-2'>
                            <button
                                onClick={() => {
                                    setTemplate(templateOriginal || { subject_template: '', body_template: '' });
                                    setIsEditingTemplate(false);
                                }}
                                className="w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition bg-gray-200 border-gray-300 hover:bg-gray-100"
                                disabled={savingTemplate}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveTemplate}
                                disabled={!hasTemplateChanged || savingTemplate}
                                className={`w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium  text-white transition ${
                                    hasTemplateChanged && !savingTemplate
                                        ? 'bg-indigo-600 hover:bg-indigo-700'
                                        : 'bg-gray-400 cursor-not-allowed'
                                }`}
                            >
                                {savingTemplate ? 'Saving...' : 'Save Template'}
                            </button>
                        </div>
                    ) : (
                        <RoleButton
                            allowedRoles={['super_admin']}
                            type="button"
                            onClick={() => setIsEditingTemplate(true)}
                            className="w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition text-white bg-green-600 hover:bg-green-700"
                        >
                            Edit Template
                        </RoleButton>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SetupEmail;