// components/ViolationConfigModal.jsx
import React, { useEffect, useState, useRef } from 'react';

export default function ViolationConfigModal({ open, onOpenChange }) {
  const [configs, setConfigs] = useState({});
  const [cctvs, setCctvs] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const dialogRef = useRef(null);

  // --- Handle dialog open/close ---
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  // --- Fetch data saat dialog buka ---
  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cctvRes, violRes] = await Promise.all([
          fetch('/api/cctv_all').then(r => r.json()),
          fetch('/api/object_classes').then(r => r.json())
        ]);

        const filteredViolations = violRes.filter(v => v.is_violation);
        setCctvs(cctvRes);
        setViolations(filteredViolations);

        const configPromises = cctvRes.map(cctv =>
          fetch(`/api/cctv_violations/${cctv.id}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => ({ [cctv.id]: data }))
        );
        const configsData = await Promise.all(configPromises);
        setConfigs(Object.assign({}, ...configsData));
      } catch (e) {
        setError('Failed');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [open]);

  const toggle = async (cctv_id, class_id) => {
    setSaving(prev => ({ ...prev, [`${cctv_id}-${class_id}`]: true }));
    const current = configs[cctv_id] || [];
    const newEnabled = current.includes(Number(class_id))
      ? current.filter(id => id !== Number(class_id))
      : [...current, Number(class_id)];

    try {
      const res = await fetch(`/api/cctv_violations/${cctv_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_class_ids: newEnabled })
      });

      if (!res.ok) throw new Error('Failed to save changes.');

      setConfigs(prev => ({ ...prev, [cctv_id]: newEnabled }));
    } catch (e) {
      alert('Failed to update configuration.');
      console.error(e);
    }
    setSaving(prev => ({ ...prev, [`${cctv_id}-${class_id}`]: false }));
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-6xl max-h-[80vh] p-6 bg-white rounded-xl shadow-2xl overflow-y-auto"
      onClose={handleClose}
      onClick={(e) => e.target === dialogRef.current && handleClose()} 
    >
      {/* Backdrop manual */}
      <div className="fixed inset-0 bg-black bg-opacity-50 -z-10" onClick={handleClose}></div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">Custom Configuration Violation PPE by CCTV</h3>
        <button
          onClick={handleClose}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          &times;
        </button>
      </div>

      {loading && <p className="text-center py-8">Loading...</p>}
      {error && <p className="text-red-500 text-center">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">No</th>
                <th className="border p-2 text-left">Name</th>
                <th className="border p-2 text-left">Location</th>
                {violations.map(v => (
                  <th key={v.id} className="border p-2 text-center whitespace-nowrap">
                    {v.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cctvs.map((cctv, i) => (
                <tr key={cctv.id} className="hover:bg-gray-50">
                  <td className="border p-2">{i + 1}</td>
                  <td className="border p-2 font-medium">{cctv.name}</td>
                  <td className="border p-2">{cctv.location || '-'}</td>
                  {violations.map(v => (
                    <td key={v.id} className="border p-2 text-center">
                      <input
                        type="checkbox"
                        checked={(configs[cctv.id] || []).includes(Number(v.id))}
                        onChange={() => toggle(cctv.id, v.id)}
                        disabled={saving[`${cctv.id}-${v.id}`]}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </dialog>
  );
}