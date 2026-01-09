// CCTVStream.jsx - Versi Perbaikan
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaShieldAlt } from 'react-icons/fa';

function CCTVStream({ cctvId }) {
  const imgRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!cctvId || !imgRef.current) return;

    setIsLoaded(false);
    setError(false);

    imgRef.current.src = `/api/video-feed?id=${cctvId}`;

    return () => {
      if (imgRef.current) imgRef.current.src = "";
    };
  }, [cctvId]);

  return (
    <div className="max-w-4xl w-full mx-auto bg-white rounded-lg shadow-md overflow-hidden">
      <div className="relative bg-black rounded-lg overflow-hidden shadow-md aspect-video group">

        {/* LOADING STATE */}
        <AnimatePresence>
          {!isLoaded && !error && (
            <motion.div 
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10"
            >
              <FaShieldAlt className="text-indigo-500 text-5xl animate-bounce mb-4" />
              <p className="text-indigo-200 font-mono text-xs tracking-tighter">Connecting...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTUAL STREAM */}
        <img
          ref={imgRef}
          onLoad={() => setIsLoaded(true)}
          onError={() => setError(true)}
          alt="CCTV Stream"
          className={`w-full h-full object-contain transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </div>
  );
}

export default CCTVStream;