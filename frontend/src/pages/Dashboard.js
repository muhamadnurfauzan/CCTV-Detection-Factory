// Dashboard.js (fix bar chart calculation)
import React, { useEffect, useState } from "react";
import SafeResponsiveContainer from "../components/SafeResponsiveContainer";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";

const Dashboard = () => {
  const [summary, setSummary] = useState({});
  const [topCCTV, setTopCCTV] = useState([]);
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [PPE_CLASSES, setPPE_CLASSES] = useState(false); // Placeholder, update via API

    useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
        setLoading(true);
        try {
        const [sRes, tRes, wRes] = await Promise.all([
            fetch("/api/dashboard/summary_today"),
            fetch("/api/dashboard/top_cctv_today"),
            fetch("/api/dashboard/weekly_trend"),
        ]);
        if (!mounted) return;
        const summaryData = sRes.ok ? await sRes.json() : { error: "Failed to fetch summary" };
        console.log("Summary response:", summaryData);
        if (!sRes.ok) console.warn('Summary fetch failed:', summaryData.error);
        else setSummary(summaryData);
        const topCCTVData = tRes.ok ? await tRes.json() : { error: "Failed to fetch top CCTV" };
        console.log("Top CCTV response:", topCCTVData);
        if (!tRes.ok) console.warn('Top CCTV fetch failed:', topCCTVData.error);
        else setTopCCTV(topCCTVData);
        const weeklyTrendData = wRes.ok ? await wRes.json() : { error: "Failed to fetch weekly trend" };
        console.log("Weekly trend response:", weeklyTrendData);
        if (!wRes.ok) console.warn('Weekly trend failed:', weeklyTrendData.error);
        else setWeeklyTrend(weeklyTrendData);
        } catch (e) {
        console.error("Dashboard fetch error", e);
        } finally {
        if (mounted) setLoading(false);
        }
    };
    fetchAll();
    return () => { mounted = false; };
    }, []);

  if (loading) return <div className="p-4">Loading dashboard...</div>;

  // Dinamisasi summaryData berdasarkan summary dari API
    const summaryData = Object.keys(summary).length > 0
    ? Object.entries(summary).map(([name, count]) => ({
        name,
        count: count === "0" ? "0" : count, // Pastikan "0" tetap string, "-" utuh
        tooltip: count === "-" ? "No data for today" : ""
        }))
    : []; // Fallback kosong, backend harus lengkap

  // Transform topCCTV ke data bar chart
  console.log("topCCTV:", topCCTV); // Debug
  console.log("summary:", summary); // Debug
  const top5CCTV = topCCTV.slice(0, 5);
  const paddedCCTV = top5CCTV.length < 5
    ? [...top5CCTV, ...Array(5 - top5CCTV.length).fill(null).map((_, i) => ({ id: `N/A-${i + 1}`, name: "N/A", location: "N/A", total: 0 }))]
    : top5CCTV;

    const barData = paddedCCTV.map(cctv => {
    const total = cctv.total || 0;
    const totalSummary = Object.values(summary).reduce((sum, val) => sum + (val === "-" ? 0 : parseInt(val)), 0) || 1;
    return {
        name: cctv.name || `Cam ${cctv.id}`,
        ...Object.keys(summary).reduce((acc, type) => {
        const count = summary[type] === "-" ? 0 : parseInt(summary[type]);
        const proporsi = totalSummary > 0 ? count / totalSummary : 0;
        return { ...acc, [type]: Math.max(0, Math.floor(total * proporsi)) };
        }, {})
    };
    }) || [{ name: "No Data", ...Object.keys(summary).reduce((acc, type) => ({ ...acc, [type]: 0 }), {}) }];

  // Pad weekly trend dengan 7 hari
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - i));
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toISOString().split('T')[0];
    const trendData = weeklyTrend.find(d => d.date === dateStr) || { date: dateStr, value: 0 };
    return { ...trendData, day };
  });
  const isToday = (d, index) => d.date === today.toISOString().split('T')[0] && index === 6; // Hari ini Selasa, index 6

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Dashboard</h2>

      <div className="mb-6">
        <h3 className="font-medium">Summary</h3>
        <div className="grid grid-cols-5 gap-4">
          {summaryData.map(({ name, count, tooltip }) => (
            <div key={name} className="p-2 bg-white rounded shadow">
              <p className="text-sm text-gray-600">{name}</p>
              <p className="text-lg font-bold" title={tooltip}>{count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-medium">Top CCTV Today</h3>
        <SafeResponsiveContainer height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {Object.keys(summary).map((type, i) => (
              <Bar key={type} dataKey={type} stackId="a" fill={['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#ff4500'][i % 5]} />
            ))}
          </BarChart>
        </SafeResponsiveContainer>
      </div>

      <div>
        <h3 className="font-medium mb-2">Weekly Trend</h3>
        <SafeResponsiveContainer height={320}>
          <LineChart data={days}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip formatter={(value, name, props) => [value, props.payload.date]} />
            <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={true} />
            {days.map((d, i) => isToday(d, i) && <Line key="today" type="monotone" dataKey="value" stroke="red" dot={{ r: 6 }} />)}
          </LineChart>
        </SafeResponsiveContainer>
        {days.every(d => d.value === 0) && <p className="text-sm text-gray-500 mt-2">No violation data for the last 7 days.</p>}
      </div>
    </div>
  );
};

export default Dashboard;