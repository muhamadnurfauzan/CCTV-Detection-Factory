import React, { useState, useEffect, useRef } from 'react';
import { FaChevronDown, FaTimes, FaSearch } from 'react-icons/fa';

export default function Multiselect({ options, selectedValues, onSelect, placeholder = "Pilih opsi..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (id) => {
        const newSelection = selectedValues.includes(id)
            ? selectedValues.filter(val => val !== id)
            : [...selectedValues, id];
        onSelect(newSelection);
    };
    
    const filteredOptions = options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedLabels = options
        .filter(option => selectedValues.includes(option.id))
        .map(option => option.label);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Display Input/Trigger */}
            <div
                className="w-full px-3 py-2 border border-gray-300 rounded-lg cursor-pointer bg-white flex items-center justify-between min-h-[42px] focus:ring-2 focus:ring-indigo-500 transition"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex flex-wrap gap-1">
                    {selectedLabels.length > 0 ? (
                        selectedLabels.map((label, index) => (
                            <span 
                                key={index}
                                className="px-2 py-0.5 text-xs font-medium text-indigo-800 bg-indigo-100 rounded-full flex items-center"
                            >
                                {label}
                                <FaTimes 
                                    className="ml-1 w-2.5 h-2.5 cursor-pointer hover:text-indigo-600"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const optionId = options.find(o => o.label === label)?.id;
                                        if (optionId) toggleOption(optionId);
                                    }}
                                />
                            </span>
                        ))
                    ) : (
                        <span className="text-gray-500 text-sm">{placeholder}</span>
                    )}
                </div>
                <FaChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
            </div>

            {/* Dropdown List */}
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 border border-gray-300 rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 border-b sticky top-0 bg-white">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 pl-8 text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                             <FaSearch className="absolute left-2.5 top-2.5 w-3 h-3 text-gray-400" />
                        </div>
                    </div>
                    {filteredOptions.length === 0 ? (
                        <div className="p-3 text-gray-500 text-sm italic">No data for "{searchTerm}"</div>
                    ) : (
                        filteredOptions.map(option => (
                            <div
                                key={option.id}
                                className={`px-3 py-2 cursor-pointer text-sm hover:bg-indigo-50 transition flex items-center justify-between ${
                                    selectedValues.includes(option.id) ? 'bg-indigo-100 font-medium' : ''
                                }`}
                                onClick={() => toggleOption(option.id)}
                            >
                                {option.label}
                                {selectedValues.includes(option.id) && (
                                    <span className="text-indigo-600 text-xs">Selected</span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}