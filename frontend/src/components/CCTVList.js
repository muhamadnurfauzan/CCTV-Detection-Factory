import React, { useState, useEffect } from 'react';

function CCTVList({ onSelect }) {
  const [cctvList, setCctvList] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/cctv_list')
      .then(res => res.json())
      .then(data => setCctvList(data))
      .catch(err => console.error('Error fetching CCTV list:', err));
  }, []);

  const filtered = cctvList.filter(cctv =>
    cctv.name.toLowerCase().includes(search.toLowerCase()) ||
    (cctv.location && cctv.location.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Daftar CCTV Aktif</h1>

      <input
        type="text"
        placeholder="Cari CCTV berdasarkan nama atau lokasi..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-1/2 p-2 border rounded mb-6 shadow"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-3/4">
        {filtered.length === 0 && (
          <p className="text-gray-600 text-center col-span-full">Tidak ada CCTV ditemukan</p>
        )}
        {filtered.map(cctv => (
          <div
            key={cctv.id}
            onClick={() => onSelect(cctv.id)}
            className="cursor-pointer border bg-white shadow-md rounded-xl p-4 hover:shadow-xl transition"
          >
            <h2 className="font-bold text-lg text-gray-800 mb-2">{cctv.name}</h2>
            <p className="text-sm text-gray-600">{cctv.location || 'Tidak ada lokasi'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CCTVList;
