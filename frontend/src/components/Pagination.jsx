import React from 'react';
import { FaAngleLeft, FaAngleRight } from 'react-icons/fa';

/**
 * Komponen Pagination untuk navigasi halaman dan pengaturan item per halaman.
 * @param {object} props
 * @param {number} props.totalItems - Total item data yang tersedia.
 * @param {number} props.itemsPerPage - Jumlah item yang ditampilkan per halaman.
 * @param {number} props.currentPage - Halaman yang sedang aktif.
 * @param {function} props.onPageChange - Callback saat halaman berubah.
 * @param {function} props.onItemsPerPageChange - Callback saat item per halaman berubah.
 */
export default function Pagination({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
}) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const options = [10, 25, 50]; // Opsi default jumlah data per halaman

  // Cegah rendering jika tidak ada item
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between p-4 mt-1 bg-white border-t rounded-b-lg">
      
      {/* Kontrol Halaman */}
      <div className="flex items-center space-x-2 text-sm">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          title="Previous Page"
        >
          <FaAngleLeft className="w-4 h-4" />
        </button>

        <span className="font-semibold text-gray-700 whitespace-nowrap">
          Page {currentPage} of {totalPages}
        </span>
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          title="Next Page"
        >
          <FaAngleRight className="w-4 h-4" />
        </button>
      </div>

      {/* Info Item dan Kontrol Items Per Page */}
      <div className="flex items-center space-x-4 text-sm mt-2 md:mt-0">
        <span className="text-gray-600 whitespace-nowrap">
          Showing {startItem} to {endItem} of {totalItems} entries
        </span>
        
        <label className="flex items-center space-x-2 text-gray-600">
          <span className="font-medium whitespace-nowrap">Show:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {options.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <span className="font-medium whitespace-nowrap">data per page</span>
        </label>
      </div>
    </div>
  );
}