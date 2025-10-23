import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [status, setStatus] = useState('Loading stream...');
  const imgRef = useRef(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) {
      console.error('Image ref is null');
      return;
    }

    const streamUrl = '/api/video_feed';
    console.log(`Attempting to load stream from ${streamUrl}`);

    // Pastikan gambar dimuat ulang jika koneksi berubah
    const handleError = () => setStatus('Error loading stream.');
    const handleLoad = () => setStatus('Stream connected!');

    img.onerror = handleError;
    img.onload = handleLoad;

    // Muat ulang gambar secara berkala untuk memastikan stream aktif
    const reloadInterval = setInterval(() => {
      if (img.src) {
        const newSrc = `${streamUrl}?t=${new Date().getTime()}`; // Tambah timestamp untuk memaksa reload
        img.src = newSrc;
      }
    }, 1000); // Reload setiap 1 detik (sesuaikan dengan kebutuhan)

    return () => {
      clearInterval(reloadInterval);
      img.onerror = null;
      img.onload = null;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">CCTV Monitoring Portal</h1>
      <div className="w-[75%] mt-6 border-2 border-black shadow-lg rounded-lg overflow-hidden">
        <img
          ref={imgRef}
          src="/api/video_feed"
          alt="CCTV Stream"
          className="w-full h-auto"
        />
      </div>
      <div className={`mt-2 ${status.includes('Error') ? 'text-red-600' : 'text-green-600'} font-bold`}>
        {status}
      </div>
    </div>
  );
}

export default App;