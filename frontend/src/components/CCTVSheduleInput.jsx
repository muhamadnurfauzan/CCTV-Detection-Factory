// components/CCTVScheduleInput.jsx
import React, { useState, useEffect } from 'react';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const TIME_SLOTS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    TIME_SLOTS.push(time);
  }
}
// Tambahkan 24:00 sebagai alias 00:00
TIME_SLOTS.push('24:00');

export default function CCTVScheduleInput({ cctvId, onScheduleChange }) {
  const [schedules, setSchedules] = useState([]); // [{ days: [1,2,3], start_time: "07:00", end_time: "17:00" }]

  // Hanya fetch jika cctvId ada (edit mode)
  useEffect(() => {
    if (cctvId) {
      fetch(`/api/cctv_schedules/${cctvId}`)
        .then(r => r.json())
        .then(data => {
          const grouped = {};
          data.forEach(row => {
            const key = `${row.start_time}-${row.end_time}`;
            if (!grouped[key]) grouped[key] = { days: [], start_time: row.start_time, end_time: row.end_time };
            grouped[key].days.push(row.day_of_week);
          });
          setSchedules(Object.values(grouped));
        })
        .catch(() => setSchedules([]));
    } else {
      // Add mode → mulai dengan 1 jadwal kosong (opsional)
      setSchedules([{ days: [1,2,3,4,5], start_time: "07:00", end_time: "16:30" }]);
    }
  }, [cctvId]);

  useEffect(() => {
    onScheduleChange?.(schedules);
  }, [schedules, onScheduleChange]);

  const addSchedule = () => {
    setSchedules([...schedules, { days: [1,2,3,4,5], start_time: "07:00", end_time: "17:00" }]);
  };

  const updateSchedule = (index, field, value) => {
    const newSchedules = [...schedules];
    if (field === 'days') {
      newSchedules[index].days = value;
    } else {
      newSchedules[index][field] = value;
    }
    setSchedules(newSchedules);
  };

  const removeSchedule = (index) => {
    setSchedules(schedules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Detection Schedule</h3>
        <button type="button" onClick={addSchedule} className="text-sm text-blue-600 hover:underline">
          + Add Schedule
        </button>
      </div>

      {schedules.length === 0 && (
        <p className="text-sm text-gray-500 italic">No schedule → total dead detection</p>
      )}

      {schedules.map((sched, idx) => (
        <div key={idx} className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time</label>
              <select
                value={sched.start_time}
                onChange={e => updateSchedule(idx, 'start_time', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {TIME_SLOTS.map(t => (
                  <option key={t} value={t.replace('24:00', '00:00')}>{t === '24:00' ? '00:00 (Next Day)' : t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Finish Time</label>
              <select
                value={sched.end_time}
                onChange={e => updateSchedule(idx, 'end_time', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {TIME_SLOTS.map(t => (
                    <option key={t} value={t.replace('24:00', '00:00')}>{t === '24:00' ? '00:00 (Next Day)' : t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Day</label>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day, i) => (
                <label key={i} className="flex flex-col items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sched.days.includes(i)}
                    onChange={e => {
                      const checked = e.target.checked;
                      const newDays = checked
                        ? [...sched.days, i].sort()
                        : sched.days.filter(d => d !== i);
                      updateSchedule(idx, 'days', newDays);
                    }}
                    className="sr-only"
                  />
                  <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition
                    ${sched.days.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>
                    {day}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => removeSchedule(idx)}
            className="text-red-600 text-sm hover:underline"
          >
            Delete this schedule
          </button>
          
        </div>
      ))}
    </div>
  );
}