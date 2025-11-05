// pages/CCTVList.jsx
import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import CCTVTable from '../components/CCTVTable';
import CCTVStream from '../components/CCTVStream';
import { useParams } from 'react-router-dom';

const CCTVList = () => {
  return (
    <Routes>
      <Route index element={<CCTVTableWithRouting />} />
      <Route path="stream/:id" element={<CCTVStreamWrapper />} />
    </Routes>
  );
};

const CCTVTableWithRouting = () => {
  const navigate = useNavigate();
  const handleSelect = (id) => {
    navigate(`/cctv/stream/${id}`);  
  };
  return <CCTVTable onSelect={handleSelect} />;
};

const CCTVStreamWrapper = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const cctvId = parseInt(id, 10);

  if (isNaN(cctvId)) {
    return <div className="p-8 text-red-600">Invalid CCTV ID</div>;
  }

  return <CCTVStream cctvId={cctvId} onBack={() => navigate('/cctv')} />;
};

export default CCTVList;