// components/AlertProvider.jsx
import React, { useState, createContext, useContext, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion'; //
import Alert from './Alert';

const AlertContext = createContext();
export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
    const [alerts, setAlerts] = useState([]);

    const showAlert = useCallback((message, type = 'info', duration = 5000) => {
        const id = Date.now() + Math.random();
        const newAlert = { id, message, type, duration };
        setAlerts(prev => [...prev, newAlert]);
    }, []);

    const removeAlert = useCallback((id) => {
        setAlerts(prev => prev.filter(alert => alert.id !== id));
    }, []);

    return (
        <AlertContext.Provider value={{ showAlert }}>
            {children}
            
            {/* Container Utama */}
            <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm">
                <AnimatePresence mode="popLayout">
                    {alerts.map((alert) => (
                        <motion.div
                            key={alert.id}
                            layout 
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } }}
                            className="pointer-events-auto"
                        >
                            <Alert {...alert} removeAlert={removeAlert} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </AlertContext.Provider>
    );
};