// Sidebar.jsx – VERSI FINAL (Menu Utama di Atas, Users/Settings/Logout di Bawah)
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaHome, FaVideo, FaImages, FaBullhorn, FaUsers, FaCog, FaSignOutAlt, FaBars, FaTimes } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import ModalLogout from './ModalLogout';
import { useAuth } from '../context/AuthContext';

const mainNavItems = [
  { path: "/", label: "Dashboard", Icon: FaHome, allowedRoles: ['super_admin', 'report_viewer', 'cctv_editor', 'viewer'] },
  { path: "/cctv", label: "CCTVs", Icon: FaVideo, allowedRoles: ['super_admin', 'report_viewer', 'cctv_editor', 'viewer'] },
  { path: "/images", label: "Violations", Icon: FaImages, allowedRoles: ['super_admin', 'report_viewer'] },
  { path: "/reports", label: "Reports", Icon: FaBullhorn, allowedRoles: ['super_admin', 'report_viewer'] },
];

const bottomNavItems = [
  { path: "/users", label: "Users", Icon: FaUsers, allowedRoles: ['super_admin'] },
  { path: "/settings", label: "Settings", Icon: FaCog, allowedRoles: ['super_admin'] },
];

const Sidebar = ({ isExpanded, setIsExpanded }) => {
  const location = useLocation();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);
  const { user } = useAuth();

  const NavItem = ({ item }) => {
    const { path, label, Icon, allowedRoles } = item;

    // Role check
    if (allowedRoles && !allowedRoles.includes(user?.role)) return null;

    const isActive = location.pathname === path;
    const baseClasses = "flex items-center h-12 rounded transition-colors duration-200 w-full";
    const activeClasses = "bg-indigo-700 text-white";
    const inactiveClasses = "text-indigo-200 hover:bg-indigo-700 hover:text-white";

    return (
      <Link
        to={path}
        className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses} ${isExpanded ? 'px-3' : 'justify-center'}`}
        data-tooltip-id="sidebar-tooltip"
        data-tooltip-content={label}
      >
        <Icon className="w-6 h-6" />
        {isExpanded && <span className="ml-3 text-sm font-medium">{label}</span>}
      </Link>
    );
  };

  return (
    <>
      {!isExpanded && <Tooltip id="sidebar-tooltip" place="right" style={{ borderRadius: '0.375rem', zIndex: 50 }} />}

      <nav className={`
        fixed inset-y-0 left-0 z-50 flex flex-col
        bg-indigo-900 text-indigo-300 shadow-2xl
        transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-56' : 'w-20'}
      `}>
        <div className="flex flex-col h-full p-3">
          {/* Header */}
          <div className={`flex items-center mb-6 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
            {isExpanded ? (
              <span className="text-xl font-bold text-white">PPE DETECTION</span>
            ) : (
              <span className="text-xl font-bold text-white">X</span>
            )}
            {isExpanded && (
              <button onClick={() => setIsExpanded(false)} className="p-1 rounded hover:bg-indigo-700 text-white">
                <FaTimes className="w-6 h-6"/>
              </button>
            )}
          </div>

          {/* MENU UTAMA – Di atas, flex-grow */}
          <ul className="space-y-2 flex-1">
            {mainNavItems.map((item, i) => (
              <li key={i}><NavItem item={item} /></li>
            ))}
          </ul>

          {/* MENU BAWAH – Users, Settings, Logout */}
          <div className="space-y-2">
            {bottomNavItems.map((item, i) => (
              <NavItem key={i} item={item} />
            ))}
            
            <div className="border-t-4 border-indigo-700 my-3" />
            {/* Logout – tetap button, karena bukan navigasi */}
            <button
              onClick={() => setIsLogoutModalOpen(true)}
              className={`flex items-center h-12 rounded transition-colors duration-200 w-full
                hover:bg-red-600 hover:text-white text-indigo-200
                ${isExpanded ? 'px-3' : 'justify-center'}
              `}
              data-tooltip-id="sidebar-tooltip"
              data-tooltip-content="Logout"
            >
              <FaSignOutAlt className="w-6 h-6" />
              {isExpanded && <span className="ml-3 text-sm font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* Hamburger button saat collapsed */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="fixed top-4 left-4 z-50 px-3 py-2 rounded bg-indigo-900 text-white hover:bg-indigo-700 shadow-lg"
        >
          <FaBars className="w-6 h-6" />
        </button>
      )}

      <ModalLogout 
        open={isLogoutModalOpen} 
        onClose={() => setIsLogoutModalOpen(false)} 
      />
    </>
  );
};

export default Sidebar;