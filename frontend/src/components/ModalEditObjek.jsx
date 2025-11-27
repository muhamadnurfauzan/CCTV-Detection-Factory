import React, { useMemo, useState } from 'react';
import { FaSave, FaTimes, FaPalette, FaHashtag, FaRulerHorizontal } from 'react-icons/fa';
import RoleButton from './RoleButton';

// --- HELPER CONVERSIONS (Penting) ---
// HSL ke RGB
const hslToRgb = (h, s, l) => {
    s /= 100; l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h >= 0 && h < 60) { r = c; g = x; b = 0; } else if (h >= 60 && h < 120) { r = x; g = c; b = 0; } else if (h >= 120 && h < 180) { r = 0; g = c; b = x; } else if (h >= 180 && h < 240) { r = 0; g = x; b = c; } else if (h >= 240 && h < 300) { r = x; g = 0; b = c; } else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }
    r = Math.round((r + m) * 255); g = Math.round((g + m) * 255); b = Math.round((b + m) * 255);
    return { r, g, b };
};

// RGB ke HEX
const rgbToHex = (r, g, b) => {
    const toHex = (c) => c.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// HEX ke RGB
const hexToRgb = (hex) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16)
    } : null;
};

// RGB ke HSL
const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) { h = s = 0; } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};


const ModalEditObjek = ({ 
    tempEdit, setTempEdit,
    colorH, setColorH, colorS, setColorS, colorL, setColorL,
    handleSave, loading, setIsModalOpen, getAvailablePairs, editingItem 
}) => {
    const [activeColorTab, setActiveColorTab] = useState('hsl');

    // Tampilan warna saat memilih (diperbarui setiap HSL berubah)
    const previewRGB = useMemo(() => hslToRgb(colorH, colorS, colorL), [colorH, colorS, colorL]);
    const previewHEX = useMemo(() => rgbToHex(previewRGB.r, previewRGB.g, previewRGB.b), [previewRGB]);

    // State untuk input manual
    const [hexInput, setHexInput] = useState(previewHEX);
    const [rgbInput, setRgbInput] = useState({ r: previewRGB.r, g: previewRGB.g, b: previewRGB.b });
    const [hexError, setHexError] = useState(null);

    // Sinkronisasi HSL ke Input Manual
    React.useEffect(() => {
        setHexInput(previewHEX);
        setRgbInput({ r: previewRGB.r, g: previewRGB.g, b: previewRGB.b });
    }, [previewHEX, previewRGB]);


    // Handler Input Manual
    const handleManualColorChange = (value, format) => {
        let newRGB = null;
        setHexError(null);

        if (format === 'hex') {
            const rawHex = value.startsWith('#') ? value : `#${value}`;
            setHexInput(rawHex);

            // Cek jika sudah 6 digit HEX (atau 7 karakter termasuk '#')
            if (rawHex.length === 7 || (rawHex.length === 4 && !rawHex.startsWith('#'))) { 
                newRGB = hexToRgb(rawHex);
                if (!newRGB) {
                    setHexError('Invalid HEX code.');
                }
            } else if (rawHex.length < 7 && rawHex.length > 0) {
                 // Hapus error saat sedang mengetik
                 setHexError(null);
            }
        } 
        
        else if (format === 'rgb') {
            const colorKey = Object.keys(value)[0]; // 'r', 'g', atau 'b'
            const rawVal = value[colorKey];
            
            // 1. Baca dan Clamp nilai
            // Pastikan tidak ada karakter non-digit yang menyebabkan bug
            const num = parseInt(rawVal) || 0;
            
            // 2. Batasi nilai antara 0 dan 255 (Clamping)
            const clampedNum = Math.min(255, Math.max(0, num));
            
            // 3. Buat objek RGB yang akan disave dan digunakan untuk HSL
            const finalRGB = { ...rgbInput, [colorKey]: clampedNum };
            
            // 4. Update state input RGB DENGAN NILAI CLAMPED (Ini fix utamanya)
            setRgbInput(finalRGB); 
            
            // 5. Gunakan finalRGB untuk HSL conversion
            newRGB = finalRGB;
        }
        
        if (newRGB) {
            const newHSL = rgbToHsl(newRGB.r, newRGB.g, newRGB.b);
            setColorH(newHSL.h);
            setColorS(newHSL.s);
            setColorL(newHSL.l);
        }
    };
    
    // --- Render Tab Content ---
    const renderColorInput = () => {
        switch (activeColorTab) {
            case 'hsl':
                return (
                    <div className="flex-grow space-y-3">
                        {/* Hue (Warna) */}
                        <div>
                            <span className="text-xs text-gray-500">Hue ({colorH}°)</span>
                            <input
                                type="range" min="0" max="360" value={colorH}
                                onChange={(e) => setColorH(parseInt(e.target.value, 10))}
                                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                style={{ background: `linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)` }}
                            />
                        </div>
                        {/* Saturation (Kepekatan) - Style diperbaiki */}
                        <div>
                            <span className="text-xs text-gray-500">Saturation ({colorS}%)</span>
                            <input
                                type="range" min="0" max="100" value={colorS}
                                onChange={(e) => setColorS(parseInt(e.target.value, 10))}
                                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                // PERBAIKAN STYLE SATURASI: Mulai dari warna abu-abu/putih ke warna murni saat ini
                                style={{ 
                                    background: `linear-gradient(to right, hsl(${colorH}, 0%, ${colorL}%), hsl(${colorH}, 100%, ${colorL}%)` 
                                }}
                            />
                        </div>
                        {/* Lightness (Kecerahan) */}
                        <div>
                            <span className="text-xs text-gray-500">Lightness ({colorL}%)</span>
                            <input
                                type="range" min="0" max="100" value={colorL}
                                onChange={(e) => setColorL(parseInt(e.target.value, 10))}
                                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                style={{ background: `linear-gradient(to right, black, hsl(${colorH}, ${colorS}%, 50%), white)` }}
                            />
                        </div>
                    </div>
                );
            case 'hex':
                return (
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">HEX Code (#RRGGBB)</label>
                        <div className="flex items-center space-x-2">
                            <span className="text-xl font-mono text-gray-600">#</span>
                            <input
                                type="text"
                                className={`font-mono flex-grow rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border uppercase ${hexError ? 'border-red-500' : ''}`}
                                // Memastikan nilai input hanya 6 digit hex
                                value={hexInput.replace('#', '')}
                                onChange={(e) => handleManualColorChange(e.target.value, 'hex')}
                                maxLength={6}
                                onBlur={() => handleManualColorChange(hexInput, 'hex')}
                            />
                        </div>
                        {hexError && <p className="text-xs text-red-600 mt-1">{hexError}</p>}
                    </div>
                );
            case 'rgb':
                return (
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">RGB Values (0-255)</label>
                        <div className="flex items-center space-x-3">
                            {['r', 'g', 'b'].map(color => (
                                <div key={color} className="flex-grow">
                                    <span className="text-xs text-gray-500 uppercase">{color}</span>
                                    <input
                                        type="number"
                                        min="0" max="255"
                                        className="w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border text-center mt-1"
                                        // Gunakan nilai dari state rgbInput (yang sudah di-clamp)
                                        value={rgbInput[color]}
                                        onChange={(e) => handleManualColorChange({ [color]: e.target.value }, 'rgb')}
                                        onBlur={() => handleManualColorChange({ [color]: rgbInput[color] }, 'rgb')} 
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                            The R/G/B value must be between 0 and 255.
                        </p>
                    </div>
                );
            default:
                return null;
        }
    };


    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
                <h3 className="text-xl font-bold mb-4 border-b pb-2">Edit Object Class: {editingItem?.name}</h3>
                
                <div className="space-y-4">
                    {/* 1. Object Name & Is Violation */}
                    <div className="flex space-x-4">
                        <div className="flex-grow">
                            <label className="block text-sm font-medium text-gray-700">Object Name</label>
                            <input
                                type="text"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                value={tempEdit.name}
                                onChange={(e) => setTempEdit({...tempEdit, name: e.target.value})}
                            />
                        </div>
                        <div className="flex items-center mt-6">
                            <input
                                id="is_violation"
                                type="checkbox"
                                className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                checked={tempEdit.is_violation}
                                onChange={(e) => setTempEdit({...tempEdit, is_violation: e.target.checked})}
                            />
                            <label htmlFor="is_violation" className="ml-2 block text-sm text-gray-900">
                                Is Violation?
                            </label>
                        </div>
                    </div>

                    {/* 2. Pairing Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pair Object (Safety/Violation Pair)</label>
                        <select
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                            value={tempEdit.pair_id || ''}
                            onChange={(e) => setTempEdit({...tempEdit, pair_id: e.target.value ? parseInt(e.target.value, 10) : null})}
                        >
                            <option value="">-- No Pair (Clear Pair) --</option>
                            {getAvailablePairs.map(item => (
                                <option key={item.id} value={item.id}>
                                    {item.name} ({item.is_violation ? 'VIOLATION' : 'SAFETY'})
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                            Select a pair. The old pair will be automatically reset.
                        </p>
                    </div>

                    {/* 3. Color Selection Section */}
                    <div className="space-y-3 border-t pt-4">
                        <h4 className="text-lg font-semibold text-gray-800">Color</h4>

                        {/* Tab Navigation */}
                        <div className="flex gap-2 border-b border-gray-200">
                            {[
                                { key: 'hsl', label: 'HSL', icon: FaPalette },
                                { key: 'hex', label: 'HEX', icon: FaHashtag },
                                { key: 'rgb', label: 'RGB', icon: FaRulerHorizontal },
                            ].map(({ key, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setActiveColorTab(key)}
                                    className={`px-3 py-1 font-medium text-sm rounded-t-lg transition flex items-center gap-1 ${
                                        activeColorTab === key
                                            ? 'bg-white text-indigo-600 border border-b-0 border-gray-300 shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <Icon className="w-3 h-3" /> {label}
                                </button>
                            ))}
                        </div>

                        {/* Content & Preview */}
                        <div className="flex items-start space-x-4 p-3 bg-gray-50 rounded-lg border">
                            {/* Color Preview */}
                            <div className="flex flex-col items-center flex-shrink-0">
                                <div 
                                    className="w-16 h-16 rounded-lg shadow-md border mb-1" 
                                    style={{ backgroundColor: `rgb(${previewRGB.r}, ${previewRGB.g}, ${previewRGB.b})` }}
                                ></div>
                                <span className="text-xs font-mono text-gray-700">{previewHEX}</span>
                            </div>
                            
                            <div className="flex-grow">
                                {renderColorInput()}
                            </div>
                        </div>
                    </div>

                </div>

                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        type="button"
                        className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                        onClick={() => setIsModalOpen(false)}
                    >
                        <FaTimes className="mr-2" /> Cancel
                    </button>
                    <RoleButton
                        allowedRoles={['super_admin']}
                        type="button"
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700"
                        onClick={() => handleSave(previewRGB)}
                        disabled={loading || hexError}
                    >
                        <FaSave className="mr-2" /> {loading ? 'Saving...' : 'Save changes'}
                    </RoleButton>
                </div>
            </div>
        </div>
    );
}

export default ModalEditObjek;