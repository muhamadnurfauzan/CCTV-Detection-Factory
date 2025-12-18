import React, { useState, useRef, useEffect } from 'react';
import { FaTimes, FaCamera, FaPlusCircle } from 'react-icons/fa';
import { useAlert } from './AlertProvider';
import CCTVScheduleInput from './CCTVScheduleInput';
import RoleButton from './RoleButton';

export default function ModalAddCCTV({ open, onClose, onSuccess, violations = [] }) {
    const [form, setForm] = useState({
        name: '', location: '', ip: '', port: '', token: '', enabled: false, url: '' // Tambah url di state
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

    // Reset on open
    useEffect(() => {
        if (open) {
        setForm({ name: '', location: '', ip: '', port: '', token: '', enabled: false, url: '' });
        setPoints([]); setPolygons([]); setImageUrl(null); setDrawing(false);
        setPreviewError(null);
        setUrlError(''); 
        }
    }, [open]);
    
    // === Helper: Parse URL dan Validasi IP/Port/Token (Mirip ModalEditCCTV) ===
    const updateFieldsFromUrl = (rawUrl) => {
        const url = rawUrl.trim();
        setUrlError('');
        
        // Update URL di state utama
        setForm(prev => ({ ...prev, url: url }));

        if (!url) {
            setForm(prev => ({ ...prev, ip: '', port: '', token: '' }));
            return;
        }

        try {
            const u = new URL(url.replace('rtsps://', 'rtsp://')); 
            if (!['rtsp:', 'rtsps:'].includes(u.protocol)) {
                throw new Error('Protocol must be rtsp:// or rtsps://.');
            }

            const ip = u.hostname;
            const port = u.port || '7447'; 
            const tokenWithQuery = u.pathname.slice(1) + u.search;
            const token = tokenWithQuery.replace('?enableSrtp', ''); 

            // Validasi IP Ketat (0-255 per segmen)
            const ipSegments = ip.split('.');
            if (ipSegments.length !== 4 || ipSegments.some(seg => {
                const num = parseInt(seg, 10);
                return isNaN(num) || num < 0 || num > 255;
            })) {
                throw new Error('Invalid IP value (each segment must be 0-255).');
            }
            
            // Validasi Port
            if (isNaN(parseInt(port, 10)) || parseInt(port, 10) < 1 || parseInt(port, 10) > 65535) {
                 throw new Error('Invalid port number.');
            }
            
            // Jika valid, update ip/port/token di state
            setForm(prev => ({ ...prev, ip, port, token }));
        } catch (err) {
            setUrlError(err.message || 'Invalid URL format.'); // <-- Memicu tampilan error inline
            setForm(prev => ({ ...prev, ip: '', port: '', token: '' })); // Kosongkan komponen jika gagal
        }
    };
    // =========================================================================

    // Fungsi load preview dari stream
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
            const err = await res.json();
            const message = err.error || 'Stream is not avaliable. Check your URL or network.';
            setPreviewError(message);
            showAlert(message, 'error');
            }
        } catch {
            setPreviewError('Network error');
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
    };

    // === 7. Gambar ROI Existing di Canvas ===
    useEffect(() => {
        // Logika ini dipanggil setiap kali imageUrl, polygons, atau points berubah
        if (imageUrl && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // 1. Gambar latar belakang (frame CCTV)
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                // 2. Gambar semua polygon yang sudah tersimpan
                // === Update Visualisasi ROI di Canvas ===
                polygons.forEach((poly, index) => {
                    ctx.beginPath();
                    poly.points.forEach((pt, i) => {
                        if (i === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    });
                    ctx.closePath();
                    
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
                
                // 3. Gambar garis yang sedang dibuat (current points)
                if (drawing && points.length > 0) {
                    ctx.beginPath();
                    
                    // Gambar garis penghubung
                    points.forEach((pt, i) => {
                        if (i === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    });
                    
                    // Gambar garis putus-putus ke titik awal (untuk menutup polygon)
                    if (points.length > 1) {
                        ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
                        ctx.lineTo(points[0].x, points[0].y);
                    }

                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 5;
                    ctx.stroke();

                    // Gambar titik (dot) di atas garis
                    points.forEach((pt) => {
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
                        ctx.fillStyle = 'blue';
                        ctx.fill();
                    });
                }
            };
            img.src = imageUrl;
        } else if (!imageUrl && canvasRef.current) {
            // Jika imageUrl dihapus, bersihkan canvas
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
    }, [imageUrl, polygons, points, drawing]);

    // === 8. Submit ===
    const handleSubmit = async (e) => {
        e.preventDefault();

        // 1. Validasi Dasar
        if (urlError) return showAlert(urlError, 'error');
        if (!form.name?.trim()) return showAlert('CCTV Name is required.', 'warning'); 
        if (!form.location?.trim()) return showAlert('CCTV Location is required.', 'warning'); 
        if (!form.url?.trim()) return showAlert('CCTV URL is required.', 'warning');
        if (!form.ip || !form.port || !form.token) {
            return showAlert('IP, Port, and Token must be extracted from a valid URL.', 'error');
        }

        setSubmitting(true);

        // 2. Akses Canvas secara Aman (Mencegah ReferenceError)
        const currentCanvas = canvasRef.current;

        // 3. Susun areaPayload dengan Fallback Resolusi
        const areaPayload = JSON.stringify({
            image_width: currentCanvas ? currentCanvas.width : 1280,
            image_height: currentCanvas ? currentCanvas.height : 720,
            items: polygons.map((p) => ({
                name: p.name,
                points: p.points.map(pt => [Math.round(pt.x), Math.round(pt.y)]),
                allowed_violations: p.allowed_violations || []
            }))
        });

        // 4. Siapkan Payload untuk Backend
        const payload = {
            name: form.name.trim(),
            ip_address: form.ip,
            port: form.port,
            token: form.token,
            location: form.location?.trim(),
            enabled: form.enabled,
            area: areaPayload // Kirim sebagai JSON string
        };

        try {
            const res = await fetch('/api/cctv-add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to Add CCTV");
            }

            const newCctv = await res.json();

            // 5. Kirim Jadwal jika ada
            if (form.schedules && form.schedules.length > 0) {
                await fetch(`/api/cctv-schedules/${newCctv.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ schedules: form.schedules })
                });
            }

            onSuccess(newCctv);
            onClose();
            showAlert(`CCTV '${newCctv.name}' successfully added!`, 'success');
        } catch (err) {
            showAlert(err.message || 'Network error.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-green-700">
                    <FaPlusCircle className="w-6 h-6" /> Add New CCTV
                </h2>
                <button onClick={onClose} className="text-2xl"><FaTimes /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    {/* === Name === */}
                    <label className="block text-sm font-medium text-gray-700 mb-1">CCTV Name *</label>
                    <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <div>
                    {/* === Location === */}
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                    <input
                    type="text"
                    required
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                </div>

                {/* === URL === */}
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        CCTV URL (RTSP/S) *
                    </label>
                    <input
                        type="text"
                        placeholder="rtsps://[ip]:[port]/[token]?enableSrtp"
                        value={form.url}
                        onChange={(e) => updateFieldsFromUrl(e.target.value)}  
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${
                            urlError ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    {urlError && <p className="text-xs text-red-600 mt-1">{urlError}</p>}
                    <p className="text-xs text-gray-500 mt-1">Example: rtsps://192.168.x.x:xxxx/aBcdEfGhIj123456?enableSrtp</p>
                </div>

                {/* ROI Section */}
                <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">ROI Area *</label>
                {/* Draw ROI */}
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                    {/* Tombol Load Preview */}
                    <div className="flex justify-between items-center">
                        <p>Input CCTV URL first for drawing ROI!</p>
                        <button
                        type="button" 
                        onClick={loadStreamPreview} 
                        disabled={previewLoading || !form.ip || !form.port || !form.token || !!urlError}  
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                        <FaCamera />
                        {previewLoading ? 'Loading...' : 'Take picture from stream'}
                        </button>
                    </div>

                    {previewError && <p className="text-sm text-red-600 bg-red-50 p-2 mb-2 rounded border border-red-200">{previewError}</p>}

                    {/* Canvas untuk Gambar */}
                    {imageUrl ? (
                        <div className="space-y-2">
                            <div className="flex gap-2 justify-center">
                                <button type="button" onClick={startDrawing} className="px-3 py-1 bg-blue-600 text-white text-xs rounded">Start Drawing</button>
                                <button type="button" onClick={closePolygon} className="px-3 py-1 bg-green-600 text-white text-xs rounded">Close Polygon</button>
                                <button type="button" onClick={clearDrawing} className="px-3 py-1 bg-red-600 text-white text-xs rounded">Delete</button>
                            </div>

                            <canvas
                                ref={canvasRef}
                                className="w-full border border-gray-300 rounded-lg shadow-sm"
                                style={{ 
                                    maxHeight: '420px', 
                                    imageRendering: 'pixelated',
                                    cursor: drawing ? 'crosshair' : 'default' 
                                }} 
                                onClick={handleCanvasClick}
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
                    {polygons.map((poly, idx) => (
                        <div key={idx} className="p-4 border rounded-lg bg-white shadow-sm">
                            <div className="flex gap-4 items-center mb-3">
                                <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">
                                    {idx + 1}
                                </div>
                                <input 
                                    className="flex-1 border-b focus:border-indigo-500 outline-none p-1 font-medium"
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
                                    className="text-red-500 text-sm"
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
                                        <label key={v.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                            <input 
                                                type="checkbox"
                                                checked={poly.allowed_violations.includes(v.id)}
                                                onChange={() => {
                                                    const newPolys = [...polygons];
                                                    const current = newPolys[idx].allowed_violations;
                                                    newPolys[idx].allowed_violations = current.includes(v.id)
                                                        ? current.filter(id => id !== v.id)
                                                        : [...current, v.id];
                                                    setPolygons(newPolys);
                                                }}
                                            />
                                            {v.name}
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
                            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                            className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                            <span className="text-sm font-medium">Enabled</span>
                        </label>
                    </div>
                    
                    <div className="flex justify-end gap-3">
                        {/* === Submit Button === */}
                        <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg">Cancel</button>
                        <RoleButton 
                            allowedRoles={['super_admin']}
                            type="submit" 
                            disabled={submitting || !!urlError} 
                            className="px-5 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"> 
                            {submitting ? 'Adding...' : 'Add CCTV'}
                        </RoleButton>
                    </div>
                </div>
            </form>
        </dialog>
    );
}