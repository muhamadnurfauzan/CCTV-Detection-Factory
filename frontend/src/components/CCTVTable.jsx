// CCTVTable.jsx
import React from 'react';
import { FaEye, FaEyeSlash, FaPenSquare, FaTrash } from 'react-icons/fa';
import RoleButton from './RoleButton';

// Tambahkan prop startNo
function CCTVTable({ cctvs, onSelect, onEdit, onDelete, startNo }) {
  // Hapus div rounded-lg shadow-lg di sini karena sudah dipindahkan ke parent
  return (
    <> 
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-indigo-200 text-center">
          <tr>
            <th className="border-r p-2 text-indigo-800">No</th>
            <th className="border-r p-2 text-indigo-800">Name</th>
            <th className="border-r p-2 text-indigo-800">IP Address</th>
            <th className="border-r p-2 text-indigo-800">Location</th>
            <th className="border-r p-2 text-indigo-800">Status</th>
            <th className="p-2 text-indigo-800">Action</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-200'>
          {cctvs.length === 0 ? (
            <tr>
              <td colSpan="6" className="text-center text-gray-500 p-4">
                No CCTV matches your search.
              </td>
            </tr>
          ) : (
            cctvs.map((cctv, i) => (
              <tr key={cctv.id} className="hover:bg-gray-50 transition">
                {/* Penomoran berdasarkan startNo */}
                <td className="border-r p-2 text-center text-gray-600">{startNo + i}</td>
                <td className="border-r p-2 text-gray-700">{cctv.name}</td>
                <td className="border-r p-2 text-center text-gray-600">{cctv.ip_address}</td>
                <td className="border-r p-2 text-gray-600">{cctv.location || '-'}</td>
                <td className="border-r p-2 text-center items-center">
                  <span
                    className={`px-2 py-1 rounded-full text-white text-xs font-medium ${
                      cctv.enabled ? 'bg-green-600' : 'bg-red-600'
                    }`}
                  >
                    {cctv.enabled ? 'Active' : 'Nonactive'}
                  </span>
                </td>
                <td className="p-2 text-center space-x-2 whitespace-nowrap">
                  <div className="flex flex-col sm:flex-row justify-center items-center gap-2 transition-all duration-300 ease-in-out">
                      {/* Tombol View/Enabled */}
                      {cctv.enabled ? (
                          <RoleButton
                            allowedRoles={['super_admin', 'cctv_editor', 'report_viewer', 'viewer']}
                            onClick={() => onSelect(cctv.id)}
                            className="text-indigo-600 hover:text-indigo-800 transition p-1 rounded-full bg-indigo-100" 
                          >
                            <FaEye className="w-5 h-5" />
                          </RoleButton>
                      ) : (
                          <button 
                            disabled 
                            className='p-1 rounded-full bg-gray-100'>
                            <FaEyeSlash className="w-5 h-5 text-gray-400" />
                          </button>
                      )}
                      
                      {/* Tombol Edit */}
                      <RoleButton
                        allowedRoles={['super_admin', 'cctv_editor']}
                        onClick={() => onEdit(cctv.id)}
                        className="text-green-600 hover:text-green-800 transition p-1 rounded-full bg-green-100"
                      >
                        <FaPenSquare className="w-5 h-5" />
                      </RoleButton>
                      
                      {/* Tombol Delete */}
                      <RoleButton
                        allowedRoles={['super_admin', 'cctv_editor']}
                        onClick={() => onDelete(cctv.id)}
                        className="text-red-600 hover:text-red-800 transition p-1 rounded-full bg-red-100"
                      >
                        <FaTrash className="w-5 h-5" />
                      </RoleButton>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

export default CCTVTable;