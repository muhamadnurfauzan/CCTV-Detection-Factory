import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaHome, FaVideo, FaCog, FaTimes, FaBars, FaImages, FaSlidersH, FaBullhorn } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';

const navItemsData = [
    { path: "/", label: "Dashboard", Icon: FaHome },
    { path: "/cctv", label: "CCTVs", Icon: FaVideo },
    { path: "/#", label: "Camera Setting", Icon: FaSlidersH},
    { path: "/images", label: "Violations", Icon: FaImages},
    { path: "/#", label: "Reports", Icon: FaBullhorn},
];

const Sidebar = ({ isExpanded, setIsExpanded }) => {
  const location = useLocation();

  const navItem = ({ path, label, Icon }) => {
    const isActive = location.pathname === path;
    const baseClasses = "flex items-center h-12 px-3 rounded transition-colors duration-200";
    const activeClasses = "bg-indigo-700 text-white";
    const inactiveClasses = "text-indigo-200 hover:bg-indigo-700 hover:text-white";

    return (
      <li key={path}>
        <Link
          to={path}
          className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
          data-tooltip-id="sidebar-tooltip"
          data-tooltip-content={label}
          aria-label={label}
        >
          <Icon className="w-6 h-6" />
          {isExpanded && <span className="ml-3 text-sm font-medium">{label}</span>}
        </Link>
      </li>
    );
  };

  return (
    <>
      {!isExpanded && 
      <Tooltip 
            id="sidebar-tooltip" 
            place="right" 
            effect="float" 
            style={{ borderRadius: '0.375rem', zIndex: 50 }}
      />}
      <nav
        className={`fixed top-0 left-0 h-screen bg-indigo-900 text-indigo-300 shadow-xl transition-all duration-300 ${isExpanded ? 'z-40' : 'z-0'}
          ${isExpanded ? 'w-56' : 'w-20'}
          ${isExpanded ? 'translate-x-0' : 'translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full p-3">
          {/* Header */}
          <div
            className={`flex items-center mb-6 ${
              isExpanded ? 'justify-between' : 'justify-center'
            }`}
          >
            {isExpanded ? (
              <span className="text-xl font-bold text-white">APP LOGO</span>
            ) : (
              <span className="text-xl font-bold text-white">X</span>
            )}
            {isExpanded && (
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 rounded hover:bg-indigo-700 transition-colors duration-200"
                aria-label="Tutup Sidebar"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Menu Navigasi */}
          <ul className="space-y-2 flex-grow">{navItemsData.map(navItem)}</ul>

          {/* Bagian bawah */}

          <div className={`mt-auto pt-4 border-t border-indigo-700`}>
            <a
              href="/settings"
              className={`flex items-center h-12 rounded hover:bg-indigo-700 hover:text-white transition-colors duration-200 
                ${isExpanded ? 'px-3' : 'justify-center'}
              `}
              data-tooltip-id="sidebar-tooltip"
              data-tooltip-content="Settings"
              aria-label="Settings"
            >
              <FaCog className="w-6 h-6" />
              {isExpanded && <span className="ml-3 text-sm font-medium">Settings</span>}
            </a>
          </div>
        </div>
      </nav>
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="fixed top-4 left-4 z-50 p-2 rounded bg-indigo-900 text-white hover:bg-indigo-700 transition-colors duration-200 shadow-lg"
          aria-label="Buka Sidebar"
        >
          <FaBars className="w-6 h-6" />
        </button>
      )}
    </>
  );
};

export default Sidebar;