import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from "recharts";

const Dashboard = () => {
  const [summary, setSummary] = useState({});
  const [topCCTV, setTopCCTV] = useState([]);
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [res1, res2, res3] = await Promise.all([
          fetch("/api/dashboard/summary_today"),
          fetch("/api/dashboard/top_cctv_today"),
          fetch("/api/dashboard/weekly_trend"),
        ]);
        setSummary(await res1.json());
        setTopCCTV(await res2.json());
        setWeeklyTrend(await res3.json());
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return <div className="text-center mt-10 text-gray-600">Loading dashboard...</div>;
  }

  const hasSummary = Object.keys(summary).length > 0;
  const isBrowser = typeof window !== "undefined";

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-semibold mb-6">Dashboard Monitoring PPE</h1>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-10">
        {hasSummary ? (
          Object.entries(summary).map(([name, value]) => (
            <div
              key={name}
              className="bg-white rounded-2xl shadow-md hover:shadow-lg transition p-4 flex flex-col items-center text-center"
            >
              <span className="font-semibold text-gray-700 capitalize">{name.replace("no-", "No- ")}</span>
              <span className="text-3xl font-bold text-red-600 mt-2">
                {value === "-" ? "–" : value}
              </span>
            </div>
          ))
        ) : (
          <p className="col-span-full text-center text-gray-500">
            Tidak ada data pelanggaran hari ini
          </p>
        )}
      </div>

      {/* Section 2: Top CCTV Chart + Weekly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Top CCTV */}
        <div className="bg-white rounded-2xl shadow-md p-5">
          <h2 className="text-lg font-semibold mb-4">Top CCTV Berdasarkan Total Pelanggaran Hari Ini</h2>
          {isBrowser && topCCTV?.length > 0 ? (
            <div style={{ width: "100%", height: 350 }}>
              <ResponsiveContainer>
                <BarChart data={topCCTV} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis dataKey="cctv_name" />
                  <YAxis ticks={[0, 20, 40, 60, 80, 100, 120]} />
                  <Tooltip />
                  {topCCTV[0]?.breakdown?.map((v, i) => (
                    <Bar
                      key={i}
                      dataKey={(row) => {
                        const found = row.breakdown?.find(b => b.violation === v.violation);
                        return found ? found.total : 0;
                      }}
                      name={v.violation}
                      fill={`hsl(${(i * 70) % 360}, 70%, 60%)`}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 text-center">Tidak ada data CCTV hari ini</p>
          )}
        </div>

        {/* Line Chart - Weekly Trend */}
        <div className="bg-white rounded-2xl shadow-md p-5">
          <h2 className="text-lg font-semibold mb-4">Tren Total Pelanggaran 7 Hari Terakhir</h2>
          {isBrowser && weeklyTrend?.length > 0 ? (
            <div style={{ width: "100%", height: 350 }}>
              <ResponsiveContainer>
                <LineChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis ticks={[0, 20, 40, 60, 80, 100, 120]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#f87171"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 text-center">Belum ada data mingguan</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;