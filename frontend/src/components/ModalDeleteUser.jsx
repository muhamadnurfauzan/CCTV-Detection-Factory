import React, { useState } from 'react';
import { FaTimes, FaTrash } from 'react-icons/fa';
import { useAlert } from './AlertProvider'; 
import RoleButton from './RoleButton';

export default function ModalDeleteUser({ open, onClose, onConfirm, userData }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { showAlert } = useAlert();
  
  const userId = userData?.id;

  const handleDelete = async () => {
    if (!userId) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/user-delete/${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onConfirm(userId); 
        onClose();
        showAlert(`User '${userData.full_name}' successfully deleted.`, 'success');
      } else {
        const err = await res.json();
        const errorMessage = err.error || 'Failed to delete user';
        setError(errorMessage);
        showAlert(`Failed to delete: ${errorMessage}`, 'error');
      }
    } catch {
      setError('Network error');
      showAlert('Network error: Unable to connect to server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-md w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
            <FaTrash className="w-6 h-6" /> Delete User?
        </h2>
        <button onClick={onClose} className="text-2xl text-gray-500 hover:text-red-500"><FaTimes className="w-6 h-6" /></button>
      </div>

      {userData?.role === 'super_admin' && (
        <p className="text-red-600 font-semibold mt-2">
          Warning: This is a Super Admin account.
        </p>
      )}

      <p className="text-sm text-gray-600 mb-6">
        Are you sure want to delete user <strong>{userData?.full_name}</strong> ({userData?.email} | {userData?.username})? This action cannot be cancelled.
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200 mb-4">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 border rounded-lg"
          disabled={submitting}
        >
          Cancel
        </button>
        <RoleButton
          allowedRoles={['super_admin']}
          type="button"
          onClick={handleDelete}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? 'Deleting...' : 'Delete'}
        </RoleButton>
      </div>
    </dialog>
  );
}