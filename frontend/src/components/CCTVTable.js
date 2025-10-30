import React, { useEffect, useState } from 'react';
import { FaPlus, FaSlidersH } from 'react-icons/fa';

function CCTVTable({ onSelect }) {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/cctv_all')
      .then(res => res.json())
      .then(data => setData(data))
      .catch(err => console.error('Error fetching CCTV data:', err));
  }, []);

  const filtered = data.filter(cctv =>
    cctv.name.toLowerCase().includes(search.toLowerCase()) ||
    (cctv.location && cctv.location.toLowerCase().includes(search.toLowerCase())) ||
    cctv.ip_address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-6">
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Judul di kiri */}
        <h1 className="text-3xl font-bold text-gray-800 self-start">Daftar CCTV</h1>
        {/* Search bar dan tombol di kanan */}
        <div className="flex justify-end items-center space-x-2">
          <button
            className="bg-indigo-500 text-white px-2 py-1 rounded-lg hover:bg-indigo-600 transition"
          >
            <FaSlidersH className="w-6 h-6" />
          </button>
          <button
            className="bg-indigo-500 text-white px-2 py-1 rounded-lg hover:bg-indigo-600 transition"
          >
            <FaPlus className="w-6 h-6" />
          </button>
          <input
            type="text"
            placeholder="Search by name, loc., or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 px-2 py-1 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      <div className="w-full bg-white shadow-lg rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-indigo-200">
            <tr>
              <th className="border p-2 text-center text-indigo-800">No</th>
              <th className="border p-2 text-center text-indigo-800">Name</th>
              <th className="border p-2 text-center text-indigo-800">IP Address</th>
              <th className="border p-2 text-center text-indigo-800">Location</th>
              <th className="border p-2 text-center text-indigo-800">Status</th>
              <th className="border p-2 text-center text-indigo-800">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center text-gray-500 p-4">
                  Tidak ada data CCTV ditemukan.
                </td>
              </tr>
            ) : (
              filtered.map((cctv, index) => (
                <tr key={cctv.id} className="hover:bg-gray-50 transition">
                  <td className="border p-2 text-gray-600 text-center">{index + 1}</td>
                  <td className="border p-2 text-gray-600">{cctv.name}</td>
                  <td className="border p-2 text-gray-600 text-center">{cctv.ip_address}</td>
                  <td className="border p-2 text-gray-600">{cctv.location || '-'}</td>
                  <td className="border p-2 font-semibold text-center">
                    <span
                      className={`px-2 py-1 rounded text-white ${
                        cctv.enabled === true || cctv.enabled === 1 ? 'bg-green-600' : 'bg-red-600'
                      }`}
                    >
                      {cctv.enabled === true || cctv.enabled === 1 ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="border p-2 text-center">
                    {cctv.enabled === true || cctv.enabled === 1 ? (
                      <button
                        onClick={() => onSelect(cctv.id)}
                        className="bg-indigo-500 text-white px-3 py-1 rounded-lg hover:bg-indigo-600 transition text-sm"
                      >
                        Lihat Stream
                      </button>
                    ) : (
                      <button
                        disabled
                        className="bg-gray-300 text-gray-500 px-3 py-1 rounded-lg cursor-not-allowed text-sm"
                      >
                        Nonaktif
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CCTVTable;