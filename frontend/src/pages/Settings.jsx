// Settings.jsx
import React, { useState } from 'react';
import RoleButton from '../components/RoleButton';
import DatasetSetup from '../components/SetupDataset'; 
import EmailSetup from '../components/SetupEmail'; 

const Settings = () => {
    const [settingButton, setSettingButton] = useState('dataset'); 

    const menuItems = [
        { key: 'dataset', label: 'Dataset Setup' },
        { key: 'email', label: 'Email Setup' },
        { key: 'comingsoon', label: 'Coming Soon' },
    ];

    // Fungsi untuk merender konten berdasarkan tab yang aktif
    const renderContent = () => {
        switch (settingButton) {
            case 'dataset':
                return <DatasetSetup />;
            case 'email':
                return <EmailSetup />;
            case 'comingsoon':
                return <p className="text-gray-600 p-6 bg-white shadow rounded-lg">This is the Coming Soon page. Content will be added here later.</p>;
            default:
                return null;
        }
    };

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-sans">
            <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Settings</h2>
            
            <div className='space-y-3'>
                
                {/* 1. Tab Pilihan Menu Settings (Header & Navigasi) */}
                <div className='flex gap-2 border-b border-gray-200 overflow-x-auto'>
                    
                    {menuItems.map(item => (
                        <RoleButton
                            allowedRoles={['super_admin']}
                            key={item.key}
                            type='RoleButton'
                            onClick={() => setSettingButton(item.key)}
                            className={`px-4 py-2 font-medium text-sm whitespace-nowrap rounded-t-lg transition ${
                                settingButton === item.key
                                ? 'bg-white text-indigo-600 border border-b-0 border-gray-300 shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {item.label}
                        </RoleButton>
                    ))}
                    
                </div>
                
                {/* 2. Konten Menu Aktif */}
                <div className='mt-4'>
                    {renderContent()}
                </div>

            </div>
        </div>
    );
};

export default Settings;