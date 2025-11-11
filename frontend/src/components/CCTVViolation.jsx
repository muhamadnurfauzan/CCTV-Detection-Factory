// CCTVViolation.jsx
import React from 'react';

// Tambahkan prop startNo
export default function CCTVViolation({ cctvs, violations, configs, onToggle, startNo }) {
  // Hapus div rounded-lg shadow-lg di sini karena sudah dipindahkan ke parent
  return (
    <> 
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-indigo-200 text-center">
          <tr>
            <th className="border-r p-2 text-indigo-800">No</th>
            <th className="border-r p-2 text-indigo-800">Name</th>
            <th className="border-r p-2 text-indigo-800">Location</th>
            {violations.map(v => (
              <th key={v.id} className="border-r p-2 text-center text-indigo-800 whitespace-nowrap">
                {v.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {cctvs.length === 0 ? (
            <tr>
              <td colSpan={3 + violations.length} className="text-center text-gray-500 p-4">
                No CCTV matches your search.
              </td>
            </tr>
          ) : (
            cctvs.map((cctv, i) => (
              <tr key={cctv.id} className="hover:bg-gray-50 transition">
                {/* Penomoran berdasarkan startNo */}
                <td className="border-r p-2 text-center text-gray-600">{startNo + i}</td>
                <td className="border-r p-2 text-gray-700">{cctv.name}</td>
                <td className="border-r p-2 text-gray-600">{cctv.location || '-'}</td>
                {violations.map(v => (
                  <td key={v.id} className="border-r p-2 text-center">
                    <input
                      type="checkbox"
                      checked={(configs[cctv.id] || []).includes(v.id)}
                      onChange={() => onToggle(cctv.id, v.id)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}