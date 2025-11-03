import React, { useEffect, useState } from "react";
import SafeResponsiveContainer from "../components/SafeResponsiveContainer"; 
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend, AreaChart, Area } from "recharts";
import { FaShieldAlt, FaVest, FaSocks, FaGlasses, FaMitten, FaExclamationTriangle} from 'react-icons/fa'

const Dashboard = () => {
  const [summary, setSummary] = useState({});
  const [topCCTV, setTopCCTV] = useState([]);
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dapatkan semua nama violation dari summary untuk digunakan sebagai kunci BarChart
  // --- Ambil semua jenis violation dari summary ---
  const violationKeys = Object.keys(summary).filter(key => key.startsWith('no-'));

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
        if (!sRes.ok) console.warn('Summary fetch failed:', summaryData.error);
        else setSummary(summaryData);
        
        const topCCTVData = tRes.ok ? await tRes.json() : { error: "Failed to fetch top CCTV" };
        if (!tRes.ok) console.warn('Top CCTV fetch failed:', topCCTVData.error);
        else setTopCCTV(topCCTVData);
        
        const weeklyTrendData = wRes.ok ? await wRes.json() : { error: "Failed to fetch weekly trend" };
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

  if (loading) return <div className="p-4 flex items-center justify-center h-screen bg-gray-100"><p className="text-xl font-semibold text-gray-700">Loading...</p></div>;

  // --- Summary Data (Card View) ---
  const summaryData = Object.keys(summary).length > 0
    ? Object.entries(summary).map(([name, count]) => ({
        name,
        count,
        tooltip: count === "-" ? "No data for today" : ""
      }))
    : [];
    
  // --- Top CCTV Data (Bar/Combo Chart View) ---
  const barData = topCCTV.map((cctv) => {
    const base = {
      label: `${cctv.name}\n(${cctv.location})`,
      name: cctv.name,
      location: cctv.location,
      total: cctv.total || 0, // pastikan default 0 jika tidak ada total
    };

    if (Array.isArray(cctv.breakdown)) {
      cctv.breakdown.forEach((b) => {
        base[b.violation] = Number(b.total);
      });
    }

    return base;
  });

  // --- Weekly Trend Data (Line Chart View) ---  
  // 1. Pra-pemrosesan: Buat Map untuk pencarian O(1) dan ekstrak tanggal YYYY-MM-DD
  const weeklyTrendMap = weeklyTrend.reduce((acc, item) => {
      // Ubah string date API ("Mon, 27 Oct 2025...") menjadi objek Date
      const dateObj = new Date(item.date);
      // Ambil string YYYY-MM-DD (format yang dicari)
      const dateKey = dateObj.toISOString().split('T')[0]; 
      
      // Pastikan value adalah angka (diconvert dari string API)
      acc[dateKey] = { date: dateKey, value: parseInt(item.value, 10) };
      return acc;
  }, {});

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    // Mundur 6 hari hingga 0 hari (untuk 7 hari)
    date.setDate(today.getDate() - (6 - i)); 
    
    const dateStr = date.toISOString().split('T')[0]; // Format '2025-10-27'
    
    // 2. Gunakan Map yang sudah dibuat untuk mencari data
    const trendData = weeklyTrendMap[dateStr] || { date: dateStr, value: 0 };
    
    // Label Sumbu X: Hari dan Tanggal
    return { 
        ...trendData, 
        day_label: date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit'}),
        date_full: dateStr
    };
  });
  
  // Custom Tooltip untuk Bar Chart
  const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      // payload[0].payload berisi objek CCTV lengkap
      const cctv = payload[0].payload; 
      return (
        <div className="bg-white p-3 border border-gray-300 shadow-lg text-sm rounded">
          <p className="font-bold text-lg mb-1">{cctv.name}</p>
          <p className="font-semibold mb-1">Location: {cctv.location}</p>
          <p className="mb-1 font-semibold">Today's total violations: <span className="text-blue-600">{cctv.total}</span></p>
          <hr className="my-1"/>
          {violationKeys.map((key) => (
            <p key={key}>
              <span className="text-gray-700">{key}:</span> 
              <span className="font-medium ml-2">{cctv[key] || 0}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };
  
  const COLOR_POOL = [
    "#1d4ed8", // biru
    "#059669", // hijau
    "#f59e0b", // kuning
    "#dc2626", // merah
    "#7c3aed", // ungu
    "#0ea5e9", // cyan
    "#9333ea", // violet
  ];

  const ICON_POOL = [FaSocks, FaMitten, FaGlasses, FaShieldAlt, FaVest, FaExclamationTriangle];

    // --- Buat peta warna & ikon dinamis ---
  const dynamicColorMap = violationKeys.reduce((acc, key, idx) => {
    acc[key] = COLOR_POOL[idx % COLOR_POOL.length];
    return acc;
  }, {});

  const dynamicIconMap = violationKeys.reduce((acc, key, idx) => {
    acc[key] = ICON_POOL[idx % ICON_POOL.length];
    return acc;
  }, {});

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Dashboard PPE Detection</h2>

      {/* Bagian 1: Summary Cards */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-700">Total Violations</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 place-items-center">
          {summaryData.length > 0 ? (
            summaryData.map(({ name, count, tooltip }, index) => {
              const color = dynamicColorMap[name] || "#6b7280";
              const Icon = dynamicIconMap[name] || FaExclamationTriangle;
              return (
                <div key={name} className="w-full p-4 bg-white rounded-xl shadow-lg border-l-4 transform transition duration-300 hover:scale-[1.03]" style={{ borderColor: color }}>
                  <div className="flex items-center space-x-3">
                    <Icon className="w-6 h-6" style={{ color }} />
                    <p className="text-sm font-medium text-gray-600 truncate" style={{ color }}>{name}</p>
                  </div>
                  <p className={`text-3xl font-extrabold mt-2 ${count === "-" ? "text-gray-400" : "text-gray-900"}`}title={tooltip}>{count === "-" ? "N/A" : count}</p>
                </div>
              );
            })
          ) : (
            <div className="col-span-full w-full p-4 bg-white rounded-xl shadow-lg text-center text-gray-500">No total summary violation for today.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bagian 2: Top CCTV Today - Combo Bar Chart */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">Top Camera by Total Violation</h3>
          <div className="p-6 bg-white rounded-xl shadow-lg">
            {barData.length > 0 ? (
              <SafeResponsiveContainer height={300}>
                <BarChart
                  data={barData}
                  margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={({ x, y, payload }) => {
                      const lines = payload.value.split("\n");
                      return (
                        <text x={x} y={y + 10} textAnchor="middle" fill="#6b7280" fontSize={12}>
                          {lines.map((line, i) => (
                            <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>
                              {line.trim()}
                            </tspan>
                          ))}
                        </text>
                      );
                    }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend
                    wrapperStyle={{ paddingTop: "10px" }}
                    formatter={(value) => (
                      <span
                        className="text-xs font-medium"
                        style={{ color: dynamicColorMap[value] || "#374151" }}
                      >
                        {value}
                      </span>
                    )}
                  />

                  {violationKeys.map((type) => {
                    const hasData = barData.some((item) => item[type] && item[type] > 0);
                    if (!hasData) return null;

                    return (
                      <Bar
                        key={type}
                        dataKey={type}
                        name={type}
                        fill={dynamicColorMap[type] || "#9ca3af"}
                        barSize={25}
                      />
                    );
                  })}
                </BarChart>
              </SafeResponsiveContainer>
            ) : (
              <div className="p-10 h-[328px] text-center text-gray-500">
                No data for top 5 camera by violation for today.
              </div>
            )}
          </div>
        </div>

        {/* Bagian 3: Weekly Trend - Line Chart */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">Weekly Trend</h3>
          <div className="p-6 bg-white rounded-xl shadow-lg">
            <SafeResponsiveContainer height={300}>
              <AreaChart data={days} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                <XAxis dataKey="day_label" />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(label, props) => props[0]?.payload?.date_full}
                  formatter={(value, name) => [value, "Total violations"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#1d4ed8"
                  strokeWidth={3}
                  fill="url(#color)"
                  dot={{ r: 4 }}
                  activeDot={{ r: 8 }}
                  name="Total Violation"
                />
                <defs>
                  <linearGradient id="color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </SafeResponsiveContainer>
            {days.every((d) => d.value === 0) && (
              <p className="text-sm text-gray-500 mt-2 text-center">
                No data in the past 7 days.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;