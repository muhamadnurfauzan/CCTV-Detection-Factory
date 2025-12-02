// src/components/SetupConfig.jsx
import React, { useState, useEffect } from 'react';
import { useAlert } from './AlertProvider';
import RoleButton from './RoleButton';

const SetupConfig = () => {
    const { showAlert } = useAlert();
    const [settings, setSettings] = useState([]);
    const [originalSettings, setOriginalSettings] = useState([]); // Backup saat mulai edit
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Cek apakah ada perubahan
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/detection-settings');
            if (!res.ok) throw new Error('Gagal memuat pengaturan');
            const data = await res.json();

            // Konversi semua value jadi number agar aman
            const normalized = data.map(item => ({
                ...item,
                value: parseFloat(item.value) || 0
            }));

            setSettings(normalized);
            setOriginalSettings(JSON.parse(JSON.stringify(normalized))); // Deep copy
            setLoading(false);
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/detection-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (!res.ok) throw new Error('Failed to save');
            showAlert('Settings successfully saved & active immediately!', 'success');
            setOriginalSettings(JSON.parse(JSON.stringify(settings))); // Update backup
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
            setIsEditing(false);
        }
    };

    const updateValue = (key, value) => {
        const numValue = parseFloat(value) || 0;
        setSettings(prev => prev.map(s =>
            s.key === key ? { ...s, value: numValue } : s
        ));
    };

    const formatLabel = (key) => key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const groups = {
        'Detection Accuracy': ['confidence_threshold', 'frame_skip', 'queue_size'],
        'Violation Timing': ['cooldown_seconds', 'cleanup_interval'],
        'Image Processing': ['padding_percent', 'target_max_width']
    };

    const renderInput = (s) => {
        const isDisabled = !isEditing;

        // 1. Confidence Threshold → Slider dengan nilai real-time
        if (s.key === 'confidence_threshold') {
            const val = parseFloat(s.value) || 0.5;

            return (
                <div className="space-y-4">
                    <input
                        type="range"
                        step="0.01"
                        min={s.min_value}
                        max={s.max_value}
                        value={val}
                        onChange={(e) => updateValue(s.key, e.target.value)}
                        disabled={isDisabled}
                        className={`w-full h-3 rounded-lg appearance-none cursor-pointer transition ${
                            isDisabled 
                                ? 'bg-gray-200 accent-gray-400 cursor-not-allowed' 
                                : 'bg-gray-300 accent-indigo-600 hover:accent-indigo-700'
                        }`}
                    />
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-gray-500">0.10</span>
                        <span className={`text-xl font-bold ${isDisabled ? 'text-gray-500' : 'text-indigo-600'}`}>
                            {val.toFixed(2)}
                        </span>
                        <span className="text-gray-500">0.99</span>
                    </div>
                </div>
            );
        }

        // 2. Cleanup Interval → step 30 detik
        if (s.key === 'cleanup_interval') {
            return (
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        step="30"
                        min={s.min_value}
                        max={s.max_value}
                        value={s.value}
                        onChange={(e) => updateValue(s.key, e.target.value)}
                        disabled={isDisabled}
                        className={`w-32 px-4 py-3 text-lg font-mono border-2 rounded-lg transition ${
                            isDisabled
                                ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                                : 'border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                        }`}
                    />
                    <span className="text-gray-600">sec</span>
                </div>
            );
        }

        // 3. Cooldown → step 5 detik
        if (s.key === 'cooldown_seconds') {
            return (
                <input
                    type="number"
                    step="5"
                    min={s.min_value}
                    max={s.max_value}
                    value={s.value}
                    onChange={(e) => updateValue(s.key, e.target.value)}
                    disabled={isDisabled}
                    className={`w-32 px-4 py-3 text-lg font-mono border-2 rounded-lg transition ${
                        isDisabled
                            ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                    }`}
                />
            );
        }

        // 4. Padding Percent → step 0.05
        if (s.key === 'padding_percent') {
            return (
                <input
                    type="number"
                    step="0.05"
                    min={s.min_value}
                    max={s.max_value}
                    value={s.value}
                    onChange={(e) => updateValue(s.key, e.target.value)}
                    disabled={isDisabled}
                    className={`w-32 px-4 py-3 text-lg font-mono border-2 rounded-lg transition ${
                        isDisabled
                            ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                    }`}
                />
            );
        }

        // 5. Target Max Width → step 50
        if (s.key === 'target_max_width') {
            return (
                <input
                    type="number"
                    step="50"
                    min={s.min_value}
                    max={s.max_value}
                    value={s.value}
                    onChange={(e) => updateValue(s.key, e.target.value)}
                    disabled={isDisabled}
                    className={`w-32 px-4 py-3 text-lg font-mono border-2 rounded-lg transition ${
                        isDisabled
                            ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                    }`}
                />
            );
        }

        // Default
        return (
            <input
                type="number"
                step={s.key.includes('threshold') || s.key.includes('percent') ? '0.01' : '1'}
                min={s.min_value}
                max={s.max_value}
                value={s.value}
                onChange={(e) => updateValue(s.key, e.target.value)}
                disabled={isDisabled}
                className={`w-32 px-4 py-3 text-lg font-mono border-2 rounded-lg transition ${
                    isDisabled
                        ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                        : 'border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                }`}
            />
        );
    };

    if (loading) return <div className="text-center p-10 text-gray-600">Loading detection settings...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className='flex justify-between items-center mb-4 border-b pb-2'>
                    <h3 className="text-xl font-semibold text-gray-700">Detection System Settings</h3>
                </div>
                
                {Object.entries(groups).map(([groupName, keys]) => (
                    <div key={groupName} className="mb-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 border-b pb-8 last:border-b-0 last:pb-0">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800 pb-3 inline-block">
                                {groupName}
                            </h3>
                        </div>

                        <div className="col-span-1 sm:col-span-2 space-y-6">
                            {settings
                                .filter(s => keys.includes(s.key))
                                .map(s => (
                                    <div key={s.key} className="bg-gray-50 p-6 rounded-xl border border-gray-200 hover:border-indigo-400 transition-shadow">
                                        <label className="block text-lg font-semibold text-gray-800 mb-3">
                                            {formatLabel(s.key)}
                                        </label>

                                        <div className="mb-4">
                                            {renderInput(s)}
                                        </div>

                                        <p className="text-sm text-gray-600 leading-relaxed">
                                            {s.description}
                                        </p>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                <div className="mt-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 text-center">
                    <p className="text-amber-800 font-medium">
                        All changes are immediately active without restarting the server.
                    </p>
                </div>

                <div className="pt-4">
                    <div className="flex justify-end gap-3">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => {
                                        setSettings(JSON.parse(JSON.stringify(originalSettings)));
                                        setIsEditing(false);
                                    }}
                                    disabled={saving}
                                    className="px-6 py-3 rounded-lg font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <RoleButton
                                    allowedRoles={['super_admin']}
                                    onClick={handleSave}
                                    disabled={saving || !hasChanges}
                                    className={`
                                        px-8 py-3 rounded-lg font-medium text-white shadow-lg transition
                                        ${saving || !hasChanges
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700'
                                        }
                                    `}
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </RoleButton>
                            </>
                        ) : (
                            <RoleButton
                                allowedRoles={['super_admin']}
                                onClick={() => {
                                    setOriginalSettings(JSON.parse(JSON.stringify(settings)));
                                    setIsEditing(true);
                                }}
                                className="w-full py-2 px-4 rounded-md shadow-sm text-sm font-medium transition text-white bg-green-600 hover:bg-green-700"
                            >
                                Edit Settings
                            </RoleButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SetupConfig;