import React, { useState, useEffect, useMemo } from 'react';
import { FaPaperPlane } from 'react-icons/fa';
import { useAlert } from '../components/AlertProvider';

const formatDate = (date) => date.toISOString().split('T')[0];

const ModalSendRecap = ({ open, onClose, onSend }) => {
    const { showAlert } = useAlert();
    const today = useMemo(() => formatDate(new Date()), []);
    
    const [reportType, setReportType] = useState('Custom');
    const [startDate, setStartDate] = useState(formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    const [endDate, setEndDate] = useState(today);
    const [loading, setLoading] = useState(false);

    // --- Efek untuk Menyesuaikan Tanggal Berdasarkan Tipe Laporan ---
    useEffect(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); 
        
        if (reportType === 'Weekly') {
            // Logika untuk periode MINGGU LALU (Senin s/d Minggu)
            
            // Hitung hari untuk mundur ke HARI MINGGU sebelumnya
            const daysToSunday = now.getDay() === 0 ? 0 : now.getDay(); 
            const lastSunday = new Date(now);
            lastSunday.setDate(now.getDate() - daysToSunday);
            
            // Start Date: Mundur 7 hari dari Minggu lalu (yaitu Senin minggu lalu)
            const weeklyStart = new Date(lastSunday);
            weeklyStart.setDate(lastSunday.getDate() - 5);
            
            // End Date: Minggu lalu
            const weeklyEnd = new Date(lastSunday);
            weeklyEnd.setDate(lastSunday.getDate()); 

            setStartDate(formatDate(weeklyStart));
            setEndDate(formatDate(weeklyEnd));

            console.log("Now:", now);
            console.log("Start Date:", startDate);
            console.log("Last Sunday:", lastSunday);
            console.log("Days to Sunday:", daysToSunday);
            console.log("Weekly Start:", weeklyStart);
            console.log("Weekly End:", weeklyEnd);

        } else if (reportType === 'Monthly') {
            // Logika untuk periode BULAN LALU (Tanggal 1 s/d Tanggal Akhir Bulan)
            
            // End Date: Tanggal 1 bulan ini (tidak inklusif)
            const monthlyEnd = new Date(now.getFullYear(), now.getMonth(), 2);
            
            // Start Date: Tanggal 1 bulan sebelumnya
            const monthlyStart = new Date(now.getFullYear(), now.getMonth() - 1, 2);

            setStartDate(formatDate(monthlyStart));
            // End Date di sini adalah tanggal terakhir bulan lalu (monthlyEnd - 1 hari)
            setEndDate(formatDate(new Date(monthlyEnd.getTime() - 24 * 60 * 60 * 1000)));
            // setEndDate(formatDate(new Date(monthlyEnd.getTime() - 24 * 60 * 60 * 1000)));
            
        } else if (reportType === 'Custom') {}
    }, [reportType]);
    
    // --- Handler Pengiriman ---
    const handleSend = () => {
        if (!startDate || !endDate) return showAlert("Please select start and end dates.");
        if (new Date(startDate) > new Date(endDate)) return showAlert("The start date must be earlier or equal to the end date.");
        
        // Tentukan templateKey yang akan dikirim ke backend
        let templateKey = 'violation_weekly_recap';
        if (reportType === 'Monthly') {
            templateKey = 'violation_monthly_recap';
        } else if (reportType === 'Custom') {
            templateKey = 'violation_custom_report';
        }

        onSend({ 
            startDate, 
            endDate, 
            reportType: templateKey, 
            setLoading 
        });
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
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            disabled={loading}
                        >
                            <option value="Custom">Custom Dates</option>
                            <option value="Weekly">Weekly (Auto)</option>
                            <option value="Monthly">Monthly (Auto)</option>
                        </select>
                    </div>

                    {/* Tanggal Mulai */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${reportType !== 'Custom' ? 'bg-gray-100 border-gray-300' : 'border-gray-300'}`}
                            max={endDate}
                            // disabled={loading || reportType !== 'Custom'} 
                            disabled={loading}
                        />
                    </div>

                    {/* Tanggal Akhir */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${reportType !== 'Custom' ? 'bg-gray-100 border-gray-300' : 'border-gray-300'}`}
                            max={today}
                            min={startDate}
                            // disabled={loading || reportType !== 'Custom'} 
                            disabled={loading}
                        />
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