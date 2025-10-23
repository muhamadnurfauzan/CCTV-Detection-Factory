import React, { useState } from 'react';
import CCTVTable from './components/CCTVTable';
import CCTVStream from './components/CCTVStream';

function App() {
  const [selectedId, setSelectedId] = useState(null);

  return (
    <>
      {!selectedId ? (
        <CCTVTable onSelect={setSelectedId} />
      ) : (
        <CCTVStream cctvId={selectedId} onBack={() => setSelectedId(null)} />
      )}
    </>
  );
}

export default App;
