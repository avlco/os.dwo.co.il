import React from 'react';
import { LineChart as RechartsLine, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function LineChart({ data, dataKey, xKey, color = '#3b82f6', height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLine data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} stroke="#64748b" />
        <YAxis stroke="#64748b" />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} />
      </RechartsLine>
    </ResponsiveContainer>
  );
}