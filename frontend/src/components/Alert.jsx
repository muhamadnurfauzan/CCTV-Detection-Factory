// components/Alert.jsx
import React, { useState, useEffect } from 'react';
import { FaTimes, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimesCircle } from 'react-icons/fa';

const Alert = ({ message, type, id, removeAlert, duration = 10000 }) => { 
    const [progress, setProgress] = useState(100);

    const baseStyle = "relative p-4 w-full rounded-xl shadow-lg overflow-hidden ring-1 ring-black/5";
    const barStyle = "h-1.5 absolute bottom-0 left-0 transition-all ease-linear";

    let icon, bgColor, textColor, barColor, iconColor;

    // Menentukan skema warna berdasarkan tipe
    switch (type) {
        case 'success':
            icon = <FaCheckCircle className="text-xl" />;
            bgColor = "bg-green-50"; 
            textColor = "text-green-900";
            iconColor = "text-green-500";
            barColor = "bg-green-500";
            break;
        case 'error':
            icon = <FaTimesCircle className="text-xl" />;
            bgColor = "bg-red-50";
            textColor = "text-red-900";
            iconColor = "text-red-500";
            barColor = "bg-red-500";
            break;
        case 'warning':
            icon = <FaExclamationTriangle className="text-xl" />;
            bgColor = "bg-amber-50"; 
            textColor = "text-amber-900";
            iconColor = "text-amber-500";
            barColor = "bg-amber-500";
            break;
        case 'info':
        default:
            icon = <FaInfoCircle className="text-xl" />;
            bgColor = "bg-blue-50"; 
            textColor = "text-blue-900";
            iconColor = "text-blue-500";
            barColor = "bg-blue-500";
    }

    // Logika Countdown
    useEffect(() => {
        const interval = 50;
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
    }, [duration, id, removeAlert]);

    return (
        <div className={`${baseStyle} ${bgColor}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3">
                    <span className={iconColor}>{icon}</span>
                    <p className={`text-sm font-bold leading-tight ${textColor}`}>{message}</p>
                </div>
                <button 
                    onClick={() => removeAlert(id)} 
                    className={`${textColor} opacity-50 hover:opacity-100 transition-opacity`}
                >
                    <FaTimes />
                </button>
            </div>
            {/* Progress Bar yang lebih tebal dan kontras */}
            <div className={`${barStyle} ${barColor} opacity-30`} style={{ width: '100%', position: 'absolute', left: 0, bottom: 0, height: '4px', backgroundColor: 'rgba(0,0,0,0.05)' }}></div>
            <div className={`${barStyle} ${barColor}`} style={{ width: `${progress}%` }}></div>
        </div>
    );
};

export default Alert;