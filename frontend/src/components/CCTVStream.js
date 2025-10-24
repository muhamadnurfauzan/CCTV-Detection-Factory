import React, { useState, useEffect, useRef } from 'react';

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <button
        onClick={onBack}
        className="self-start mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        ← Kembali
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Streaming CCTV #{cctvId}</h1>
      <div className="w-[75%] border-2 border-black shadow-lg rounded-lg overflow-hidden">
        <img
          ref={imgRef}
          alt="CCTV Stream"
          className="w-full h-auto"
        />
      </div>
      <div
        className={`mt-2 font-semibold ${
          status.includes('Gagal') ? 'text-red-600' : 'text-green-600'
        }`}
      >
        {status}
      </div>
    </div>
  );
}

export default CCTVStream;
