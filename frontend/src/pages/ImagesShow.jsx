// frontend/src/pages/ImagesShow.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/MasonryGrid.css';

const PAGE_SIZE = 24;

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

  // ---- BREADCRUMB SELALU DARI AWAL ----
  const breadcrumb = useMemo(() => {
    const crumbs = [{ label: 'CCTV', path: '?' }];

    if (currentPath.cctv) {
      crumbs.push({ label: `CCTV ${currentPath.cctv}`, path: `?cctv=${currentPath.cctv}` });
    }
    if (currentPath.year) {
      crumbs.push({ label: currentPath.year, path: `?cctv=${currentPath.cctv}&year=${currentPath.year}` });
    }
    if (currentPath.month) {
      crumbs.push({
        label: format(new Date(currentPath.year, currentPath.month - 1), 'MMMM'),
        path: `?cctv=${currentPath.cctv}&year=${currentPath.year}&month=${currentPath.month}`,
      });
    }
    if (currentPath.day) {
      crumbs.push({
        label: currentPath.day,
        path: `?cctv=${currentPath.cctv}&year=${currentPath.year}&month=${currentPath.month}&day=${currentPath.day}`,
      });
    }

    return crumbs;
  }, [currentPath]);

  // ---- FETCH DATA ----
  const fetchData = useCallback(async (pageNum) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pageNum,
        limit: PAGE_SIZE,
      });
      if (currentPath.cctv) params.append('cctv', currentPath.cctv);
      if (currentPath.year) params.append('year', currentPath.year);
      if (currentPath.month) params.append('month', currentPath.month);
      if (currentPath.day) params.append('day', currentPath.day);

      const res = await fetch(`/supabase-api/violations?${params}`, {
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      if (json.options && Array.isArray(json.data)) {
        setOptions(json);
        setHasMore(false);
        return;
      }

      const safe = json.data.map(img => ({
        ...img,
        timestamp: img.timestamp && !isNaN(new Date(img.timestamp).getTime())
          ? img.timestamp
          : null,
      }));

      setImages(safe);
      setHasMore(json.hasMore === true);
      const totalItems = pageNum * PAGE_SIZE + (json.hasMore ? 1 : 0);
      setTotalPages(Math.ceil(totalItems / PAGE_SIZE));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentPath.cctv, currentPath.year, currentPath.month, currentPath.day]);

  useEffect(() => {
    setImages([]);
    setOptions(null);
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

  // ---- RENDER ----
  if (error) {
    return (
      <div className="p-6 text-red-500 text-center">
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
      {/* JUDUL DINAMIS */}
      <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Violation Images</h2>

      <p className="mb-4 text-gray-600">
        {options
          ? `Choose ${options.options === 'cctv' ? 'CCTV' : options.options === 'year' ? 'Year' : options.options === 'month' ? 'Month' : 'Date'}`
          : `Violation ${currentPath.cctv ? `- CCTV ${currentPath.cctv}` : ''}${currentPath.day ? ` - ${format(new Date(currentPath.year, currentPath.month - 1, currentPath.day), 'dd MMM yyyy')}` : ''}`}
      </p>

      {/* BREADCRUMB SELALU TAMPIL */}
      <div className="mb-6 flex items-center space-x-2 text-sm flex-wrap">
        {breadcrumb.map((crumb, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-2 text-gray-400">›</span>}
            {i < breadcrumb.length - 1 ? (
              <Link to={crumb.path} className="text-blue-600 hover:underline">{crumb.label}</Link>
            ) : (
              <span className="text-gray-700 font-semibold">{crumb.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* HALAMAN OPSI */}
      {options && (
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {options.data.map(item => {
              const val = typeof item === 'object' ? (item.id ?? item) : item;
              const lbl = typeof item === 'object' ? (item.name ?? val) : item;
              return (
                <Link
                  key={val}
                  to={getNextPath(val, options.options)}
                  className="p-6 bg-gradient-to-br from-blue-50 to-indigo-100 hover:from-blue-100 hover:to-indigo-200 rounded-xl text-center font-semibold text-lg transition-all shadow-md hover:shadow-lg"
                >
                  {lbl}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* HALAMAN GAMBAR */}
      {!options && (
        <>
          {loading && <div className="text-center py-8">Loading...</div>}

          {images.length === 0 && !loading && (
            <p className="text-center text-gray-500">No pictures can be found.</p>
          )}

          {images.length > 0 && (
            <>
              <div className="masonry-grid">
                {images.map((img, idx) => (
                  <div
                    key={img.id ?? `img-${idx}`}
                    className="mb-4 group relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-shadow masonry-item cursor-pointer"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img
                      src={img.signedUrl}
                      alt={img.violation || 'Violation'}
                      className="w-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    </div>
                  </div>
                ))}
              </div>

              {/* PAGINATION */}
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Page</span>
                  <span className="font-semibold text-lg">{currentPage}</span>
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={!hasMore}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
      {/* MODAL */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300 z-10"
            >
              ×
            </button>

            <img
              src={selectedImage.signedUrl}
              alt={selectedImage.violation || 'Violation'}
              className="w-full h-auto max-h-screen object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ImagesShow;