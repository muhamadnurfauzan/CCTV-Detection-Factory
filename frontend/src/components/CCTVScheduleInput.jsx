// components/CCTVScheduleInput.jsx
import React, { useState, useEffect } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { FaCheckCircle, FaAngleDown } from 'react-icons/fa';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thr', 'Fri', 'Sat'];
const TIME_SLOTS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_SLOTS.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
}
TIME_SLOTS.push('24:00');

const PRESETS = [
  { label: 'Morning Shift', value: { days: [1,2,3,4], start_time: "07:30", end_time: "16:30" } },
  { label: 'Friday Shift', value: { days: [5], start_time: "07:30", end_time: "16:00" } },
  { label: 'Evening Shift', value: { days: [1,2,3,4,5], start_time: "16:30", end_time: "23:30" } },
  { label: 'Night Shift', value: { days: [1,2,3,4,5], start_time: "23:30", end_time: "07:30" } },
];

export default function CCTVScheduleInput({ cctvId, onScheduleChange }) {
  const [schedules, setSchedules] = useState([]);
  const [confirmOverlap, setConfirmOverlap] = useState(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cctvId) {
      setLoading(true);
      setError('');
      fetch(`/api/cctv_schedules/${cctvId}`) 
        .then(r => {
          if (!r.ok) throw new Error(`Failed to load schedule: Status ${r.status}`);
          return r.json();
        })
        .then(data => {
          setSchedules(groupByTime(data));
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setSchedules([]);
          setLoading(false);
        });
    } else {
      setSchedules([]);
    }
  }, [cctvId]);

  useEffect(() => {
    onScheduleChange?.(schedules);
  }, [schedules]);

  const groupByTime = (rows) => {
    const map = {};
    rows.forEach(r => {
      const key = `${r.start_time}-${r.end_time}`;
      if (!map[key]) map[key] = { days: [], start_time: r.start_time, end_time: r.end_time };
      map[key].days.push(r.day_of_week);
    });
    return Object.values(map);
  };

  const normalize = (t) => t === '24:00' ? '00:00' : t;

  const hasOverlap = (newSched, indexToSkip = -1) => {
    const newStart = normalize(newSched.start_time);
    const newEnd = normalize(newSched.end_time);
    const crossMidnight = newEnd === '00:00' && newStart !== '00:00';

    for (let i = 0; i < schedules.length; i++) {
      if (i === indexToSkip) continue;
      const ex = schedules[i];
      const exStart = normalize(ex.start_time);
      const exEnd = normalize(ex.end_time);
      const exCross = exEnd === '00:00' && exStart !== '00:00';

      const commonDay = newSched.days.some(d => ex.days.includes(d));
      if (!commonDay) continue;

      if (crossMidnight || exCross) {
        if (crossMidnight && exCross) return true;
        if (crossMidnight) return newStart >= exStart || exEnd > newStart;
        if (exCross) return exStart >= newStart || newEnd > exStart;
      } else {
        if (newStart < exEnd && newEnd > exStart) return true;
      }
    }
    return false;
  };

  // === HELPER: Tambah 9 jam ke waktu ===
  const addHoursToTime = (time, hours) => {
    const [h, m] = time.split(':').map(Number);
    let newH = h + hours;
    if (newH >= 24) newH -= 24;
    return `${newH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const applyPreset = (preset) => {
    const newSched = {
      days: preset.days,
      start_time: preset.start_time,
      end_time: preset.end_time
    };
    if (hasOverlap(newSched)) {
      setWarning('This preset overlaps with another schedule. Continue?');
      setConfirmOverlap({ action: 'add', sched: newSched });
    } else {
      setSchedules([...schedules, newSched]);
    }
  };

  const addSchedule = () => {
    const newStart = "07:30"; // Default start
    const newSched = { days: [1,2,3,4,5], start_time: newStart, end_time: addHoursToTime(newStart, 9) };
    if (hasOverlap(newSched)) {
      setWarning('New schedule overlaps. Continue?');
      setConfirmOverlap({ action: 'add', sched: newSched });
    } else {
      setSchedules([...schedules, newSched]);
    }
  };

  const updateSchedule = (idx, field, value) => {
    const oldSched = schedules[idx];
    const updated = [...schedules];
    const oldStart = oldSched.start_time;
    updated[idx][field] = value;

    if (field === 'start_time') {
      // Cek jika end_time adalah auto-set (old_start + 9h)
      const expectedEnd = addHoursToTime(oldStart, 9);
      if (oldSched.end_time === expectedEnd) {
        updated[idx].end_time = addHoursToTime(value, 9);
      }
    }

    if (hasOverlap(updated[idx], idx)) {
      setWarning('This update causes overlap. Continue?');
      setConfirmOverlap({ action: 'update', index: idx, field, value });
      return; // Tunggu konfirmasi
    }

    setError('');
    setSchedules(updated);
  };

  const handleConfirmOverlap = (confirm) => {
    if (confirm) {
      if (confirmOverlap.action === 'add') {
        setSchedules([...schedules, confirmOverlap.sched]);
      } else if (confirmOverlap.action === 'update') {
        const updated = [...schedules];
        updated[confirmOverlap.index][confirmOverlap.field] = confirmOverlap.value;
        setSchedules(updated);
      }
    }
    setWarning('');
    setConfirmOverlap(null);
  };

  const removeSchedule = (idx) => {
    setSchedules(schedules.filter((_, i) => i !== idx));
    setError('');
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-xl shadow-lg">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800">CCTV Detection Schedule</h3>
        <button 
          type="button"
          onClick={addSchedule} 
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          + Add Schedule
        </button>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button 
            type="button"
            key={i} 
            onClick={() => applyPreset(p.value)} 
            className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm hover:bg-green-200"
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-4 text-gray-500">Loading Schedule...</div>}
      {error && <div className="bg-red-100 p-3 rounded text-red-700">{error}</div>}

      {warning && (
        <div className="text-sm text-yellow-700 bg-yellow-100 p-2 mb-2 rounded border border-yellow-300">
          <p>{warning}</p>
          <div className="flex gap-3 mt-1">
            <button 
              type="button"
              onClick={() => handleConfirmOverlap(true)} 
              className="px-4 py-2 bg-yellow-600 text-white rounded"
            >
              Continue
            </button>
            <button 
              type="button"
              onClick={() => handleConfirmOverlap(false)} 
              className="px-4 py-2 bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List Jadwal */}
      <div className="space-y-4">
        {schedules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No schedule yet — CCTV only streaming
          </div>
        ) : (
          schedules.map((sched, idx) => (
            <div key={idx} className="p-4 border rounded-lg bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <span className="font-medium">Schedule {idx + 1}</span>
                <button 
                  type="button"
                  onClick={() => removeSchedule(idx)} 
                  className="text-red-600 text-sm"
                >
                  Remove
                </button>
              </div>

              {/* Dropdown Time seperti Zoom */}
              <div className="grid grid-cols-2 gap-4">
                <Listbox value={sched.start_time} onChange={v => updateSchedule(idx, 'start_time', v)}>
                  <Listbox.Button className="p-2 border rounded w-full text-left flex justify-between items-center">
                    <span>{sched.start_time}</span>
                    <FaAngleDown className="h-5 w-5 text-gray-400" />
                  </Listbox.Button>
                  <Transition
                    as={React.Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute mt-1 max-h-60 max-w-72 overflow-auto bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm rounded-md z-10">
                      {TIME_SLOTS.map((t, i) => (
                        <Listbox.Option
                          key={i}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'}`
                          }
                          value={t.replace('24:00', '00:00')}
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                {t === '24:00' ? '00:00 (Next Day)' : t}
                              </span>
                              {selected ? (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                  <FaCheckCircle className="h-5 w-5" aria-hidden="true" />
                                </span>
                              ) : null}
                            </>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </Listbox>

                <Listbox value={sched.end_time} onChange={v => updateSchedule(idx, 'end_time', v)}>
                  <Listbox.Button className="p-2 border rounded w-full text-left flex justify-between items-center">
                    <span>{sched.end_time}</span> {/* FIXED: sched.end_time bukan start_time */}
                    <FaAngleDown className="h-5 w-5 text-gray-400" />
                  </Listbox.Button>
                  <Transition
                    as={React.Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute mt-1 max-h-60 max-w-72 overflow-auto bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm rounded-md z-10">
                      {TIME_SLOTS.map((t, i) => (
                        <Listbox.Option
                          key={i}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'}`
                          }
                          value={t.replace('24:00', '00:00')}
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                {t === '24:00' ? '00:00 (Next Day)' : t}
                              </span>
                              {selected ? (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                  <FaCheckCircle className="h-5 w-5" aria-hidden="true" />
                                </span>
                              ) : null}
                            </>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </Listbox>
              </div>

              <div className="grid grid-cols-7 gap-2 mt-4">
                {DAYS.map((day, i) => (
                  <label key={i} className="text-center">
                    <input
                      type="checkbox"
                      checked={sched.days.includes(i)}
                      onChange={e => {
                        const newDays = e.target.checked ? [...sched.days, i] : sched.days.filter(d => d !== i);
                        updateSchedule(idx, 'days', newDays);
                      }}
                    />
                    <span className="block text-xs">{day}</span>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-gray-500 mt-4">Overlap will be warned — confirm if intentional.</p>
    </div>
  );
}