// src/components/SetupConfig.jsx
import React, { useState, useEffect } from 'react';
import { useAlert } from './AlertProvider';
import RoleButton from './RoleButton';

const SetupConfig = () => {
    const { showAlert } = useAlert();
    const [settings, setSettings] = useState([]);
    const [originalSettings, setOriginalSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const hasChanges = settings.some((current, index) => {
        const original = originalSettings[index];
        if (!original) return true;
        return current.value !== original.value;
    });

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/detection-settings');
            if (!res.ok) throw new Error('Failed to fetch settings');
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
            setOriginalSettings(JSON.parse(JSON.stringify(settings)));
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
            setIsEditing(false);
        }
    };

    const formatLabel = (key) => key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const groups = {
        'Detection Accuracy': ['confidence_threshold', 'frame_skip', 'queue_size'],
        'Violation Timing': ['cleanup_interval', 'cooldown_seconds'],
        'Image Processing': ['padding_percent', 'target_max_width']
    };

    const getSetting = (key) => settings.find(s => s.key === key) || {};
    const getValue = (key) => getSetting(key).value ?? 0;

    const updateValue = (key, value) => {
        const numValue = parseFloat(value) || 0;
        setSettings(prev => prev.map(s =>
            s.key === key ? { ...s, value: numValue } : s
        ));
    };

    const PillGroup = ({ options, current, onChange, unit = '' }) => (
        <div className="flex flex-wrap gap-2">
            {options.map(val => (
                <button
                    key={val}
                    onClick={() => onChange(val)}
                    disabled={!isEditing}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                        current === val
                            ? 'bg-indigo-600 text-white shadow-md'
                            : isEditing
                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                : 'bg-gray-100 text-gray-500'
                    } ${!isEditing ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {val}{unit}
                </button>
            ))}
        </div>
    );

    const renderControl = (key) => {
        const s = getSetting(key);
        const val = getValue(key);
        const disabled = !isEditing;

        // Confidence Threshold – Enhanced slider dengan step 0.05 + marker
        if (key === 'confidence_threshold') {
            return (
                <div className="space-y-3">
                    <div className="flex items-center gap-4">
                        <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={val}
                            disabled={disabled}
                            onChange={(e) => updateValue(key, e.target.value)}
                            className={`w-full h-3 bg-gray-300 rounded-lg appearance-none cursor-pointer slider-thumb ${
                                disabled ? 'opacity-60' : ''
                            }`}
                            style={{
                                background: disabled 
                                    ? undefined
                                    : `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${((val - 0.1) / 0.9) * 100}%, #e5e7eb ${((val - 0.1) / 0.9) * 100}%, #e5e7eb 100%)`
                            }}
                        />
                        <span className={`w-16 text-right font-bold text-lg ${disabled ? 'text-gray-500' : 'text-indigo-600'}`}>
                            {parseFloat(val).toFixed(2)}
                        </span>
                    </div>
                </div>
            );
        }

        // Cleanup Interval – Pills
        const cleanupOptions = [30, 60, 120, 180, 300, 600, 1800];
        if (key === 'cleanup_interval') {
            return <PillGroup options={cleanupOptions} current={val} onChange={(v) => updateValue(key, v)} unit="s" />;
        }

        // Cooldown Seconds – Pills
        const cooldownOptions = [5, 10, 15, 20, 30, 60];
        if (key === 'cooldown_seconds') {
            return <PillGroup options={cooldownOptions} current={val} onChange={(v) => updateValue(key, v)} unit="s" />;
        }

        // Default number inputs (frame_skip, queue_size, padding_percent, target_max_width)
        const stepMap = {
            padding_percent: 0.05,
            target_max_width: 50,
            frame_skip: 1,
            queue_size: 1
        };

        return (
            <input
                type="number"
                step={stepMap[key] || 1}
                min={s.min_value}
                max={s.max_value}
                value={val}
                disabled={disabled}
                onChange={(e) => updateValue(key, e.target.value)}
                className={`w-full max-w-32 p-2 text-center font-medium rounded-lg border-2 transition ${
                    disabled
                        ? 'bg-gray-50 border-gray-300 text-gray-500'
                        : 'border-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                }`}
            />
        );
    };

    return (
        <div className="max-w-4xl sm:mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200">
                    <h3 className="p-4 text-xl font-bold text-gray-800">Detection System Settings</h3>
                </div>

                {loading ? (
                    <p className="text-center py-8 text-gray-600">Loading detection settings...</p>
                ) : (
                    <>
                        {/* Field */}
                        <div className="p-4 sm:p-6 space-y-8">
                            {Object.entries(groups).map(([groupName, keys]) => (
                                <section key={groupName}>
                                    <h4 className="text-lg font-semibold text-gray-700 mb-5 pb-2 border-b border-gray-100">
                                        {groupName}
                                    </h4>

                                    <div className="space-y-8">
                                        {keys.map(key => {
                                            const s = getSetting(key);
                                            return (
                                                <div key={key} className="grid sm:grid-cols-3 gap-4 items-start">
                                                    <div className="sm:col-span-1">
                                                        <label className="block text-sm font-medium text-gray-900">
                                                            {formatLabel(key)}
                                                        </label>
                                                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                                                            {s.description}
                                                        </p>
                                                    </div>
                                                    <div className="sm:col-span-2">
                                                        {renderControl(key)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* Banner */}
                        <div className="mx-6 sm:mx-8 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <p className="text-sm font-medium text-amber-800 text-center">
                                All changes take effect immediately – no restart needed
                            </p>
                        </div>

                        {/* Edit/save button */}
                        <div className="px-6 sm:px-8 py-6 bg-gray-50 border-t border-gray-200">
                            {isEditing ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => {
                                            setSettings(JSON.parse(JSON.stringify(originalSettings)));
                                            setIsEditing(false);
                                        }}
                                        disabled={saving}
                                        className="py-3 px-4 rounded-lg font-medium bg-gray-200 hover:bg-gray-300 transition"
                                    >
                                        Cancel
                                    </button>
                                    <RoleButton
                                        allowedRoles={['super_admin']}
                                        onClick={handleSave}
                                        disabled={saving || !hasChanges}
                                        className={`py-3 px-4 rounded-lg font-medium text-white transition ${
                                            saving || !hasChanges
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </RoleButton>
                                </div>
                            ) : (
                                <RoleButton
                                    allowedRoles={['super_admin']}
                                    onClick={() => {
                                        setOriginalSettings(JSON.parse(JSON.stringify(settings)));
                                        setIsEditing(true);
                                    }}
                                    className="w-full py-3 px-6 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition"
                                >
                                    Edit Settings
                                </RoleButton>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SetupConfig;