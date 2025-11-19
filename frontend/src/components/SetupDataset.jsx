import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FaEdit, FaCheckSquare, FaSquare, FaInfoCircle } from 'react-icons/fa';
import { useAlert } from './AlertProvider'; 
import ModalEditObjek from './ModalEditObjek'; 

// --- Helper: Konversi HSL ke RGB ---
const hslToRgb = (h, s, l) => {
    s /= 100; l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; } else if (h >= 60 && h < 120) { r = x; g = c; b = 0; } else if (h >= 120 && h < 180) { r = 0; g = c; b = x; } else if (h >= 180 && h < 240) { r = 0; g = x; b = c; } else if (h >= 240 && h < 300) { r = x; g = 0; b = c; } else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return { r, g, b };
};

// --- Helper: Konversi RGB ke HSL ---
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

const SetupDataset = () => {
    const { showAlert } = useAlert(); 
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [tempEdit, setTempEdit] = useState({});
    
    // State untuk Color Picker (disimpan di SetupDataset karena state HSL memicu render Modal)
    const [colorH, setColorH] = useState(0); 
    const [colorS, setColorS] = useState(100);
    const [colorL, setColorL] = useState(50);

    // API_URL menggunakan /api/object/object_classes (Seperti yang sudah diperbaiki)
    const API_URL = '/api/object/object_classes'; 

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Failed to fetch data');
            const result = await response.json();
            setData(result);
        } catch (error) {
            showAlert(`Failed to load data: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleEdit = (item) => {
        setEditingItem(item);
        
        // --- PERBAIKAN KRITIS: Gunakan Helper RGB->HSL yang BENAR ---
        const { h, s, l } = rgbToHsl(item.color_r, item.color_g, item.color_b);
        
        setColorH(h); // Nilai HUE yang benar (0-360)
        setColorS(s); // Nilai SATURATION yang benar (0-100)
        setColorL(l); // Nilai LIGHTNESS yang benar (0-100)

        setTempEdit({
            id: item.id,
            name: item.name,
            is_violation: item.is_violation,
            pair_id: item.pair_id,
            old_pair_id: item.pair_id,
        });
        
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingItem) return;

        // Konversi HSL slider ke RGB untuk disimpan
        const newRGB = hslToRgb(colorH, colorS, colorL);
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
            if (!response.ok) throw new Error('Failed to update data.');

            showAlert('Object Class data updated successfully! Please refresh the cache if necessary.', 'success');
            await fetchData();
            setIsModalOpen(false);
        } catch (error) {
            showAlert(`Failed to save: ${error.message}`, 'error');
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

        return data.filter(item => 
            item.id !== editingItem.id && 
            (item.pair_id === null || item.pair_id === editingItem.id)
        );
    }, [data, editingItem]);

    const getPairDetails = useCallback((pairId) => {
        return data.find(item => item.id === pairId) || null;
    }, [data]);

    // --- Main Table Render ---
    return (
        <div className="p-6 bg-white shadow rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Object Class Configuration</h3>
            
            {loading ? (
                <p className="text-center py-8 text-gray-600">Loading data...</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Object Name</th>
                                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Is Violation?</th>
                                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pair</th>
                                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Color (RGB)</th>
                                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((item, index) => {
                                const pairDetails = getPairDetails(item.pair_id);
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="p-2 whitespace-nowrap text-sm font-medium text-gray-900 text-center">
                                            {index + 1}
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-sm text-gray-500">
                                            {item.name}
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-sm text-gray-500 items-center">
                                            <div className='flex justify-center'>
                                            {item.is_violation ? (
                                                <FaCheckSquare className="text-green-500 h-5 w-5" />
                                            ) : (
                                                <FaSquare className="text-gray-300 h-5 w-5" />
                                            )}
                                            </div>
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-sm text-gray-500">
                                            {getPairName(item.pair_id)}
                                            {item.pair_id && (
                                                <PairInfoTooltip pairDetails={pairDetails} />
                                            )}
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-sm text-gray-500">
                                            <div className="flex items-center">
                                                <div 
                                                    className="w-5 h-5 rounded-full border shadow-sm"
                                                    style={{ backgroundColor: `rgb(${item.color_r}, ${item.color_g}, ${item.color_b})` }}
                                                ></div>
                                                <span className="ml-2">({item.color_r}, {item.color_g}, {item.color_b})</span>
                                            </div>
                                        </td>
                                        <td className="p-2 whitespace-nowrap text-center text-sm font-medium">
                                            <button
                                                onClick={() => handleEdit(item)}
                                                className="text-green-600 hover:text-green-800 transition p-1 rounded-full bg-green-100"
                                            >
                                                <FaEdit className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* <-- RENDERING MODAL BARU --> */}
            {isModalOpen && (
                <ModalEditObjek
                    tempEdit={tempEdit}
                    setTempEdit={setTempEdit}
                    colorH={colorH}
                    setColorH={setColorH}
                    colorS={colorS}
                    setColorS={setColorS}
                    colorL={colorL}
                    setColorL={setColorL}
                    handleSave={handleSave}
                    loading={loading}
                    setIsModalOpen={setIsModalOpen}
                    getAvailablePairs={getAvailablePairs}
                    editingItem={editingItem}
                />
            )}
        </div>
    );
}

// --- Tooltip Pairing Object ---
const PairInfoTooltip = React.memo(({ pairDetails }) => {
    if (!pairDetails) return null;

    return (
        <div className="relative inline-block ml-2 group">
            {/* Target Hover */}
            <FaInfoCircle 
                className="inline-block text-xs text-indigo-500 cursor-pointer" 
                title={`ID Pasangan: ${pairDetails.id}`}
            />
            
            {/* Popover Kustom yang muncul saat hover */}
            <div className="absolute left-full transform -translate-y-1/2 top-1/2 ml-2 hidden group-hover:block w-48 z-10 bg-white p-3 rounded-lg shadow-lg border border-gray-200 text-xs whitespace-normal transition duration-150 ease-in-out origin-top-left">
                <p className="font-bold border-b pb-1 mb-1 text-gray-800">Pair Details</p>
                <p className="text-gray-700">Name: <span className="font-medium">{pairDetails.name}</span></p>
                <p className="text-gray-700">Status: 
                    <span className={`font-semibold ml-1 ${pairDetails.is_violation ? 'text-red-600' : 'text-green-600'}`}>
                        {pairDetails.is_violation ? 'VIOLATION' : 'SAFETY'}
                    </span>
                </p>
            </div>
        </div>
    );
});

export default SetupDataset;