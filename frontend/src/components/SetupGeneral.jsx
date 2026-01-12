// src/components/SetupGeneral.jsx
import React, { useState, useEffect } from 'react';
import { useAlert } from './AlertProvider';
import RoleButton from './RoleButton';

const SetupGeneral = () => {
    const { showAlert } = useAlert();
    const [loading, setLoading] = useState(true);

    const [detectionSettings, setDetectionSettings] = useState([]);
    const [originalDetection, setOriginalDetection] = useState([]);

    const [schedulerSettings, setSchedulerSettings] = useState([]);
    const [originalScheduler, setOriginalScheduler] = useState([]);

    const [isEditingDetection, setIsEditingDetection] = useState(false);
    const [isEditingScheduler, setIsEditingScheduler] = useState(false);

    const [savingDetection, setSavingDetection] = useState(false);
    const [savingScheduler, setSavingScheduler] = useState(false);

    const detectionHasChanges = detectionSettings.some((current, index) => {
        const original = originalDetection[index];
        if (!original) return true;
        return current.value !== original.value;
    });

    const schedulerHasChanges = schedulerSettings.some((current, index) => {
        const original = originalScheduler[index];
        if (!original) return true;
        return current.value !== original.value;
    });

    const fetchSettings = async () => {
        try {
            // Fetch Detection Settings
            const resDet = await fetch('/api/detection-settings');
            const dataDet = await resDet.json();
            setDetectionSettings(dataDet);
            setOriginalDetection(JSON.parse(JSON.stringify(dataDet)));

            // Fetch Scheduler Settings
            const resSched = await fetch('/api/scheduler-settings');
            const dataSched = await resSched.json();
            setSchedulerSettings(dataSched);
            setOriginalScheduler(JSON.parse(JSON.stringify(dataSched)));

            setLoading(false);
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const formatLabel = (key) => key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Detection Handlers
    const handleSaveDetection = async () => {
        setSavingDetection(true);
        try {
            const res = await fetch('/api/detection-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(detectionSettings)
            });
            if (!res.ok) throw new Error('Failed to save');
            showAlert('Settings successfully saved & active immediately!', 'success');
            setOriginalDetection(JSON.parse(JSON.stringify(detectionSettings)));
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
        } finally {
            setSavingDetection(false);
            setIsEditingDetection(false);
        }
    };

    const detectionGroups = {
        'Detection Accuracy': ['confidence_threshold', 'frame_skip', 'queue_size'],
        'Violation Timing': ['cleanup_interval', 'cooldown_seconds'],
        'Image Processing': ['padding_percent', 'target_max_width']
    };

    const getDetectionSetting = (key) => detectionSettings.find(s => s.key === key) || {};
    const getDetectionValue = (key) => getDetectionSetting(key).value ?? 0;

    const updateValueDetection = (key, value) => {
        const numValue = parseFloat(value) || 0;
        setDetectionSettings(prev => prev.map(s =>
            s.key === key ? { ...s, value: numValue } : s
        ));
    };

    const PillGroup = ({ options, current, onChange, unit = '' }) => (
        <div className="flex flex-wrap gap-2">
            {options.map(val => {
                const isSelected = parseFloat(current) === parseFloat(val); 
                
                return (
                    <button
                        key={val}
                        onClick={() => onChange(val)}
                        disabled={!isEditingDetection}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                            isSelected
                                ? isEditingDetection
                                    ? 'bg-indigo-600 text-white shadow-md' 
                                    : 'bg-gray-400 text-white' 
                                : isEditingDetection
                                    ? 'bg-gray-200 text-gray-600' 
                                    : 'bg-gray-100 text-gray-400'
                        } ${!isEditingDetection ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {val}{unit}
                    </button>
                );
            })}
        </div>
    );

    const renderDetectionControl = (key) => {
        const s = getDetectionSetting(key);
        const val = getDetectionValue(key);
        const disabled = !isEditingDetection;

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
                            onChange={(e) => updateValueDetection(key, e.target.value)}
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
            return <PillGroup options={cleanupOptions} current={val} onChange={(v) => updateValueDetection(key, v)} unit="s" />;
        }

        // Cooldown Seconds – Pills
        const cooldownOptions = [1, 3, 5, 10, 15, 20, 30, 60];
        if (key === 'cooldown_seconds') {
            return <PillGroup options={cooldownOptions} current={val} onChange={(v) => updateValueDetection(key, v)} unit="s" />;
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
                onChange={(e) => updateValueDetection(key, e.target.value)}
                className={`w-full max-w-32 p-2 text-center font-medium rounded-lg border-2 transition ${
                    disabled
                        ? 'bg-gray-50 border-gray-300 text-gray-500'
                        : 'border-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                }`}
            />
        );
    };

    // Scheduler Handlers
    const updateSchedulerValue = (key, value) => {
        const numValue = parseFloat(value) || 0;
        setSchedulerSettings(prev => prev.map(s =>
            s.key === key ? { ...s, value: numValue } : s
        ));
    };

    const handleSaveScheduler = async () => {
        setSavingScheduler(true);
        try {
            const res = await fetch('/api/scheduler-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schedulerSettings)
            });
            if (!res.ok) throw new Error('Failed to save scheduler settings');
            showAlert('Scheduler configuration updated!', 'success');
            setOriginalScheduler(JSON.parse(JSON.stringify(schedulerSettings)));
            setIsEditingScheduler(false);
        } catch (err) {
            showAlert('Error: ' + err.message, 'error');
        } finally {
            setSavingScheduler(false);
        }
    };

    const schedulerGroups = {
        'Automation Timing': [
            'sched_daily_recap_minute', 
            'sched_refresh_config_interval'
        ],
        'Weekly Report Schedule': [
            'sched_weekly_day', 
            'weekly_time'      
        ],
        'Monthly Report Schedule': [
            'sched_monthly_date', 
            'monthly_time'      
        ],
        'System Maintenance': [
            'sched_cleanup_cutoff_days',
            'cleanup_time'      
        ]
    };

    const renderSchedulerControl = (groupKey) => {
        const disabled = !isEditingScheduler;

        // A. LOGIKA TIME PICKER (JAM : MENIT)
        if (['weekly_time', 'monthly_time', 'cleanup_time'].includes(groupKey)) {
            const prefix = groupKey.split('_')[0]; // weekly, monthly, atau cleanup
            const hKey = `sched_${prefix}_hour`;
            const mKey = `sched_${prefix}_minute`;
            
            const hSetting = schedulerSettings.find(s => s.key === hKey) || { value: 0 };
            const mSetting = schedulerSettings.find(s => s.key === mKey) || { value: 0 };

            return (
                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border-2 border-gray-300 w-fit">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase font-bold text-gray-400">Hour</span>
                        <input
                            type="number" min="0" max="23"
                            value={hSetting.value}
                            disabled={disabled}
                            onChange={(e) => updateSchedulerValue(hKey, e.target.value)}
                            className={`w-14 p-1 text-center font-bold rounded-md transition ${
                                disabled 
                                    ? 'bg-transparent border-none' 
                                    : 'border-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'}
                                `}
                        />
                    </div>
                    <span className="text-xl font-bold text-gray-300">:</span>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase font-bold text-gray-400">Min</span>
                        <input
                            type="number" min="0" max="59"
                            value={mSetting.value}
                            disabled={disabled}
                            onChange={(e) => updateSchedulerValue(mKey, e.target.value)}
                            className={`w-14 p-1 text-center font-bold rounded-md transition ${
                                disabled 
                                    ? 'bg-transparent border-none' 
                                    : 'border-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'}
                                `}
                        />
                    </div>
                </div>
            );
        }

        // B. LOGIKA DROPDOWN HARI (WEEKLY)
        if (groupKey === 'sched_weekly_day') {
            const s = schedulerSettings.find(item => item.key === groupKey) || { value: 0 };
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            return (
                <select
                    value={s.value}
                    disabled={disabled}
                    onChange={(e) => updateSchedulerValue(groupKey, e.target.value)}
                    className={`w-full max-w-32 p-2 text-center font-medium rounded-lg border-2 transition ${
                        disabled 
                            ? 'bg-gray-50 border-gray-300 text-gray-500' 
                            : 'border-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'}
                        `}
                >
                    {days.map((day, idx) => <option key={idx} value={idx}>{day}</option>)}
                </select>
            );
        }

        // C. LOGIKA DEFAULT NUMBER (INTERVAL, DATE, CUTOFF)
        const s = schedulerSettings.find(item => item.key === groupKey) || {};
        return (
            <div className="flex items-center gap-3">
                <input
                    type="number"
                    min={s.min_value} max={s.max_value}
                    value={s.value ?? 0}
                    disabled={disabled}
                    onChange={(e) => updateSchedulerValue(s.key, e.target.value)}
                    className={`w-full max-w-32 p-2 text-center font-medium rounded-lg border-2 transition ${
                        disabled 
                            ? 'bg-gray-50 border-gray-300 text-gray-500' 
                            : 'border-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'}
                        `}
                />
                <span className="text-sm text-gray-500">
                    {s.key?.includes('date') ? 'Date of month' : s.key?.includes('cutoff') ? 'Days' : 'Minutes'}
                </span>
            </div>
        );
    };

    // General Skeleton for Scheduler Loading State
    const GeneralSkeleton = () => (
        <div className='bg-white border border-gray-200 overflow-hidden p-6'>
            <div className="animate-pulse space-y-8">
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-10" />
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="grid sm:grid-cols-2 gap-4 items-start">
                        <div className="space-y-3">
                            <div className="h-4 bg-gray-200 rounded w-3/4" />
                            <div className="h-3 bg-gray-100 rounded w-full" />
                        </div>
                        <div className="h-10 bg-gray-200 rounded-lg w-full" />
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4'>
            <div className='bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-md'>
                <div className="border-b border-gray-200">
                    <h3 className="p-4 text-xl font-bold text-gray-800">Detection System Settings</h3>
                </div>

                {loading ? (
                    <GeneralSkeleton />
                ) : (
                    <>
                        {/* Field */}
                        <div className="p-4 sm:p-6 space-y-6">
                            {Object.entries(detectionGroups).map(([groupName, keys]) => (
                                <section key={groupName}>
                                    <h4 className="text-lg font-semibold text-gray-700 mb-5 pb-2 border-b border-gray-100">
                                        {groupName}
                                    </h4>

                                    <div className="space-y-8">
                                        {keys.map(key => {
                                            const s = getDetectionSetting(key);
                                            return (
                                                <div key={key} className="grid sm:grid-cols-2 gap-4 items-start">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-900">
                                                            {formatLabel(key)}
                                                        </label>
                                                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                                                            {s.description}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        {renderDetectionControl(key)}
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
                            {isEditingDetection ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => {
                                            setDetectionSettings(JSON.parse(JSON.stringify(originalDetection)));
                                            setIsEditingDetection(false);
                                        }}
                                        disabled={savingDetection}
                                        className="py-3 px-4 rounded-lg font-medium bg-gray-200 hover:bg-gray-300 transition"
                                    >
                                        Cancel
                                    </button>
                                    <RoleButton
                                        allowedRoles={['super_admin']}
                                        onClick={handleSaveDetection}
                                        disabled={savingDetection || !detectionHasChanges}
                                        className={`py-3 px-4 rounded-lg font-medium text-white transition ${
                                            savingDetection || !detectionHasChanges
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {savingDetection ? 'Saving...' : 'Save Changes'}
                                    </RoleButton>
                                </div>
                            ) : (
                                <RoleButton
                                    allowedRoles={['super_admin']}
                                    onClick={() => {
                                        setOriginalDetection(JSON.parse(JSON.stringify(detectionSettings)));
                                        setIsEditingDetection(true);
                                    }}
                                    className="w-full py-3 px-6 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition"
                                >
                                    Edit Detection
                                </RoleButton>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className='bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-md'>
                <div className="border-b border-gray-200">
                    <h3 className="p-4 text-xl font-bold text-gray-800">Scheduler System Settings</h3>
                </div>
                {loading ? (
                    <GeneralSkeleton />
                ) : (
                    <>
                        {/* Field */}
                        <div className="p-4 sm:p-6 space-y-6">
                            {Object.entries(schedulerGroups).map(([groupName, keys]) => (
                                <div key={groupName}>
                                    <h4 className="text-lg font-semibold text-gray-700 mb-5 pb-2 border-b border-gray-100">{groupName}</h4>
                                    <div className="space-y-8">
                                        {keys.map(key => {
                                            // Cari data untuk label/deskripsi
                                            const displayKey = key.includes('time') ? `sched_${key.split('_')[0]}_hour` : key;
                                            const s = schedulerSettings.find(item => item.key === displayKey) || {};
                                            
                                            return (
                                                <div key={key} className="grid sm:grid-cols-2 gap-4 items-center">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-900">
                                                            {key.includes('time') ? 'Execution Time' : formatLabel(key.replace('sched_', ''))}
                                                        </label>
                                                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                                                            {key.includes('time') ? '': s.description}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        {renderSchedulerControl(key)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
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
                            {isEditingScheduler ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => {
                                            setSchedulerSettings(JSON.parse(JSON.stringify(originalScheduler)));
                                            setIsEditingScheduler(false);
                                        }}
                                        className="py-3 px-4 bg-gray-200 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <RoleButton
                                        allowedRoles={['super_admin']}
                                        onClick={handleSaveScheduler}
                                        disabled={savingScheduler || !schedulerHasChanges}
                                        className={`py-3 px-4 rounded-lg font-medium text-white transition ${
                                            savingScheduler || !schedulerHasChanges
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {savingScheduler ? 'Saving...' : 'Save Changes'}
                                    </RoleButton>
                                </div>
                            ) : (
                                <RoleButton
                                    allowedRoles={['super_admin']}
                                    onClick={() => {
                                        setOriginalScheduler(JSON.parse(JSON.stringify(schedulerSettings)));
                                        setIsEditingScheduler(true);
                                    }}
                                    className="w-full py-3 px-6 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition"
                                >
                                    Edit Scheduler
                                </RoleButton>
                                
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SetupGeneral;