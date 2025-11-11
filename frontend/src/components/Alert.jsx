// components/Alert.jsx
import React, { useState, useEffect } from 'react';
import { FaTimes, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimesCircle } from 'react-icons/fa';

const Alert = ({ message, type, id, removeAlert }) => {
    const [progress, setProgress] = useState(100);
    const duration = 5000; // 5 seconds

    const baseStyle = "fixed top-5 right-5 z-50 p-4 w-full max-w-sm rounded-lg shadow-xl transform transition-transform duration-300 ease-out";
    const barStyle = "h-1 rounded-b-lg absolute bottom-0 left-0 transition-all ease-linear";

    let icon, colorClass, barColorClass;

    switch (type) {
        case 'success':
            icon = <FaCheckCircle className="text-xl" />;
            colorClass = "bg-green-500 text-white";
            barColorClass = "bg-green-700";
            break;
        case 'error':
            icon = <FaTimesCircle className="text-xl" />;
            colorClass = "bg-red-500 text-white";
            barColorClass = "bg-red-700";
            break;
        case 'warning':
            icon = <FaExclamationTriangle className="text-xl" />;
            colorClass = "bg-yellow-500 text-gray-900";
            barColorClass = "bg-yellow-700";
            break;
        case 'info':
        default:
            icon = <FaInfoCircle className="text-xl" />;
            colorClass = "bg-blue-500 text-white";
            barColorClass = "bg-blue-700";
    }

    // Countdown logic
    useEffect(() => {
        if (progress > 0) {
            const interval = 50; // Update every 50ms
            const step = (interval / duration) * 100;
            const timer = setInterval(() => {
                setProgress(prev => {
                    const newProgress = prev - step;
                    if (newProgress <= 0) {
                        clearInterval(timer);
                        removeAlert(id);
                        return 0;
                    }
                    return newProgress;
                });
            }, interval);
            return () => clearInterval(timer);
        }
    }, [progress, id, removeAlert]);


    return (
        <div className={`${baseStyle} ${colorClass}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                    {icon}
                    <p className="text-sm font-semibold">{message}</p>
                </div>
                <button
                    onClick={() => removeAlert(id)}
                    className="p-1 rounded-full hover:bg-opacity-20"
                    aria-label="Close alert"
                >
                    <FaTimes className="text-sm" />
                </button>
            </div>
            <div className={`${barStyle} ${barColorClass}`} style={{ width: `${progress}%` }}></div>
        </div>
    );
};

export default Alert;