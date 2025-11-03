import React, { useState, useEffect, useRef } from 'react';
import { FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';

function CCTVStream({ cctvId, onBack }) {
  const [status, setStatus] = useState('Connecting...');
  const imgRef = useRef(null);

  useEffect(() => {
    if (!cctvId || !imgRef.current) return;

    const img = imgRef.current;
    const streamUrl = `/api/video_feed?id=${cctvId}`;
    console.log(`Streaming dari ${streamUrl}`);

    const handleError = () => setStatus('Streaming Failed.');
    const handleLoad = () => setStatus('Streaming Active!');

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
      <h1 className="text-3xl font-bold mb-2 text-gray-800 border-b pb-2">Streaming CCTV #{cctvId}</h1>
      <div className="flex grid-cols-2 gap-4 my-2 justify-start">
        <div className="flex items-center space-x-2">
          <button
            onClick={onBack}
            className="bg-indigo-500 text-white px-2 py-1 rounded-lg hover:bg-indigo-600 transition text-sm"
          >
            Back
          </button>
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