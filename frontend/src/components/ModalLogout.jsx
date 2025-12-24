// components/ModalLogout.jsx
import React, { useState } from 'react';
import { FaTimes, FaSignOutAlt } from 'react-icons/fa';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function ModalLogout({ open, onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout(); 
      onClose();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-red-600 flex items-center gap-3">
            <FaSignOutAlt className="w-7 h-7" />
            Logout Confirmation
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition"
            disabled={loading}
          >
            <FaTimes className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 text-lg">
            Are you sure you want to <span className="font-semibold text-red-600">log out</span>?
          </p>
          <p className="text-sm text-gray-500 mt-3">
            You will need to log in again to access the system.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-70 transition flex items-center gap-2"
          >
            {loading ? (
              <>Logging out...</>
            ) : (
              <>
                <FaSignOutAlt className="w-5 h-5" />
                Yes, Logout
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}