import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FaEdit, FaCheckSquare, FaSquare, FaInfoCircle, FaSave, FaTimes } from 'react-icons/fa';
import { useAlert } from './AlertProvider'; 

// --- Helper: Konversi HSL ke RGB ---
const hslToRgb = (h, s, l) => {
    s /= 100;
    l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
        r = c; g = 0; b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return { r, g, b };
};

const SetupDataset = () => {
    const { showAlert } = useAlert(); 
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [tempEdit, setTempEdit] = useState({});
    
    // State untuk Color Picker (HSV/HSL)
    const [colorH, setColorH] = useState(0); 
    const [colorS, setColorS] = useState(100);
    const [colorL, setColorL] = useState(50);

    const API_URL = '/api/object/object_classes';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Failed to fetch data');
            const result = await response.json();
            setData(result);
        } catch (error) {
            showAlert('error', `Gagal memuat data: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleEdit = (item) => {
        setEditingItem(item);
        
        // Simpan nilai RGB asli sebagai default HSL (asumsi, karena konversi RGB->HSL sulit tanpa library)
        setColorH(item.color_r || 0); 
        setColorS(item.color_g || 100);
        setColorL(item.color_b || 50);

        setTempEdit({
            id: item.id,
            name: item.name,
            is_violation: item.is_violation,
            pair_id: item.pair_id,
            old_pair_id: item.pair_id, // Simpan pair_id lama untuk reset
        });
        
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingItem) return;

        // Konversi HSL slider ke RGB untuk disimpan
        const newRGB = hslToRgb(colorH, colorS, colorL);
        // Jika pair_id dipilih adalah ID item itu sendiri, set ke null
        const new_pair_id = tempEdit.pair_id === editingItem.id ? null : tempEdit.pair_id;
        
        const payload = {
            name: tempEdit.name,
            is_violation: tempEdit.is_violation,
            color_r: newRGB.r,
            color_g: newRGB.g,
            color_b: newRGB.b,
            new_pair_id: new_pair_id,
            old_pair_id: tempEdit.old_pair_id,
        };

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/${editingItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error('Gagal memperbarui data.');

            showAlert('success', 'Data Object Class berhasil diperbarui! Mohon refresh cache jika diperlukan.');
            await fetchData();
            setIsModalOpen(false);
        } catch (error) {
            showAlert('error', `Gagal menyimpan: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Pairing Logic Helper ---
    const getPairName = (pairId) => {
        const pairedItem = data.find(item => item.id === pairId);
        return pairedItem ? pairedItem.name : '-';
    };

    const getAvailablePairs = useMemo(() => {
        if (!editingItem) return [];

        // Filter item yang:
        // 1. Bukan item yang sedang diedit (id != editingItem.id)
        // 2. Belum memiliki pasangan (pair_id IS NULL)
        // 3. Adalah pasangan lama yang mungkin akan di-reset (pair_id == editingItem.id)
        
        return data.filter(item => 
            item.id !== editingItem.id && 
            (item.pair_id === null || item.pair_id === editingItem.id)
        );
    }, [data, editingItem]);

    
    // Tampilan warna saat memilih
    const previewColor = hslToRgb(colorH, colorS, colorL);

    // --- Modal Edit Item ---
    const EditModal = () => (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
                <h3 className="text-xl font-bold mb-4 border-b pb-2">Edit Object Class: {editingItem?.name}</h3>
                
                <div className="space-y-4">
                    {/* 1. Object Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Object Name</label>
                        <input
                            type="text"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                            value={tempEdit.name}
                            onChange={(e) => setTempEdit({...tempEdit, name: e.target.value})}
                        />
                    </div>

                    {/* 2. Is Violation Checkbox */}
                    <div className="flex items-center">
                        <input
                            id="is_violation"
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            checked={tempEdit.is_violation}
                            onChange={(e) => setTempEdit({...tempEdit, is_violation: e.target.checked})}
                        />
                        <label htmlFor="is_violation" className="ml-2 block text-sm text-gray-900">
                            Is Violation
                        </label>
                    </div>

                    {/* 3. Pairing Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pair Object (Pasangan Safety/Violation)</label>
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
                            Pilih pasangan. Pasangan lama akan otomatis di-reset.
                        </p>
                    </div>

                    {/* 4. Color Picker (Simulasi HSV/HSL) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Color (RGB: {previewColor.r}, {previewColor.g}, {previewColor.b})</label>
                        <div className="flex items-center space-x-4 mt-1">
                            {/* Color Preview */}
                            <div 
                                className="w-10 h-10 rounded-md shadow-md border" 
                                style={{ backgroundColor: `rgb(${previewColor.r}, ${previewColor.g}, ${previewColor.b})` }}
                            ></div>
                            
                            <div className="flex-grow space-y-2">
                                {/* Hue (Warna) */}
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    value={colorH}
                                    onChange={(e) => setColorH(parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    style={{ background: `linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)` }}
                                />
                                {/* Saturation (Kepekatan) */}
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={colorS}
                                    onChange={(e) => setColorS(parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    style={{ background: `linear-gradient(to right, hsl(${colorH}, 0%, ${colorL}%), hsl(${colorH}, 100%, ${colorL}%))` }}
                                />
                                {/* Lightness (Kecerahan) */}
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={colorL}
                                    onChange={(e) => setColorL(parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    style={{ background: `linear-gradient(to right, black, hsl(${colorH}, ${colorS}%, 50%), white)` }}
                                />
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
                        <FaTimes className="mr-2" /> Batal
                    </button>
                    <button
                        type="button"
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700"
                        onClick={handleSave}
                        disabled={loading}
                    >
                        <FaSave className="mr-2" /> {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                </div>
            </div>
        </div>
    );

    // --- Main Table Render ---
    return (
        <div className="p-6 bg-white shadow rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Object Class Configuration</h3>
            
            {loading ? (
                <p className="text-center py-8 text-indigo-600">Memuat data...</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Object Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Is Violation</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pair</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Color (RGB)</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((item, index) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {index + 1}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {item.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {item.is_violation ? (
                                            <FaCheckSquare className="text-green-500 h-5 w-5" />
                                        ) : (
                                            <FaSquare className="text-gray-300 h-5 w-5" />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {getPairName(item.pair_id)}
                                        {item.pair_id && <FaInfoCircle className="ml-1 inline-block text-xs text-indigo-500" title={`Paired with ID: ${item.pair_id}`} />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex items-center">
                                            <div 
                                                className="w-5 h-5 rounded-full border shadow-sm"
                                                style={{ backgroundColor: `rgb(${item.color_r}, ${item.color_g}, ${item.color_b})` }}
                                            ></div>
                                            <span className="ml-2">({item.color_r}, {item.color_g}, {item.color_b})</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                        <button
                                            onClick={() => handleEdit(item)}
                                            className="text-indigo-600 hover:text-indigo-900 p-2 rounded-full hover:bg-indigo-100 transition"
                                        >
                                            <FaEdit className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {isModalOpen && <EditModal />}
        </div>
    );
}

export default SetupDataset;