import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [status, setStatus] = useState('Loading stream...');

  // Use proxy path '/api/video_feed' so Node server can proxy to Flask backend and avoid CORS
  const streamUrl = '/api/video_feed';

  return (
    <div style={{ textAlign: 'center', fontFamily: 'Arial, sans-serif', background: '#f4f4f4', padding: '20px' }}>
      <h1>CCTV Monitoring Portal</h1>
      <div style={{ maxWidth: '80%', margin: '20px auto', border: '2px solid #000', borderRadius: '8px', overflow: 'hidden' }}>
        <img
          src={streamUrl}
          alt="CCTV Stream"
          onLoad={() => setStatus('Stream connected!')}
          onError={() => setStatus('Error loading stream.')}
          style={{ width: '100%', height: 'auto' }}
        />
      </div>
      <div style={{ color: status.includes('Error') ? 'red' : 'green', fontWeight: 'bold' }}>{status}</div>
    </div>
  );
}

export default App;