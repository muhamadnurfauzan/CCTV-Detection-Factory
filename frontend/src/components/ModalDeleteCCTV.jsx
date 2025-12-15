// components/ModalDeleteCCTV.jsx
import React, { useState } from 'react';
import { FaTimes, FaTrash } from 'react-icons/fa';
import { useAlert } from './AlertProvider';
import RoleButton from './RoleButton';

export default function ModalDeleteCCTV({ open, onClose, onConfirm, cctvId }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { showAlert } = useAlert();

  const handleDelete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cctv-delete/${cctvId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onConfirm(cctvId); 
        onClose();
        showAlert(`CCTV ID ${cctvId} successfully deleted.`, 'success');
      } else {
        const err = await res.json();
        const errorMessage = err.error || 'Failed to delete CCTV';
        setError(errorMessage);
        showAlert(`Deletion Failed: ${errorMessage}`, 'error');
      }
    } catch {
      setError('Network error');
      showAlert('Network error: Could not connect to the server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-md w-full">
      <div className="flex justify-between items-center mb-6 border-b pb-2">
        <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
            <FaTrash className="w-6 h-6" /> Delete CCTV?
        </h2>
        <button onClick={onClose} className="text-2xl"><FaTimes /></button>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Are you sure want to delete this CCTV? This action cannot be cancelled.
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
          {submitting ? 'Delete...' : 'Delete'}
        </RoleButton>
      </div>
    </dialog>
  );
}