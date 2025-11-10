// components/ModalEditCCTV.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaTimes, FaUpload, FaCamera } from 'react-icons/fa';
import { useAlert } from './AlertProvider';

export default function ModalEditCCTV({ open, onClose, onUpdate, cctvData }) {
  const [form, setForm] = useState({
    name: '',
    location: '',
    ip: '',
    port: '',
    token: '',
    enabled: true,
    url: ''
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

  // === 1. Computed URL (fallback) ===
    const generateUrl = (ip, port, token) => {
    if (!ip || !port || !token) return '';
    return `rtsps://${ip}:${port}/${token}?enableSrtp`;
    };

  // === 2. Load data saat modal dibuka (Keluhan 1 & 3) ===
  useEffect(() => {
    if (open && cctvData) {
        const ip = cctvData.ip_address || '';
        const port = cctvData.port || '';
        const token = cctvData.token || '';

        const autoUrl = ip && port && token
            ? generateUrl(ip, port, token)
            : '';

        setForm({
            name: cctvData.name || '',
            location: cctvData.location || '',
            ip: ip,
            port: port,
            token: token, 
            enabled: cctvData.enabled ?? true,
            url: autoUrl
        });

      // Load ROI existing (Keluhan 3)
      if (cctvData.area) {
        setRoiFile({ name: cctvData.area }); 
        fetch(`/api/roi/${cctvData.area}`)
          .then(res => res.json())
          .then(data => {
            const items = data.items || [];
            setPolygons(items);
            if (items.length > 0) setRoiMethod('upload');
          })
          .catch(() => {
            console.warn('Failed to load ROI');
            setPolygons([]);
          });
      } else {
        setPolygons([]);
        setRoiFile(null); 
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
            throw new Error('Harus rtsp:// atau rtsps://');
        }

        const ip = u.hostname;
        const port = u.port || '7447'; 
        const tokenWithQuery = u.pathname.slice(1) + u.search;
        
        const token = tokenWithQuery.replace('?enableSrtp', ''); 

        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) throw new Error('Invalid IP');

        setForm(prev => ({ ...prev, ip, port, token, url }));
        } catch (err) {
        setUrlError(err.message || 'Invalid URL');
        }
    };

  // === 4. Dropzone ===
  const onDrop = useCallback((files) => {
    const file = files[0];
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          setPolygons(json.items || []);
          setRoiMethod('upload');
        } catch {
          setUploadError('Invalid JSON');
          showAlert('Invalid JSON format in the uploaded file.', 'error');
        }
      };
      reader.readAsText(file);
      setRoiFile(file);
      setUploadError(null);
    } else {
      setUploadError('Only JSON File');
      showAlert('Only JSON files are accepted for ROI.', 'warning');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // === 5. Load Stream Preview ===
  const loadStreamPreview = async () => {
    const urlToUse = form.url || generateUrl(form.ip, form.port, form.token);
    if (!form.url) return showAlert('URL required for stream preview.', 'warning'); 

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/rtsp_snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToUse })
      });
      if (res.ok) { 
        const blob = await res.blob();
        setImageUrl(URL.createObjectURL(blob));
        setDrawing(false);
        setRoiMethod('draw');
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
    // Saat menghapus gambar, hapus juga file ROI yang lama secara virtual
    if (cctvData?.area) setRoiFile(null); 
  };

  const handleCanvasClick = (e) => {
    if (!drawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints(prev => [...prev, { x, y }]);
  };

  const closePolygon = () => {
    if (points.length < 3) return showAlert('Minimum 3 points required to close a polygon.', 'warning');
    setPolygons(prev => [...prev, { type: 'polygon', points: [...points] }]);
    setPoints([]);
  };

  // === 7. Gambar ROI Existing di Canvas ===
  useEffect(() => {
    // ... (Logika tidak berubah)
    if (imageUrl && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Gambar semua polygon
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
      };
      img.src = imageUrl;
    }
  }, [imageUrl, polygons]);

  // === 8. Submit ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.name.trim()) return showAlert('CCTV Name is required.', 'warning'); 
    if (!generateUrl(form.ip, form.port, form.token)) return showAlert('CCTV URL is required.', 'warning'); 

    setSubmitting(true);

    let area = undefined; 
    let isAreaChanged = false;

    try {
        if (roiMethod === 'upload') {
            if (roiFile) {
                area = await roiFile.text();
                area = String(area).trim(); 
                JSON.parse(area);
                isAreaChanged = true;
            } else if (cctvData?.area) {
                area = undefined; 
            } 
        } else if (roiMethod === 'draw') {
            if (polygons.length > 0) {
                area = JSON.stringify({
                    items: polygons.map((p, i) => ({
                        item_number: i + 1,
                        type: p.type || 'polygon',
                        points: p.points.map(pt => [Math.round(pt.x), Math.round(pt.y)])
                    }))
                });
                isAreaChanged = true;
            } else if (cctvData?.area) {
                area = null; 
                isAreaChanged = true;
            } else {
                area = undefined;
            }
        }
    } catch {
        setSubmitting(false);
        return showAlert('Invalid ROI JSON format. Please check the file content.', 'error');
    }

    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      ip_address: String(form.ip).trim(),
      port: String(form.port).trim(),
      token: String(form.token).trim(),
      enabled: form.enabled,
    };
    
    if (isAreaChanged) { 
        payload.area = area;
    }

    try {
        const res = await fetch(`/api/cctv_update/${cctvData.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Update failed');
        }

        let updated;
        try {
            updated = await res.json();
        } catch (jsonError) {
            updated = { name: form.name.trim() }; 
        }

        onUpdate(cctvData.id, updated); 
        onClose();
        showAlert(`CCTV '${updated.name}' successfully updated.`, 'success'); 
    } catch (err) {
        showAlert(err.message || 'Network error.', 'error'); 
    } finally {
        setSubmitting(false);
    }
    }

  // === RENDER (Keluhan 4 & 1 & 3) ===
  return (
    <dialog open={open} className="fixed inset-0 z-50 p-6 bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        {/* Keluhan 4: Judul modal */}
        <h2 className="text-2xl font-bold">Update CCTV #{cctvData?.name}</h2>
        <button onClick={onClose} className="text-2xl"><FaTimes /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CCTV Name *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
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
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">ROI Area *</label>

          <div className="flex gap-2 border-b border-gray-200">
            <button type="button" onClick={() => setRoiMethod('upload')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition ${roiMethod === 'upload' ? 'bg-white text-indigo-600 border border-b-0 border-gray-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Upload JSON File</button>
            <button type="button" onClick={() => setRoiMethod('draw')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition ${roiMethod === 'draw' ? 'bg-white text-indigo-600 border border-b-0 border-gray-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Draw on Stream</button>
          </div>

          {/* Upload */}
          {roiMethod === 'upload' && (
            <div className="p-4 bg-gray-50 rounded-lg border">
                {/* Menampilkan nama file yang sedang aktif/lama */}
                {/* Status File */}
                {(roiFile || cctvData?.area) && !uploadError && (
                    <p className="text-sm text-green-600 bg-green-100 p-2 mb-2 rounded border border-green-300">File uploaded: <strong>{roiFile?.name || cctvData.area}</strong></p>
                )}
                {/* Error jika bukan JSON */}
                {uploadError && <p className="text-sm text-red-600 bg-red-50 p-2 mb-2 rounded border border-red-200">{uploadError}</p>}
                <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 bg-white">
                    <input {...getInputProps()} accept=".json" />
                    <FaUpload className="mx-auto text-4xl text-gray-400 mb-3" />
                    {isDragActive ? <p className="text-sm text-gray-600">Drop file here...</p> : <p className="text-sm text-gray-600">Drag & drop <strong>ROI JSON file</strong> or click to select.</p>}
                </div>

                {/* ROI Existing */}
                {polygons.length > 0 && !roiFile && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-800">ROI now ({polygons.length} polygon{polygons.length > 1 ? 's' : ''})</p>
                        <pre className="text-xs text-green-700 mt-1 overflow-auto max-h-32">{JSON.stringify({ items: polygons }, null, 2)}</pre>
                    </div>
                )}
            </div>
          )}

          {/* Draw */}
          {roiMethod === 'draw' && (
            <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
              <div className="flex justify-between">
                <p>Input CCTV URL first for drawing ROI!</p>
                <button type="button" onClick={loadStreamPreview} disabled={previewLoading || !form.ip || !form.port} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <FaCamera /> {previewLoading ? 'Loading...' : 'Take picture from stream'}
                </button>
              </div>
              
              {/* Keluhan ROI: Tampilkan nama file lama di mode Draw */}
              {cctvData?.area && (
                  <p className="text-sm text-yellow-700 bg-yellow-100 p-2 mb-2 rounded border border-yellow-300">
                      <strong>Warning</strong>: This CCTV already has an existing ROI file: <strong>{cctvData.area}</strong>. Drawing a new ROI will <strong>overwrite</strong> it. If you click <strong>Delete</strong> (Clear Drawing), the file will be removed.
                  </p>
              )}

              {previewError && <p className="text-sm text-red-600 bg-red-50 p-2 mb-2 rounded border border-red-200">{previewError}</p>}

              {imageUrl ? (
                <div className="space-y-2">
                  <div className="flex gap-2 justify-center">
                    <button type="button" onClick={startDrawing} className="px-3 py-1 bg-blue-600 text-white text-xs rounded">Start Drawing</button>
                    <button type="button" onClick={closePolygon} className="px-3 py-1 bg-green-600 text-white text-xs rounded">Close Polygon</button>
                    <button type="button" onClick={clearDrawing} className="px-3 py-1 bg-red-600 text-white text-xs rounded">Delete</button>
                  </div>
                  <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full border border-gray-300 rounded-lg shadow-sm" style={{ maxHeight: '420px' }} />
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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" />
            <span className="text-sm font-medium">Enabled</span>
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg">Cancel</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
              {submitting ? 'Updating...' : 'Update CCTV'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}