// CCTVStream.jsx
import React, { useState, useEffect, useRef } from 'react';

function CCTVStream({ cctvId }) {
  const imgRef = useRef(null);

  useEffect(() => {
    if (!cctvId || !imgRef.current) return;

    const img = imgRef.current;

    const loadImage = () => {
      const timestamp = Date.now();
      const streamUrl = `/api/video-feed?id=${cctvId}&t=${timestamp}`;
      img.src = streamUrl;
    };

    loadImage();

    return () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
  }, [cctvId]);

  return (
    <div className="max-w-4xl w-full mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="relative max-w-3xl w-full">
        <img
          ref={imgRef}
          alt={`CCTV ${cctvId} Stream`}
          className="w-full h-auto object-cover"
        />
      </div>
    </div>
  );
}

export default CCTVStream;