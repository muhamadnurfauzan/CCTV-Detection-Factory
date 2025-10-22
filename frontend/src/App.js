import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

function App() {
  const videoRef = useRef(null);

  const handleHlsEvents = (hls, attempt) => {
    return () => {
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed, playing video');
        videoRef.current.play().catch(err => console.error('Playback error:', err));
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error(`HLS error attempt ${attempt}:`, data);
        hls.destroy();
      });
    };
  };

  useEffect(() => {
    const video = videoRef.current;
    const hlsUrl = '/api/video_feed';
    console.log(`Attempting to load HLS stream from ${hlsUrl}`);

    const loadHls = async () => {
      if (Hls.isSupported()) {
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            const hls = new Hls();
            await new Promise(resolve => setTimeout(resolve, 3000 * (attempts + 1))); // 3, 6, 9 detik
            console.log(`Loading HLS attempt ${attempts + 1}/${maxAttempts}`);
            hls.loadSource(hlsUrl);
            hls.attachMedia(video);
            handleHlsEvents(hls, attempts + 1)();
            return () => hls.destroy();
          } catch (err) {
            console.error(`HLS load failed attempt ${attempts + 1}:`, err);
            attempts++;
          }
        }
        console.error('Failed to load HLS after all attempts');
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('Native HLS support detected');
        await new Promise(resolve => setTimeout(resolve, 3000));
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          console.log('Native HLS metadata loaded, playing video');
          video.play().catch(err => console.error('Playback error:', err));
        });
      } else {
        console.error('HLS not supported');
      }
    };

    loadHls();
  }, []);

  return (
    <div>
      <h1>CCTV PPE Detection</h1>
      <video ref={videoRef} controls style={{ width: '100%', maxWidth: '1280px' }}></video>
    </div>
  );
}

export default App;