import React, { useEffect, useState } from 'react';

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
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Daftar CCTV</h1>

      <input
        type="text"
        placeholder="Cari CCTV berdasarkan nama, lokasi, atau IP..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-1/2 p-2 border rounded mb-6 shadow"
      />

      <div className="w-4/5 bg-white shadow-lg rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-200">
            <tr>
              <th className="border p-2 text-left">No</th>
              <th className="border p-2 text-left">Name</th>
              <th className="border p-2 text-left">IP Address</th>
              <th className="border p-2 text-left">Location</th>
              <th className="border p-2 text-left">Status</th>
              <th className="border p-2 text-center">Action</th>
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
                  <td className="border p-2">{index + 1}</td>
                  <td className="border p-2">{cctv.name}</td>
                  <td className="border p-2">{cctv.ip_address}</td>
                  <td className="border p-2">{cctv.location || '-'}</td>
                  <td className="border p-2 font-semibold">
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
                            className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 transition"
                        >
                            Lihat Stream
                        </button>
                        ) : (
                        <button
                            disabled
                            className="bg-gray-400 text-white px-4 py-1 rounded cursor-not-allowed"
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
