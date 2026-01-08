// Sidebar.jsx – VERSI FINAL (Menu Utama di Atas, Users/Settings/Logout di Bawah)
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaHome, FaVideo, FaImages, FaBullhorn, FaUsers, FaCog, FaSignOutAlt, FaBars, FaTimes } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import ModalLogout from './ModalLogout';
import { useAuth } from '../context/AuthContext';

const mainNavItems = [
  { path: "/", label: "Dashboard", Icon: FaHome, allowedRoles: ['super_admin', 'report_viewer', 'viewer'] },
  { path: "/cctv", label: "CCTVs", Icon: FaVideo, allowedRoles: ['super_admin', 'report_viewer', 'viewer'] },
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
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 640);
  const { user } = useAuth();

  React.useEffect(() => {
    const handleResize = () => {
        setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sidebarVariants = {
    expanded: { width: "14rem", x: 0, transition: { duration: 0.4, ease: "circOut" } },
    collapsed: { width: "5rem", x: 0, transition: { duration: 0.4, ease: "circOut" } },
    mobile: { width: "0rem", x: -100, transition: { duration: 0.4 } }
  };

  const MotionLink = motion(Link); 

  const NavItem = ({ item }) => {
    const { path, label, Icon, allowedRoles } = item;
    if (allowedRoles && !allowedRoles.includes(user?.role)) return null;

    const isActive = location.pathname === path;
    
    return (
      <MotionLink
        layout
        to={path}
        className={`relative z-10 flex items-center h-12 rounded transition-colors duration-200 w-full overflow-hidden
          ${isActive ? 'bg-indigo-700 text-white shadow-md' : 'text-indigo-200 hover:bg-indigo-700 hover:text-white'}
          ${isExpanded ? 'px-3' : 'justify-center'}`}
        data-tooltip-id="sidebar-tooltip"
        data-tooltip-content={label}
      >
        <Icon className="w-6 h-6 flex-shrink-0" />
        
        <AnimatePresence> 
          {isExpanded && (
            <motion.span
              key="nav-label"
              // initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden"
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </MotionLink>
    );
  };

  const activeVariant = isExpanded 
    ? "expanded" 
    : (isMobile ? "mobile" : "collapsed");

  return (
    <>
      {!isExpanded && <Tooltip id="sidebar-tooltip" place="right" style={{ borderRadius: '0.375rem', zIndex: 50 }} />}

      <motion.nav
        initial={false}
        animate={activeVariant}
        variants={sidebarVariants}
        className="fixed inset-y-0 left-0 z-40 flex flex-col bg-indigo-900 text-indigo-300 shadow-2xl overflow-hidden"
      >
        <div className="flex flex-col h-full p-3">
          {/* Header */}
          <div className={`flex items-center h-12 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
            <AnimatePresence mode="wait">
              {isExpanded ? (
                <motion.span 
                  key="logo-full"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-xl font-bold text-white whitespace-nowrap"
                >
                  PPE DETECTION
                </motion.span>
              ) : (
                <motion.span 
                  key="logo-short"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-xl font-bold text-white"
                >
                  
                </motion.span>
              )}
            </AnimatePresence>
            
            {isExpanded && (
              <motion.button 
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                onClick={() => setIsExpanded(false)} 
                className="p-1 rounded hover:bg-indigo-700 text-white"
              >
                <FaTimes className="w-6 h-6"/>
              </motion.button>
            )}
          </div>

          <div className='border-t-4 border-indigo-700 my-2' />
          
          {/* MENU UTAMA */}
          <ul className="space-y-2 flex-1">
            {mainNavItems.map((item, i) => (
              <li key={i}><NavItem item={item} /></li>
            ))}
          </ul>

          {/* MENU BAWAH */}
          <div className="space-y-2">
            {bottomNavItems.map((item, i) => (
              <NavItem key={i} item={item} />
            ))}
            
            <div className="border-t-4 border-indigo-700 my-3" />
            <motion.button
              layout 
              onClick={() => setIsLogoutModalOpen(true)}
              className={`flex items-center h-12 rounded transition-all duration-200 w-full overflow-hidden
                hover:bg-red-600 hover:text-white text-indigo-200
                ${isExpanded ? 'px-3' : 'justify-center'}
              `}
              data-tooltip-id="sidebar-tooltip"
              data-tooltip-content={isExpanded ? "" : "Logout"}
            >
              <FaSignOutAlt className="w-6 h-6 flex-shrink-0" />
              
              <AnimatePresence mode="wait">
                {isExpanded && (
                  <motion.span
                    key="logout-text"
                    // initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden"
                  >
                    Logout
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.nav>

      {/* Hamburger button (Framer Motion Hover effect) */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.button
            key="hamburger"
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsExpanded(true)}
            className="fixed top-2 left-2 sm:top-4 sm:left-4 z-50 px-3 py-2 rounded bg-indigo-900 text-white hover:bg-indigo-700 shadow-lg"
          >
            <FaBars className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <ModalLogout 
        open={isLogoutModalOpen} 
        onClose={() => setIsLogoutModalOpen(false)} 
      />
    </>
  );
};

export default Sidebar;