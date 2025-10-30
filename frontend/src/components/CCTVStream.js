import React, { useState, useEffect, useRef } from 'react';
import { FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';

function CCTVStream({ cctvId, onBack }) {
  const [status, setStatus] = useState('Menghubungkan stream...');
  const imgRef = useRef(null);

  useEffect(() => {
    if (!cctvId || !imgRef.current) return;

    const img = imgRef.current;
    const streamUrl = `/api/video_feed?id=${cctvId}`;
    console.log(`Streaming dari ${streamUrl}`);

    const handleError = () => setStatus('Gagal memuat stream.');
    const handleLoad = () => setStatus('Stream aktif!');

    img.onerror = handleError;
    img.onload = handleLoad;
    img.src = streamUrl;

    return () => {
      img.onerror = null;
      img.onload = null;
    };
  }, [cctvId]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition text-sm"
          >
            ← Kembali
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Streaming CCTV #{cctvId}</h1>
        </div>
      </div>
      <div className="max-w-4xl w-full mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="border-2 border-indigo-200">
          <img
            ref={imgRef}
            alt="CCTV Stream"
            className="w-full h-auto object-cover"
          />
        </div>
        <div
          className={`mt-4 p-2 text-center font-semibold ${
            status.includes('Gagal') ? 'text-red-600' : 'text-green-600'
          } transition-colors duration-300`}
        >
          {status.includes('Gagal') ? 
          <FaExclamationTriangle className="inline mr-1 text-red-600" /> : <FaCheckCircle className="inline mr-1 text-green-600" />}
          {status}
        </div>
      </div>
    </div>
  );
}

export default CCTVStream;