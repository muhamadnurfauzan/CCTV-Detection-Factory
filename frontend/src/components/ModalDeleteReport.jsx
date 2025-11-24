import React, { useState } from 'react';
import { FaTimes, FaTrash, FaFileImage } from 'react-icons/fa'; 
import { useAlert } from './AlertProvider'; 

export default function ModalDeleteReport({ open, onClose, onConfirm, reportData }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { showAlert } = useAlert();
  
  // reportId adalah ID pelanggaran, yang di frontend sebelumnya adalah report.id
  const reportId = reportData?.id; 

  const handleDelete = async () => {
    if (!reportId) return;

    setSubmitting(true);
    setError(null);
    try {
      // Panggil API DELETE. Sesuaikan URL dengan endpoint Flask Anda.
      const res = await fetch(`/api/reports_delete/${reportId}`, { 
        method: 'DELETE'
      });
      
      const data = await res.json();

      if (res.ok) {
        onConfirm(reportId); // Panggil fungsi untuk me-refresh data di Reports.jsx
        onClose();
        showAlert(`Violation Report ID ${reportId} successfully deleted.`, 'success');
      } else {
        const errorMessage = data.error || 'Failed to delete report';
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
            <FaTrash className="w-6 h-6" /> Delete Report?
        </h2>
        <button onClick={onClose} className="text-2xl text-gray-500 hover:text-red-500"><FaTimes className="w-6 h-6" /></button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Are you sure you want to delete this Violation Report (ID: <strong>{reportId}</strong>)?
      </p>
      
      <p className="text-sm text-red-600 mb-6 font-semibold flex items-center gap-2 p-3 bg-red-50 rounded-lg">
        <FaFileImage className="w-4 h-4" /> This action will also permanently delete the associated image from storage.
      </p>

      {/* Detail Ringkas */}
      <div className='mb-6 text-xs text-gray-700 space-y-1 bg-gray-50 p-3 rounded-lg'>
          <p><strong>CCTV:</strong> {reportData?.cctv_name}</p>
          <p><strong>Violation:</strong> {reportData?.violation_name}</p>
          <p><strong>Date:</strong> {reportData?.timestamp ? new Date(reportData.timestamp).toLocaleString() : 'N/A'}</p>
      </div>


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
        <button
          type="button"
          onClick={handleDelete}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </dialog>
  );
}