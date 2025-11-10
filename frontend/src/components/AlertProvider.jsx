// components/AlertProvider.jsx
import React, { useState, createContext, useContext, useCallback } from 'react';
import Alert from './Alert';

const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
    const [alerts, setAlerts] = useState([]);

    const showAlert = useCallback((message, type = 'info', duration = 5000) => {
        const id = Date.now() + Math.random();
        const newAlert = { id, message, type, duration };

        // Tambahkan alert baru
        setAlerts(prev => [...prev, newAlert]);
    }, []);

    const removeAlert = useCallback((id) => {
        setAlerts(prev => prev.filter(alert => alert.id !== id));
    }, []);

    return (
        <AlertContext.Provider value={{ showAlert }}>
            {children}
            {/* Render alerts di sini */}
            <div className="alert-container fixed top-0 right-0 z-50 space-y-2 p-5 pointer-events-none">
                {alerts.map(alert => (
                    <div key={alert.id} className="pointer-events-auto">
                        <Alert {...alert} removeAlert={removeAlert} />
                    </div>
                ))}
            </div>
        </AlertContext.Provider>
    );
};