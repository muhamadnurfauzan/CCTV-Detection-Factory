// Settings.jsx
import { Tab } from '@headlessui/react';
import GeneralSetup from '../components/SetupGeneral'; 
import DatasetSetup from '../components/SetupDataset'; 
import EmailSetup from '../components/SetupEmail'; 

const Settings = () => {
    const menuItems = [
        { key: 'general', label: 'General Settings', component: <GeneralSetup /> },
        { key: 'dataset', label: 'Dataset Setup', component: <DatasetSetup /> },
        { key: 'email', label: 'Email Setup', component: <EmailSetup /> },
    ];

    function classNames(...classes) {
        return classes.filter(Boolean).join(' ');
    }

    return (
        <div className="p-4 sm:p-6 bg-gray-50 min-h-screen font-sans">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-3xl font-bold mb-8 text-gray-900 tracking-tight">System Settings</h2>

                <Tab.Group>
                    <Tab.List className="flex space-x-1 rounded-xl bg-gray-200/50 p-1 mb-4 max-w-md">
                        {menuItems.map((item) => (
                            <Tab
                                key={item.key}
                                className={({ selected }) =>
                                    classNames(
                                        'w-full rounded-lg py-2.5 text-sm font-semibold leading-5 transition-all duration-200 outline-none',
                                        selected
                                            ? 'bg-indigo-700 text-white shadow-sm ring-1 ring-black/5'
                                            : 'text-gray-600 hover:bg-white/[0.35] hover:text-gray-900'
                                    )
                                }
                            >
                                {item.label}
                            </Tab>
                        ))}
                    </Tab.List>

                    <Tab.Panels>
                        {menuItems.map((item, idx) => (
                            <Tab.Panel
                                key={idx}
                                className={classNames(
                                    'rounded-xl outline-none transition-all duration-300',
                                    'focus:ring-2 focus:ring-indigo-500'
                                )}
                            >
                                {/* Wrapper untuk memberikan efek fade-in halus */}
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {item.component}
                                </div>
                            </Tab.Panel>
                        ))}
                    </Tab.Panels>
                </Tab.Group>
            </div>
        </div>
    );
};

export default Settings;