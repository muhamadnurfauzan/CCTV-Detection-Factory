import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaTimes, FaUpload, FaCamera } from 'react-icons/fa';
import { useAlert } from './AlertProvider';

export default function ModalAddCCTV({ open, onClose, onSuccess }) {
    const [form, setForm] = useState({
        name: '', location: '', ip: '', port: '', token: '', enabled: false, url: '' // Tambah url di state
    });
    const [roiMethod, setRoiMethod] = useState('upload');
    const [roiFile, setRoiFile] = useState(null);
    const [drawing, setDrawing] = useState(false);
    const [points, setPoints] = useState([]);
    const [polygons, setPolygons] = useState([]);
    const [imageUrl, setImageUrl] = useState(null);
    const canvasRef = useRef(null);
    const [submitting, setSubmitting] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const [uploadError, setUploadError] = useState(null);
    const [urlError, setUrlError] = useState(''); 
    const { showAlert } = useAlert();

    // Reset on open
    useEffect(() => {
        if (open) {
        setForm({ name: '', location: '', ip: '', port: '', token: '', enabled: false, url: '' });
        setRoiMethod('upload'); setRoiFile(null); setPoints([]); setPolygons([]); setImageUrl(null); setDrawing(false);
        setPreviewError(null);
        setUrlError(''); // <-- Reset error URL
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

    const onDrop = useCallback((files) => {
        const file = files[0];
        if (file.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = (e) => {
            try { setPolygons(JSON.parse(e.target.result).items || []); }
            catch { showAlert('Invalid ROI JSON format.', 'error'); }
        };
        reader.readAsText(file);
        setRoiFile(file);
        } else if (file.type.startsWith('image/')) {
            // Logika ini untuk load preview, tapi kita akan pakai loadStreamPreview
            showAlert('Use "Draw on Stream" tab and "Take picture" button instead.', 'warning');
        }
    }, []);

    // Fungsi load preview dari stream
    const loadStreamPreview = async () => {
        if (!form.url || urlError) {
            return showAlert('URL required and must be valid for stream preview.', 'warning');
        }
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const res = await fetch('/api/rtsp_snapshot', {
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
                setDrawing(true);
                setRoiMethod('draw');
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

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

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
        setPolygons([...polygons, { type: 'polygon', points: [...points] }]);
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
                polygons.forEach(poly => {
                    ctx.beginPath();
                    poly.points.forEach((pt, i) => {
                        if (i === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    });
                    ctx.closePath();
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
                    ctx.fill();
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

    // === 8. Handler Submit ===
    const handleSubmit = async (e) => {
        e.preventDefault();

        // VALIDASI TERAKHIR: Pastikan tidak ada error inline yang tersisa
        if (urlError) return showAlert(urlError, 'error');
        
        if (!form.name?.trim()) return showAlert('CCTV Name is required.', 'warning'); 
        if (!form.location?.trim()) return showAlert('CCTV Location is required.', 'warning'); 
        if (!form.url?.trim()) return showAlert('CCTV URL is required.', 'warning');
        
        // Karena ip/port/token sudah diisi/divalidasi di updateFieldsFromUrl, kita bisa langsung pakai
        if (!form.ip || !form.port || !form.token) return showAlert('IP, Port, and Token must be extracted from a valid URL.', 'error');

        setSubmitting(true);

        // === PARSE URL FINAL (Hanya untuk konsistensi) ===
        // IP, port, token sudah ada di state form
        const ip = form.ip;
        const port = form.port;
        const token = form.token;

        // === PROSES ROI ===
        let area = null;
        try {
            if (roiMethod === 'upload' && roiFile) {
            area = await roiFile.text();
            JSON.parse(area);
            } else if (roiMethod === 'draw' && polygons.length > 0) {
            area = JSON.stringify({
                items: polygons.map((p, i) => ({
                item_number: i + 1,
                type: p.type || 'polygon',
                points: p.points.map(pt => [Math.round(pt.x), Math.round(pt.y)])
                }))
            });
            }
        } catch {
            setSubmitting(false);
            return showAlert('Invalid ROI JSON format. Please check the file content.', 'error');
        }

        // === KIRIM KE BACKEND ===
        const payload = {
            name: form.name.trim(),
            ip_address: ip,
            port: port,
            token: token,
            location: form.location?.trim(),
            enabled: form.enabled,
            area
        };

        try {
            const res = await fetch('/api/cctv_add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
            });

            if (res.ok) {
                const newCctv = await res.json();
                onSuccess(newCctv); // Memperbarui state di parent
                onClose();
                showAlert(`CCTV '${newCctv.name}' successfully added.`, 'success'); // Success Alert Saja
            } else {
            const err = await res.json();
            showAlert(err.error || 'Failed to add CCTV.', 'error');
            }
        } catch {
            showAlert('Network error: Could not connect to the server.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Add New CCTV</h2>
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

                {/* Tab Pilihan Metode */}
                <div className="flex gap-2 border-b border-gray-200">
                    <button
                    type="button"
                    onClick={() => setRoiMethod('upload')}
                    className={`px-4 py-2 font-medium text-sm rounded-t-lg transition ${
                        roiMethod === 'upload'
                        ? 'bg-white text-indigo-600 border border-b-0 border-gray-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    >
                    Upload JSON File
                    </button>
                    <button
                    type="button"
                    onClick={() => setRoiMethod('draw')}
                    className={`px-4 py-2 font-medium text-sm rounded-t-lg transition ${
                        roiMethod === 'draw'
                        ? 'bg-white text-indigo-600 border border-b-0 border-gray-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    >
                    Draw on Stream
                    </button>
                </div>

                {/* Upload Mode */}
                {roiMethod === 'upload' && (
                    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                        {/* Status File */}
                        {roiFile && !uploadError && (
                            <p className="text-sm text-green-600 bg-green-100 p-2 mb-2 rounded border border-green-300">File uploaded: <strong>{roiFile.name}</strong></p>
                        )}
                        
                        {/* Error jika bukan JSON */}
                        {uploadError && (
                            <p className="text-sm text-red-600 bg-red-50 p-2 mb-2 rounded border border-red-200">
                            {uploadError}
                            </p>
                        )}

                        <div
                        {...getRootProps()}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 transition bg-white"
                        >
                        <input
                            {...getInputProps()}
                            accept=".json"
                            onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                                if (file.type === 'application/json' || file.name.endsWith('.json')) {
                                setRoiFile(file);
                                setUploadError(null);
                                } else {
                                setRoiFile(null);
                                setUploadError('Only JSON files are allowed');
                                e.target.value = null; // Reset input
                                }
                            }
                            }}
                        />
                        <FaUpload className="mx-auto text-4xl text-gray-400 mb-3" />
                        {isDragActive ? (
                            <p className="text-sm text-gray-600">Drop file here...</p>
                        ) : (
                            <p className="text-sm text-gray-600">
                            Drag & drop <strong>ROI JSON file</strong> or click to select file.
                            </p>
                        )}
                        </div>
                    </div>
                )}

                {/* Draw Mode */}
                {roiMethod === 'draw' && (
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
                                        // --- PERBAIKAN: CURSOR ---
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
                )}
                </div>

                {/* === Footer === */}
                <div className="flex items-center justify-between">
                    {/* === Enabled Checkbox === */}
                    <label className="flex items-center gap-2">
                        <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded"
                        />
                        <span className="text-sm font-medium">Enabled</span>
                    </label>

                    <div className="flex justify-end gap-3">
                        {/* === Submit Button === */}
                        <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg">Cancel</button>
                        <button type="submit" disabled={submitting || !!urlError} className="px-5 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"> {/* <-- Tombol submit disabled jika ada error URL */}
                            {submitting ? 'Adding...' : 'Add CCTV'}
                        </button>
                    </div>
                </div>
            </form>
        </dialog>
    );
}