// CCTVStream.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FaExclamationTriangle, FaCheckCircle, FaRedo } from 'react-icons/fa';

function CCTVStream({ cctvId }) {
  const [status, setStatus] = useState('Connecting...');
  const [errorCount, setErrorCount] = useState(0);
  const imgRef = useRef(null);
  const maxRetries = 3;

  useEffect(() => {
    if (!cctvId || !imgRef.current) return;

    const img = imgRef.current;
    let retryCount = 0;

    const loadImage = () => {
      const timestamp = Date.now();
      const streamUrl = `/api/video_feed?id=${cctvId}&t=${timestamp}`;
      img.src = streamUrl;
      setStatus('Connecting...');
    };

    const handleLoad = () => {
      setStatus('Streaming Active!');
      setErrorCount(0);
    };

    const handleError = () => {
      retryCount++;
      setErrorCount(retryCount);
      if (retryCount <= maxRetries) {
        setStatus(`Reconnecting... (${retryCount}/${maxRetries})`);
        setTimeout(loadImage, 3000);  
      } else {
        setStatus('Stream Unavailable');
      }
    };

    img.onload = handleLoad;
    img.onerror = handleError;

    loadImage();

    return () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
  }, [cctvId]);

  return (
    <div className="max-w-4xl w-full mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="border-2 border-indigo-200 relative">
        <img
          ref={imgRef}
          alt={`CCTV ${cctvId} Stream`}
          className="w-full h-auto object-cover"
        />
        {status.includes('Unavailable') && (
          <button
            onClick={() => loadImage()} 
            className="absolute top-4 right-4 bg-red-600 text-white p-2 rounded-full hover:bg-red-700"
          >
            <FaRedo />
          </button>
        )}
      </div>

      <div
        className={`mt-4 p-3 text-center font-semibold transition-all ${
          status.includes('Failed') ? 'text-red-600' : 'text-green-600'
        }`}
      >
        {status.includes('Failed') ? (
          <FaExclamationTriangle className="inline mr-2" />
        ) : (
          <FaCheckCircle className="inline mr-2" />
        )}
        {status}
      </div>
    </div>
  );
}

export default CCTVStream;