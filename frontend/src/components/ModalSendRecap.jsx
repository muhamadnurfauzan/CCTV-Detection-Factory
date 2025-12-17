import React, { useState, useEffect, useMemo } from 'react';
import { FaPaperPlane } from 'react-icons/fa';
import { useAlert } from './AlertProvider';
import Multiselect from './Multiselect'; 

const formatDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const ModalSendRecap = ({ open, onClose, onSend, allUsers, allCCTVs }) => {
    const { showAlert } = useAlert();
    const today = useMemo(() => formatDate(new Date()), []);
    
    const [templateKey, setTemplateKey] = useState('Custom');
    const [startDate, setStartDate] = useState(formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    const [endDate, setEndDate] = useState(today);
    const [loading, setLoading] = useState(false);

    // --- State Filter User and CCTV ---
    const [selectedUserIds, setSelectedUserIds] = useState([]); // id
    const [selectedCctvIds, setSelectedCctvIds] = useState([]); // id
    const [userCCTVMap, setUserCCTVMap] = useState({});
    const [filteredCCTVOptions, setFilteredCCTVOptions] = useState(allCCTVs);

    // --- FORMAT DATA UNTUK MULTISELECT ---
    const userOptions = useMemo(() => 
        (allUsers || []).map(user => ({ 
            id: String(user.id), 
            label: `${user.full_name} (${user.email})`
        })), [allUsers]
    );

    const normalizedAllCCTVs = useMemo(
        () => (allCCTVs || []).map(c => ({
            id: String(c.id), 
            label: `${c.name} (${c.location || '-'})`
        })),
        [allCCTVs]
    );

    // --- Efek 1: Fetch Mapping User-CCTV ---
    useEffect(() => {
        const fetchMap = async () => {
            if (!open) return;
            try {
                const res = await fetch('/api/user-cctv-map-all');
                if (!res.ok) throw new Error("Failed to fetch user CCTV map.");
                const data = await res.json();
                const parsedMap = {};
                for (const key in data) {
                    parsedMap[String(key)] = data[key].map(c => ({
                        ...c,
                        id: String(c.id) 
                    }));
                }
                setUserCCTVMap(parsedMap);
            } catch (err) {
                showAlert('Error fetching CCTV map: ' + err.message, 'error');
            }
        };
        fetchMap();
    }, [open, showAlert]);
    
    // --- Efek 2: Logika Dynamic Filtering (Intersection) ---
    useEffect(() => {
        // Case 1: Kita menginputkan user A, maka filter CCTV akan muncul dan hanya menampilkan CCTV yang di-assign-kan dengan user A, yaitu CCTV A, C, dan D.
        // Case 2: Misal kita menginputkan user A dan C. Maka filter yang muncul hanyalah CCTV C saja, karena kedua user ditanggung jawabi oleh cctv tersebut.
        // Case 3: Sebaliknya, jika kita menginputkan user A dan B, maka tidak ada CCTV yang muncul, karena keduanya tidak memiliki irisan CCTV assign yang sama.
        // Case 4: Nilai default-nya adalah ketika user tidak menginputkan apapun ke field user, maka yang akan terjadi adalah SEMUA user mendapatkan semua report dari masing-masing CCTV yang mereka ampu sendiri. Pada kondisi ini, kita perlu memberikan alert.

        if (!normalizedAllCCTVs.length) return;

        // Case 4: Jika tidak ada user yang dipilih
        if (!selectedUserIds || selectedUserIds.length === 0) {
            setFilteredCCTVOptions(normalizedAllCCTVs);
            return;
        }

        if (Object.keys(userCCTVMap).length === 0) {
            setFilteredCCTVOptions([]); 
            return;
        }

        let commonCCTVIds = null;

        selectedUserIds.forEach(userId => {
            const userIdStr = String(userId);
            const userCCTVs = userCCTVMap[userIdStr] || [];
            const ids = userCCTVs.map(c => String(c.id)); 

            if (commonCCTVIds === null) {
                commonCCTVIds = new Set(ids);
            } else {
                commonCCTVIds = new Set(
                    ids.filter(id => commonCCTVIds.has(id))
                );
            }
        });

        if (!commonCCTVIds || commonCCTVIds.size === 0) {
            setFilteredCCTVOptions([]);
            setSelectedCctvIds([]); 
        } else {
            const newOptions = normalizedAllCCTVs.filter(c => commonCCTVIds.has(c.id));
            setFilteredCCTVOptions(newOptions);
            // Hapus pilihan CCTV yang sudah tidak ada di irisan baru
            setSelectedCctvIds(prev => prev.filter(id => commonCCTVIds.has(String(id))));
        }
    }, [selectedUserIds, userCCTVMap, normalizedAllCCTVs]);

    // --- Efek untuk Menyesuaikan Tanggal Berdasarkan Tipe Laporan ---
    useEffect(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); 
        
        if (templateKey === 'Weekly') {
            const currentDay = now.getDay(); 
            // Hitung mundur ke Senin minggu ini, lalu ke Senin minggu lalu
            const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
            
            const lastMonday = new Date(now);
            lastMonday.setDate(now.getDate() - daysToMonday - 7);
            
            const lastSunday = new Date(lastMonday);
            lastSunday.setDate(lastMonday.getDate() + 6);

            setStartDate(formatDate(lastMonday));
            setEndDate(formatDate(lastSunday));

        } else if (templateKey === 'Monthly') {
            // Tanggal 1 bulan lalu
            const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            // Hari ke-0 bulan ini = Hari terakhir bulan lalu
            const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            setStartDate(formatDate(firstDayLastMonth));
            setEndDate(formatDate(lastDayLastMonth));
        }
    }, [templateKey]);
    
    // --- Handler Pengiriman ---
    const handleSend = () => {
        if (!startDate || !endDate) return showAlert("Please select dates.");
        if (new Date(startDate) > new Date(endDate)) return showAlert("The start date must be earlier or equal to the end date.");
        
        if (selectedUserIds.length === 0) {
             // Kasus Default: User tidak diisi
             showAlert("No specific users selected. The report will be generated for ALL relevant parties. Proceeding with ALL.", 'info');
        } else if (selectedCctvIds.length === 0) {
             // Kasus User diisi, tapi CCTV tidak diisi ATAU tidak ada irisan
             showAlert("Users are selected, but no specific CCTVs are selected (or no common CCTVs found). Sending reports including ALL mapped CCTVs for the selected user(s).", 'info');
        }

        // Pastikan data yang dikirim ke backend benar-benar ID murni
        const userIdsToSend = selectedUserIds && selectedUserIds.length > 0 ? selectedUserIds : null;
        const cctvIdsToSend = selectedCctvIds && selectedCctvIds.length > 0 ? selectedCctvIds : null;

        const payload = {
            startDate,
            endDate,
            templateKey: templateKey === 'Monthly' ? 'violation_monthly_recap' : 
                        templateKey === 'Weekly' ? 'violation_weekly_recap' : 'violation_custom_report',
            selectedUserIds: userIdsToSend,
            selectedCctvIds: cctvIdsToSend,
        };

        if (!userIdsToSend) {
            showAlert("No specific users selected. Generating report for ALL parties.", 'info');
        }

        onSend({ ...payload, setLoading });
    };

    if (!open) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Send Manual Recap Report Email</h3>
                
                <div className="space-y-4">
                    {/* Tipe Laporan */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Recap Report Type</label>
                        <select
                            value={templateKey}
                            onChange={(e) => setTemplateKey(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={loading}
                        >
                            <option value="Custom">Custom Dates</option>
                            <option value="Weekly">Weekly (Auto)</option>
                            <option value="Monthly">Monthly (Auto)</option>
                        </select>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {/* Tanggal Mulai */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={`w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${templateKey !== 'Custom' ? 'bg-gray-100 border-gray-300' : 'border-gray-300'}`}
                                max={endDate}
                                disabled={loading || templateKey !== 'Custom'} 
                            />
                        </div>
                        {/* Tanggal Akhir */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={`w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${templateKey !== 'Custom' ? 'bg-gray-100 border-gray-300' : 'border-gray-300'}`}
                                max={today}
                                min={startDate}
                                disabled={loading || templateKey !== 'Custom'} 
                            />
                        </div>
                    </div>

                    <hr className="my-4"/>
                    
                    {/* --- Filter Penerima --- */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Filter Users</label>
                        <Multiselect
                            options={userOptions}
                            selectedValues={selectedUserIds} 
                            onSelect={(ids) => setSelectedUserIds(ids)}
                            placeholder="Select users to receive report..."
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave empty to send to all responsible users.</p>
                    </div>

                    {/* --- Filter CCTV --- */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Filter CCTVs (Optional)</label>
                        <Multiselect
                            options={filteredCCTVOptions}
                            selectedValues={selectedCctvIds}
                            onSelect={(ids) => setSelectedCctvIds(ids)}
                            placeholder="Select specific CCTVs to include..."
                            disabled={selectedUserIds.length > 0 && filteredCCTVOptions.length === 0} 
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Showing {filteredCCTVOptions.length} CCTVs based on selected users' assignment.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSend}
                        className={`
                            px-4 py-2 text-sm font-medium text-white rounded-md transition 
                            ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}
                        `}
                        disabled={loading}
                    >
                        <div className='flex items-center gap-2'>
                            <FaPaperPlane className='w-4 h-4'/>
                            {loading ? 'Sending...' : 'Send Recap'}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModalSendRecap;