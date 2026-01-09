// Settings.jsx
import { Tab } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion'; 
import GeneralSetup from '../components/SetupGeneral'; 
import ModelSetup from '../components/SetupModel'; 
import EmailSetup from '../components/SetupEmail'; 
import { FaCog, FaDatabase, FaEnvelope } from 'react-icons/fa';

const Settings = () => {
    const menuItems = [
        { key: 'general', label: 'General', Icon: FaCog, component: <GeneralSetup /> },
        { key: 'model', label: 'Model', Icon: FaDatabase, component: <ModelSetup /> },
        { key: 'email', label: 'Email', Icon: FaEnvelope, component: <EmailSetup /> },
    ];

    function classNames(...classes) {
        return classes.filter(Boolean).join(' ');
    }

    return (
        <div className="p-4 sm:p-6 bg-gray-50 min-h-screen font-sans">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">System Settings</h2>

                <Tab.Group>
                    {/* TAB LIST DENGAN STYLE GLASSMORPHISM PILL */}
                    <div className="flex mb-4">
                        <Tab.List className="inline-flex items-center p-1.5 bg-white/90 backdrop-blur-md border border-gray-100 rounded-lg shadow-md relative">
                            {menuItems.map((item) => (
                                <Tab
                                    key={item.key}
                                    className={({ selected }) =>
                                        classNames(
                                            'relative px-6 py-2.5 text-sm font-bold transition-all duration-300 rounded-md flex items-center gap-2 outline-none',
                                            selected ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-400'
                                        )
                                    }
                                >
                                    {({ selected }) => (
                                        <>
                                            <item.Icon className={classNames("w-4 h-4 z-10", selected ? "text-indigo-600" : "text-gray-400")} />
                                            <span className="relative z-10">{item.label}</span>
                                            
                                            {/* ANIMASI BACKGROUND PILL YANG BERGESER */}
                                            {selected && (
                                                <motion.div
                                                    layoutId="activeTabPill"
                                                    className="absolute inset-0 bg-indigo-50 border border-indigo-100 rounded-lg shadow-sm"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}
                                        </>
                                    )}
                                </Tab>
                            ))}
                        </Tab.List>
                    </div>

                    <Tab.Panels>
                        <AnimatePresence mode="wait">
                            {menuItems.map((item, idx) => (
                                <Tab.Panel
                                    key={item.key}
                                    static 
                                >
                                    {({ selected }) => (
                                        selected && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.3 }}
                                                className="outline-none"
                                            >
                                                {item.component}
                                            </motion.div>
                                        )
                                    )}
                                </Tab.Panel>
                            ))}
                        </AnimatePresence>
                    </Tab.Panels>
                </Tab.Group>
            </div>
        </div>
    );
};

export default Settings;