// frontend/src/pages/ImagesShow.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { FaAngleLeft, FaAngleRight, FaExclamationTriangle, FaCamera, FaCalendar } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import RoleLink from '../components/RoleLink';
import '../styles/LazyBlur.css';
import '../styles/MasonryGrid.css';

const ImagesShow = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [pageSize, setPageSize] = useState(20);
  const [activeCctvName, setActiveCctvName] = useState("");

  // ---- LIMIT PAGINATION ACCORDING DEVICES ----
  useEffect(() => {
    const calcPageSize = () => {
      const width = window.innerWidth;
      if (width >= 1440) return 24;
      if (width > 640) return 18;
      if (width > 320) return 12;
      return 6;
    };

    setPageSize(calcPageSize());

    // Dengarkan perubahan ukuran layar
    const handleResize = () => setPageSize(calcPageSize());
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ---- FILTER + PAGE FROM URL ----
  const currentPath = useMemo(() => {
    const cctv = searchParams.get('cctv');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const day = searchParams.get('day');
    const page = searchParams.get('page');
    return {
      cctv: cctv && cctv !== 'null' ? cctv : undefined,
      year: year && year !== 'null' ? year : undefined,
      month: month && month !== 'null' ? month : undefined,
      day: day && day !== 'null' ? day : undefined,
      page: page ? parseInt(page, 10) : 1,
    };
  }, [searchParams]);

  useEffect(() => {
    setCurrentPage(currentPath.page);
  }, [currentPath.page]);

  // Update useEffect fetchData untuk menangkap nama CCTV
  useEffect(() => {
    if (options && options.options === 'cctv' && currentPath.cctv) {
      const found = options.data.find(c => String(c.id) === String(currentPath.cctv));
      if (found) {
        setActiveCctvName(found.name);
        localStorage.setItem('lastCctvName', found.name);
      }
    } else if (!activeCctvName) {
      // Ambil dari storage jika state kosong
      const saved = localStorage.getItem('lastCctvName');
      if (saved) setActiveCctvName(saved);
    }
  }, [options, currentPath.cctv]);

  // ---- BREADCRUMB ----
  const breadcrumb = useMemo(() => {
    const crumbs = [{ label: 'All Cameras', path: '?' }];

    if (currentPath.cctv) {
      // Gunakan nama dari state, storage, atau fallback teks
      const cctvLabel = activeCctvName || localStorage.getItem('lastCctvName') || `CCTV ${currentPath.cctv}`;
      crumbs.push({ label: cctvLabel, path: `?cctv=${currentPath.cctv}` });
    }
    
    if (currentPath.year) {
      crumbs.push({ label: String(currentPath.year), path: `?cctv=${currentPath.cctv}&year=${currentPath.year}` });
    }
    
    if (currentPath.month) {
      const monthName = format(new Date(2000, currentPath.month - 1), 'MMMM');
      crumbs.push({ 
        label: monthName, 
        path: `?cctv=${currentPath.cctv}&year=${currentPath.year}&month=${currentPath.month}` 
      });
    }
    
    if (currentPath.day) {
      crumbs.push({ 
        label: String(currentPath.day), 
        path: `?cctv=${currentPath.cctv}&year=${currentPath.year}&month=${currentPath.month}&day=${currentPath.day}` 
      });
    }

    return crumbs;
  }, [currentPath, activeCctvName]);

  // ---- FETCH DATA ----
  const fetchData = useCallback(async (pageNum) => {
    setLoading(true);
    setError(null);
    setImages([]);
    setOptions(null);

    try {
      const params = new URLSearchParams({
        page: pageNum,
        limit: pageSize,
      });
      if (currentPath.cctv) params.append('cctv', currentPath.cctv);
      if (currentPath.year) params.append('year', currentPath.year);
      if (currentPath.month) params.append('month', currentPath.month);
      if (currentPath.day) params.append('day', currentPath.day);

      const API_BASE = import.meta.env.VITE_API_BASE || '/supabase-api';
      const res = await fetch(`${API_BASE}/violations?${params}`, {
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      if (json.options && Array.isArray(json.data)) {
        setOptions(json);
        setImages([]); 
        setHasMore(false);
        return;
      }

      setOptions(null); 
      const safe = json.data.map(img => ({
        ...img,
        timestamp: img.timestamp && !isNaN(new Date(img.timestamp).getTime())
          ? img.timestamp
          : null,
      }));
      setImages(safe);
      
      setHasMore(json.hasMore === true);
      const totalItems = pageNum * pageSize + (json.hasMore ? 1 : 0);
      setTotalPages(Math.ceil(totalItems / pageSize));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentPath.cctv, currentPath.year, currentPath.month, currentPath.day]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchData(currentPath.page);
  }, [currentPath.page, currentPath.cctv, currentPath.year, currentPath.month, currentPath.day, fetchData]);

  // ---- NAVIGASI ----
  const goToPage = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page);
    setSearchParams(newParams);
  };

  const getNextPath = useCallback((value, type) => {
    const p = new URLSearchParams();
    if (currentPath.cctv) p.set('cctv', currentPath.cctv);
    if (currentPath.year) p.set('year', currentPath.year);
    if (currentPath.month) p.set('month', currentPath.month);
    p.set(type, value);
    p.set('page', '1');
    return `?${p.toString()}`;
  }, [currentPath]);

  // ---- HANDLE GO BACK BREADCRUMB ----
  const handleGoBack = () => {
    setSelectedImage(null); 
    setImages([]); 
    
    if (breadcrumb.length > 1) {
      const prevPath = breadcrumb[breadcrumb.length - 2].path;
      const params = new URLSearchParams(prevPath.split('?')[1]);
      setSearchParams(params);
    }
  };

  // ---- LAZY LOAD IMAGE COMPONENT ----
  const LazyImage = ({ src, alt }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    return (
      <img
        src={src}
        alt={alt}
        onLoad={() => setIsLoaded(true)}
        className={`masonry-img lazy-load-image ${isLoaded ? 'loaded' : ''}`}
      />
    );
  };

  // ---- SKELETON CARD COMPONENT ----
  const SkeletonCard = () => (
    <div className="masonry-item animate-pulse">
      <div className="masonry-img-container bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-2 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );

  // ---- RENDER ----
  if (error) {
    return (
      <div className="text-red-600 p-6 bg-white shadow rounded-lg text-center">
        <p className="font-bold">Error:</p>
        <p>{error}</p>
        <button onClick={() => fetchData(currentPage)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Violation Gallery</h2>
      
      {/* breadcrumbs */}
      <div className="mb-4 flex justify-start">
        <nav className="inline-flex items-center p-1.5 bg-white/90 backdrop-blur-md border border-gray-100 rounded-lg shadow-md relative z-[70]">
          {breadcrumb.map((crumb, i) => (
            <div key={i} className="flex items-center">
              {i > 0 && <span className="text-gray-400 mx-1.5 text-xs font-bold">/</span>}
              
              <motion.div
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center"
              >
                {i < breadcrumb.length - 1 ? (
                  <RoleLink 
                    allowedRoles={['super_admin', 'report_viewer']}
                    to={crumb.path} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(null);
                      setOptions(null); 
                    }}
                    className="px-3 py-1.5 text-sm font-bold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-md transition-all flex items-center gap-2"
                  >
                    {/* IKON BERDASARKAN LEVEL */}
                    {i === 0 && <FaCamera className="text-base" />}
                    {i === 1 && <FaCamera className="text-base" />}
                    {(i === 2 || i === 3 || i === 4) && <FaCalendar className="text-base" />}
                    {crumb.label}
                  </RoleLink>
                ) : (
                  <div className="px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-md flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-sm font-extrabold text-indigo-600">
                      {crumb.label}
                    </span>
                  </div>
                )}
              </motion.div>
            </div>
          ))}
        </nav>
      </div>

      {/* CONTENT AREA */}
      <AnimatePresence mode="wait">
        {loading ? (
          // 1. STATE LOADING (SKELETON)
          <motion.div
            key="loading-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="masonry-grid"
          >
            {[...Array(pageSize)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </motion.div>
        ) : options ? (
          // 2. STATE FOLDER / OPTIONS
          <motion.div
            key="options"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* CEK APAKAH DATA FOLDER ADA */}
            {options.data && options.data.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {options.data.map((item, idx) => {
                  const val = typeof item === 'object' ? (item.id ?? item) : item;
                  const lbl = typeof item === 'object' ? (item.name ?? val) : item;
                  return (
                    <motion.div key={idx} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <RoleLink 
                        allowedRoles={['super_admin', 'report_viewer']}
                        to={getNextPath(val, options.options)}
                        className="p-6 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg text-center font-semibold text-lg shadow-md h-full flex items-center justify-center"
                      >
                        {lbl}
                      </RoleLink>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              /* TAMPILAN JIKA FOLDER KOSONG */
              <motion.div 
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl shadow-sm border-2 border-dashed border-gray-200"
              >
                {/* Ikon Folder/Gambar Kosong */}
                <div className="bg-gray-50 p-6 rounded-full mb-6">
                  <FaExclamationTriangle className="text-gray-400 w-12 h-12" />
                </div>
                
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  {options ? "This folder is still empty" : "No images found"}
                </h3>
                <p className="text-gray-500 text-center max-w-xs mb-8">
                  It looks like there is no recorded data for the category or date you selected.
                </p>

                {/* TOMBOL GO BACK */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleGoBack}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors"
                >
                  <FaAngleLeft />
                  Back to Previous
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        ) : images.length > 0 && (
          // 3. STATE GAMBAR (HASIL ADA)
          <motion.div
            key="images"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="masonry-grid"
          >
            {images.map((img, idx) => (
              <motion.div
                key={`img-${img.id || idx}-${img.timestamp}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="masonry-item cursor-pointer relative z-10"
                onClick={(e) => {
                  e.stopPropagation(); 
                  setSelectedImage(img);
                }}
              >
                <div className="masonry-img-container group"> 
                  <LazyImage src={img.signedUrl} alt={img.violation} />
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{img.violation}</p>
                  {/* <p className="text-[10px] text-gray-400">{img.timestamp ? format(new Date(img.timestamp), 'HH:mm') : '--:--'}</p> */}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PAGINATION */}
      {!loading && !options && images.length > 0 && (
        <div className="flex justify-center items-center gap-4 mt-12 pb-10">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-3 bg-white text-indigo-600 border border-indigo-100 rounded-lg disabled:opacity-50 shadow-sm hover:bg-indigo-50 transition-colors"
          >
            <FaAngleLeft className='h-5 w-5'/>
          </button>
          <div className="bg-white px-6 py-2 rounded-lg border border-indigo-100 shadow-sm">
            <span className="text-xs text-gray-400 block text-center uppercase font-bold">Page</span>
            <span className="font-bold text-lg text-indigo-600">{currentPage} / {totalPages}</span>
          </div>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={!hasMore}
            className="p-3 bg-white text-indigo-600 border border-indigo-100 rounded-lg disabled:opacity-50 shadow-sm hover:bg-indigo-50 transition-colors"
          >
            <FaAngleRight className='h-5 w-5'/>
          </button>
        </div>
      )}

      {/* MODAL */}
      <AnimatePresence>
        {selectedImage && selectedImage.signedUrl && ( 
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-2xl p-2 shadow-2xl max-w-5xl max-h-[90vh] overflow-hidden"
              onClick={e => e.stopPropagation()} 
            >
              <img
                src={selectedImage.signedUrl}
                alt="Violation Detail"
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            </motion.div>
            {/* INFO DI BAWAH */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white place-content-center text-center mt-2">
              <p className='text-sm font-medium opacity-70'>Click anywhere outside or use the button to close</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImagesShow;