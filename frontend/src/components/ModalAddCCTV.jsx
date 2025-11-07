import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaTimes, FaUpload, FaCamera } from 'react-icons/fa';

export default function ModalAddCCTV({ open, onClose, onSuccess }) {
    const [form, setForm] = useState({
        name: '', location: '', ip: '', port: '', token: '', enabled: true
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

    // Reset on open
    useEffect(() => {
        if (open) {
        setForm({ name: '', location: '', ip: '', port: '', token: '', enabled: true });
        setRoiMethod('upload'); setRoiFile(null); setPoints([]); setPolygons([]); setImageUrl(null); setDrawing(false);
        setPreviewError(null);
        }
    }, [open]);

    const onDrop = useCallback((files) => {
        const file = files[0];
        if (file.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = (e) => {
            try { setPolygons(JSON.parse(e.target.result).items || []); }
            catch { alert('Invalid JSON'); }
        };
        reader.readAsText(file);
        setRoiFile(file);
        } else if (file.type.startsWith('image/')) {
        setImageUrl(URL.createObjectURL(file));
        setDrawing(true);
        }
    }, []);

    // Fungsi load preview dari stream
    const loadStreamPreview = async () => {
        if (!form.url) return alert('URL required');
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const res = await fetch('/api/rtsp_snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: form.url })
            });
            if (res.ok) {
            const blob = await res.blob();
            setImageUrl(URL.createObjectURL(blob));
            setDrawing(true);
            setRoiMethod('draw');
            } else {
            const err = await res.json();
            setPreviewError(err.error || 'Stream unavailable');
            }
        } catch {
            setPreviewError('Network error');
        } finally {
            setPreviewLoading(false);
        }
        };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

    const handleCanvasClick = (e) => {
        if (!drawing) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setPoints([...points, { x, y }]);
    };

    const closePolygon = () => {
        if (points.length < 3) return alert('Min 3 points');
        setPolygons([...polygons, { type: 'polygon', points: [...points] }]);
        setPoints([]);
    };

    const clearCanvas = () => {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        setPoints([]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!form.name?.trim()) return alert('Name required');
        if (!form.url?.trim()) return alert('CCTV URL required');

        setSubmitting(true);

        // === PARSE URL ===
        let ip, port, token;
        try {
            const url = new URL(form.url.trim());
            if (!['rtsp:', 'rtsps:'].includes(url.protocol)) {
            throw new Error('Protocol must be rtsp or rtsps');
            }

            ip = url.hostname;
            port = url.port || (url.protocol === 'rtsps:' ? '7441' : '554');
            token = url.pathname.slice(1); 

            // Validasi IP
            const ipRegex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
            if (!ipRegex.test(ip)) throw new Error('Invalid IP');
            if (isNaN(port) || port < 1 || port > 65535) throw new Error('Invalid port');
        } catch (err) {
            setSubmitting(false);
            return alert(err.message || 'Invalid URL format');
        }

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
            return alert('Invalid ROI JSON');
        }

        // === KIRIM KE BACKEND ===
        const payload = {
            name: form.name.trim(),
            ip_address: ip,
            port: port,
            token: token,
            location: form.location?.trim() || null,
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
            onSuccess(newCctv);
            onClose();
            } else {
            const err = await res.json();
            alert(err.error || 'Failed');
            }
        } catch {
            alert('Network error');
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                    <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                </div>

                <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        CCTV URL (RTSP/S) *
                    </label>
                    <input
                        type="text"
                        required
                        placeholder="rtsps://[ip]:[port]/[token]?enableSrtp"
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Example: rtsps://192.168.x.x:xxxx/aBcdEfGhIj123456?enableSrtp</p>
                </div>

                {/* ROI Section */}
                <div className="space-y-4">
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
                        
                        {/* Status File */}
                        {roiFile && !uploadError && (
                            <p className="mt-3 text-sm font-medium text-green-600">
                            File: {roiFile.name}
                            </p>
                        )}
                        
                        {/* Error jika bukan JSON */}
                        {uploadError && (
                            <p className="mt-3 text-sm font-medium text-red-600 bg-red-50 px-3 py-1 rounded border border-red-200">
                            {uploadError}
                            </p>
                        )}
                        </div>
                    </div>
                )}

                {/* Draw Mode */}
                {roiMethod === 'draw' && (
                    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                        {/* Tombol Load Preview */}
                        <div className="flex justify-end items-center">
                            <button
                            type="button"
                            onClick={loadStreamPreview}
                            disabled={previewLoading || !form.ip || !form.port}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                            <FaCamera />
                            {previewLoading ? 'Loading...' : 'Take picture from stream'}
                            </button>
                        </div>

                        {previewError && (
                            <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                            {previewError}
                            </p>
                        )}

                        {/* Canvas untuk Gambar */}
                        {imageUrl ? (
                            <div className="space-y-2">
                                <div className="flex gap-2 justify-center">
                                    <button
                                    type="button"
                                    onClick={startDrawing}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded"
                                    >
                                    Start Drawing
                                    </button>
                                    <button
                                    type="button"
                                    onClick={closePolygon}
                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded"
                                    >
                                    Close the Polygon
                                    </button>
                                    <button
                                    type="button"
                                    onClick={clearDrawing}
                                    className="px-3 py-1 bg-red-600 text-white text-xs rounded"
                                    >
                                    Erase
                                    </button>
                                </div>

                                <canvas
                                    ref={canvasRef}
                                    className="w-full border border-gray-300 rounded-lg shadow-sm"
                                    style={{ maxHeight: '420px', imageRendering: 'pixelated' }}
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

                <div className="flex items-center justify-between">
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
                        <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg">Cancel</button>
                        <button type="submit" disabled={submitting} className="px-5 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
                            {submitting ? 'Adding...' : 'Add CCTV'}
                        </button>
                    </div>
                </div>
            </form>
        </dialog>
    );
}