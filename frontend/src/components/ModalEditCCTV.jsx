// components/ModalEditCCTV.jsx
import React, { useState, useRef, useEffect } from 'react';
import { FaTimes, FaCamera, FaPenSquare } from 'react-icons/fa';
import { useAlert } from './AlertProvider';
import CCTVScheduleInput from './CCTVScheduleInput';
import RoleButton from './RoleButton';

export default function ModalEditCCTV({ open, onClose, onUpdate, cctvData, violations = [] }) {  
  if (!open || !cctvData) return null;
  const [form, setForm] = useState({
    name: '',
    location: '',
    ip: '',
    port: '',
    token: '',
    enabled: false,
    url: ''
  });

  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [polygons, setPolygons] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const canvasRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [urlError, setUrlError] = useState('');
  const { showAlert } = useAlert();

  // === 1. Computed URL (fallback) ===
  const generateUrl = (ip, port, token) => {
    if (!ip || !port || !token) return '';
    return `rtsps://${ip}:${port}/${token}?enableSrtp`;
  };

  // === 2. Load data saat modal dibuka (Keluhan 1 & 3) ===
  useEffect(() => {
    if (open && cctvData) {
      const currentUrl = generateUrl(cctvData.ip_address, cctvData.port, cctvData.token);
      
      updateFieldsFromUrl(currentUrl);
      
      setForm({
        name: cctvData.name || '',
        location: cctvData.location || '',
        ip: cctvData.ip_address || '',
        port: cctvData.port || '',
        token: cctvData.token || '',
        enabled: cctvData.enabled || false,
        url: currentUrl
      });

      if (cctvData.area) {
        try {
          const areaData = typeof cctvData.area === 'string' 
            ? JSON.parse(cctvData.area) 
            : cctvData.area; 

          if (areaData?.items) {
            const formattedPolygons = areaData.items.map(item => ({
              name: item.name || "Unnamed Area",
              allowed_violations: item.allowed_violations || [],
              points: item.points.map(pt => ({ x: pt[0], y: pt[1] }))
            }));
            setPolygons(formattedPolygons);
          }
        } catch (e) {
          console.error("Gagal parse ROI data:", e);
        }
      }
      if (currentUrl) {
        autoFetchSnapshot(cctvData.ip_address, cctvData.port, cctvData.token);
      }
    }
  }, [open, cctvData]); 

  // === 3. Parse URL → update ip/port/token ===
  const updateFieldsFromUrl = (rawUrl) => {
    const url = rawUrl.trim();
    setUrlError('');

    if (!url) {
      setForm(prev => ({ ...prev, ip: '', port: '', token: '', url: '' }));
      return;
    }

    try {
    const u = new URL(url.replace('rtsps://', 'rtsp://')); 
    if (!['rtsp:', 'rtsps:'].includes(u.protocol)) {
      throw new Error('Input rtsp:// or rtsps://');
    }

    const ip = u.hostname;
    const port = u.port || '7447'; 
    const tokenWithQuery = u.pathname.slice(1) + u.search;
    
    const token = tokenWithQuery.replace('?enableSrtp', ''); 

    const ipSegments = ip.split('.');
    if (ipSegments.length !== 4 || ipSegments.some(seg => {
      const num = parseInt(seg, 10);
      return isNaN(num) || num < 0 || num > 255;
    })) {
      throw new Error('Invalid IP value (each segment must be 0-255).');
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/; 
    if (!ipRegex.test(ip)) throw new Error('Invalid IP structure.');

    setForm(prev => ({ ...prev, ip, port, token, url }));
    } catch (err) {
      setUrlError(err.message || 'Invalid URL'); 
    }
  };

  // === 4. Auto Fetch Snapshot on Load ===
  const autoFetchSnapshot = async (ip, port, token) => {
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/rtsp-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_address: ip, port: port, token: token })
      });
      if (res.ok) {
        const blob = await res.blob();
        setImageUrl(URL.createObjectURL(blob));
      }
    } catch (e) { console.error("Auto-snapshot failed", e); }
    finally { setPreviewLoading(false); }
  };

  // === 5. Load Stream Preview ===
  const loadStreamPreview = async () => {
    if (!form.url || urlError) {
      return showAlert('URL required and must be valid for stream preview.', 'warning');
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
        const res = await fetch('/api/rtsp-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            ip_address: form.ip, 
            port: form.port, 
            token: form.token 
        })
        });
        if (res.ok) {
        const blob = await res.blob();
        setImageUrl(URL.createObjectURL(blob));
        setDrawing(false);
      } else { 
        let errorMessage = 'Stream is not available. Check URL or network.';
        try {
            const err = await res.json();
            errorMessage = err.error || errorMessage;
        } catch {}
        
        setPreviewError(errorMessage);
        showAlert(errorMessage, 'error');
      }
    } catch (e) {
        setPreviewError(e.message || 'Network error');
        showAlert('Network error while trying to connect to stream.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  // === 6. Canvas Helpers ===
  const startDrawing = () => setDrawing(true);
  const clearDrawing = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    setPoints([]);
    setPolygons([]);
    setImageUrl(null); 
    setDrawing(false);
  };

  const handleCanvasClick = (e) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    
    // 1. Dapatkan dimensi canvas yang ditampilkan di browser
    const rect = canvas.getBoundingClientRect();
    
    // 2. Hitung posisi klik relatif terhadap elemen canvas (tanpa skala)
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // 3. Hitung faktor skala: (Resolusi Internal / Resolusi Tampilan)
    // canvas.width/height diisi oleh img.onload (Resolusi Asli)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // 4. Konversi koordinat tampilan ke koordinat resolusi asli
    const x = clickX * scaleX;
    const y = clickY * scaleY;
    
    // Tambahkan titik dengan koordinat yang sudah diskala
    setPoints(prev => [...prev, { x, y }]);
  };

  const closePolygon = () => {
    if (points.length < 3) return showAlert('Min 3 points.', 'warning');
    
    // Alih-alih langsung masuk ke state, buka form setting untuk ROI ini
    const newPolygon = {
        name: `Area ${polygons.length + 1}`,
        points: [...points],
        allowed_violations: [] 
    };
    
    setPolygons([...polygons, newPolygon]);
    setPoints([]);
    setDrawing(false);
  };

  // === 7. Gambar ROI Existing di Canvas ===
  useEffect(() => {
    if (imageUrl && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // --- Gambar semua polygon yang sudah tersimpan ---
        polygons.forEach((poly, index) => {
          ctx.beginPath();
          poly.points.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
            
          // Ganti ke warna Indigo/Ungu (Kontras tinggi terhadap lantai hijau)
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; 
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
          ctx.fill();

          // --- RENDER NAMA ROI ---
          if (poly.name) {
            ctx.font = "bold 40px Arial";
              
            // Buat "Shadow" agar teks terbaca di background gelap maupun terang
            ctx.shadowBlur = 4;
            ctx.shadowColor = "black";
            ctx.fillStyle = "white";
              
            // Gambar teks di titik koordinat pertama (x, y-10 agar tidak menempel garis)
            ctx.fillText(poly.name, poly.points[0].x, poly.points[0].y - 12);
              
            // Reset shadow agar tidak mempengaruhi gambar poligon lainnya
            ctx.shadowBlur = 0;
          }
        });
        
        // --- Gambar garis yang sedang dibuat (current points) ---
        if (drawing && points.length > 0) {
            ctx.beginPath();
            
            // 1. Gambar garis penghubung antar titik
            points.forEach((pt, i) => {
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            
            // 2. Gambar garis putus-putus ke titik awal (untuk menutup polygon)
            if (points.length > 1) {
                // Atur garis menjadi putus-putus untuk visualisasi yang lebih jelas 
                ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
                ctx.lineTo(points[0].x, points[0].y);
            }

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 5; // Ganti menjadi 2 agar tidak terlalu tebal
            ctx.stroke();
            
            // Hapus mode putus-putus untuk gambar selanjutnya
            ctx.setLineDash([]); 

            // 3. Gambar titik (dot) di atas garis
            points.forEach((pt) => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
                ctx.fillStyle = 'blue';
                ctx.fill();
            });
        }
      };
      img.src = imageUrl;
    }
  }, [imageUrl, polygons, points, drawing]);

  // === 8. Submit ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Validasi Dasar
    if (!form.name.trim()) return showAlert('CCTV Name is required.', 'warning');
    if (!form.ip || !form.port || !form.token) return showAlert('CCTV URL/Components required.', 'warning');

    setSubmitting(true);

    // SOLUSI ERROR: Gunakan canvasRef.current untuk mengakses elemen canvas
    const currentCanvas = canvasRef.current;

    // Ambil data area lama sebagai cadangan dimensi jika canvas tidak aktif
    const existingArea = typeof cctvData?.area === 'string' 
      ? JSON.parse(cctvData.area) 
      : cctvData?.area;

    // Bangun areaPayload dengan fallback dimensi (1280x720 atau data lama)
    const areaPayload = JSON.stringify({
      image_width: currentCanvas ? currentCanvas.width : (existingArea?.image_width || 1280),
      image_height: currentCanvas ? currentCanvas.height : (existingArea?.image_height || 720),
      items: polygons.map((p) => ({
        name: p.name,
        points: p.points.map(pt => [Math.round(pt.x), Math.round(pt.y)]),
        allowed_violations: p.allowed_violations 
      }))
    });

    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      ip_address: String(form.ip).trim(),
      port: String(form.port).trim(),
      token: String(form.token).trim(),
      enabled: form.enabled,
      area: areaPayload,
      schedules: form.schedules
    };

    try {
      const res = await fetch(`/api/cctv-update/${cctvData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to Update CCTV');
      }

      const updated = await res.json();

      onUpdate(cctvData.id, updated);
      onClose();
      showAlert(`CCTV '${updated.name}' successfully updated.`, 'success');
    } catch (err) {
      showAlert(err.message || 'Network error.', 'error'); 
    } finally {
      setSubmitting(false);
    }
  };

  // === RENDER ===
  return (
    <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6 border-b pb-2">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700">
            <FaPenSquare className="w-6 h-6" /> Update CCTV #{cctvData?.name}
        </h2>
        <button onClick={onClose} className="text-2xl"><FaTimes /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            {/* === Name === */}
            <label className="block text-sm font-medium text-gray-700 mb-1">CCTV Name *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            {/* === Location === */}
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
                required
              value={form.location}
              onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* === URL === */}
        <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">CCTV URL *</label>
            <div className="flex gap-2">
                <input
                equired
                type="text"
                value={form.url}
                placeholder="rtsps://[ip]:[port]/[token]?enableSrtp"
                onChange={e => {
                    const val = e.target.value;
                    setForm(prev => ({ ...prev, url: val }));
                    updateFieldsFromUrl(val);
                }}
                className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${
                    urlError ? 'border-red-500' : 'border-gray-300'
                }`}
                />
            </div>
            {urlError && <p className="text-xs text-red-600 mt-1">{urlError}</p>}
            <p className="text-xs text-gray-500 mt-1">Example: rtsps://192.168.x.x:xxxx/aBcdEfGhIj123456?enableSrtp</p>
        </div>

        {/* === ROI === */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">ROI Area *</label>
          {/* ROI DRAW */}
          <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
            <div className="flex justify-between">
              <p>Input CCTV URL first for drawing ROI!</p>
              <button 
              type="button" 
              onClick={loadStreamPreview} 
              disabled={previewLoading || !form.ip || !form.port || !form.token} 
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <FaCamera /> {previewLoading ? 'Loading...' : 'Take picture from stream'}
              </button>
            </div>
            
            {cctvData?.area && (
              <p className="text-sm text-yellow-700 bg-yellow-100 p-2 mb-2 rounded border border-yellow-300">
                <strong>Warning</strong>: This CCTV already has an existing ROI configuration. 
                Drawing a new ROI will <strong>overwrite</strong> it.
              </p>
            )}

            {previewError && <p className="text-sm text-red-600 bg-red-50 p-2 mb-2 rounded border border-red-200">{previewError}</p>}

            {imageUrl ? (
              <div className="space-y-2">
                <div className="flex gap-2 justify-center">
                  {/* Tombol Start/Drawing */}
                  <button 
                    type="button" 
                    onClick={startDrawing} 
                    className={`px-3 py-1 text-white text-xs rounded transition-all shadow-sm ${
                      drawing 
                      ? 'bg-orange-500 animate-pulse hover:bg-orange-600' 
                      : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {drawing ? 'Drawing...' : 'Start Drawing'}
                  </button>

                  {/* Tombol Close - Hanya muncul saat sedang menggambar */}
                  {drawing && (
                    <button 
                      type="button" 
                      onClick={closePolygon} 
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded shadow-md transition-all"
                    >
                      Close Polygon
                    </button>
                  )}

                  {/* Tombol Delete */}
                  <button 
                    type="button" 
                    onClick={clearDrawing}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded shadow-sm transition-all"
                  >
                    Delete All
                  </button>
                </div>

                <canvas 
                  ref={canvasRef} 
                  onClick={handleCanvasClick} 
                  className="w-full border border-gray-300 rounded-lg shadow-sm" 
                  style={{ 
                      maxHeight: '420px', 
                      cursor: drawing ? 'crosshair' : 'default' // <-- Tambah cursor
                  }} 
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg bg-white p-8 text-center">
                <FaCamera className="text-4xl text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">Click button above for take a picture from stream.</p>
              </div>
            )}
          </div>
          {/* Daftar ROI yang sudah digambar */}
          <div className="mt-4 space-y-4">
            <h4 className="font-semibold text-gray-700">Configure Zones (ROI):</h4>
            {polygons.length === 0 && <p className="text-sm text-gray-500 italic">No ROI areas drawn yet.</p>}
              
            {polygons.map((poly, idx) => (
              <div key={idx} className="p-4 border rounded-lg bg-white shadow-sm border-l-4 border-l-indigo-500">
                <div className="flex gap-4 items-center mb-3">
                  <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </div>
                  <input 
                    className="flex-1 border-b focus:border-indigo-500 outline-none p-1 font-medium text-sm"
                    value={poly.name}
                    onChange={(e) => {
                      const newPolys = [...polygons];
                      newPolys[idx].name = e.target.value;
                      setPolygons(newPolys);
                    }}
                    placeholder="Area Name (e.g. Near Camera)"
                  />
                  <button 
                    type="button" 
                    onClick={() => setPolygons(polygons.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Remove Area
                  </button>
                </div>
                
                {/* Checklist Pelanggaran per ROI */}
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Allowed Violations in this zone:</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {(violations || [])
                    .filter(v => v.is_violation === true)
                    .map(v => (
                      <label key={v.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition">
                        <input 
                          type="checkbox"
                        className="rounded text-indigo-600"
                        checked={poly.allowed_violations.includes(v.id)}
                        onChange={() => {
                          const newPolys = [...polygons];
                          const current = newPolys[idx].allowed_violations;
                          // Toggle ID di dalam array
                          newPolys[idx].allowed_violations = current.includes(v.id)
                            ? current.filter(id => id !== v.id)
                            : [...current, v.id];
                          setPolygons(newPolys);
                        }}
                      />
                        <span className="truncate">{v.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* === Field Schedule Input === */}
        <div className="mt-6">
            <CCTVScheduleInput 
                cctvId={cctvData?.id} 
                onScheduleChange={(schedules) => setForm(prev => ({ ...prev, schedules }))}
            />
        </div>

        {/* === Footer === */}
        <div className="flex items-center justify-between">
          {/* === Enabled Checkbox === */}
          <div className="flex items-center justify-between pt-4">
            <label className="relative inline-flex items-center cursor-pointer gap-3">
                <input
                type="checkbox" 
                checked={form.enabled} 
                onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))} 
                className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
          <div className="flex gap-3">
            {/* === Submit Button === */}
            <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg">Cancel</button>
            <RoleButton
              allowedRoles={['super_admin']} 
              type="submit" 
              disabled={submitting} 
              className="px-5 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
              {submitting ? 'Updating...' : 'Update CCTV'}
            </RoleButton>
          </div>
        </div>
      </form>
    </dialog>
  );
}