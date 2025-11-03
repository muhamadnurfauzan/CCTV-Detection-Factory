// SafeResponsiveContainer.js
import React from 'react';
import { ResponsiveContainer } from 'recharts';

const SafeResponsiveContainer = ({ width = "100%", height = 300, children, style = {} }) => {
  return (
    <ResponsiveContainer width={width} height={height} style={style}>
      {children}
    </ResponsiveContainer>
  );
};

export default SafeResponsiveContainer;