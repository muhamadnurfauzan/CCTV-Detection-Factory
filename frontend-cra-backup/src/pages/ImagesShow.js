// frontend/src/pages/ImagesShow.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import '../styles/LazyBlur.css';
import '../styles/MasonryGrid.css';

const breakpointColumns = {
  default: 5,
  1100: 4,
  700: 3,
  500: 2
};

const PAGE_SIZE = 20;

const ImagesShow = () => {
  const [searchParams] = useSearchParams();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const observer = useRef();

  // Extract path from URL
  const currentPath = {
    cctv: searchParams.get('cctv'),
    year: searchParams.get('year'),
    month: searchParams.get('month'),
    day: searchParams.get('day')
  };

  // Breadcrumb
  const breadcrumb = [
    { label: 'CCTV', path: '?' },
    currentPath.cctv && { label: `CCTV ${currentPath.cctv}`, path: `?cctv=${currentPath.cctv}` },
    currentPath.year && { label: currentPath.year, path: `?cctv=${currentPath.cctv}&year=${currentPath.year}` },
    currentPath.month && { label: format(new Date(currentPath.year, currentPath.month - 1), 'MMMM'), path: `?cctv=${currentPath.cctv}&year=${currentPath.year}&month=${currentPath.month}` },
    currentPath.day && { label: currentPath.day, path: `?cctv=${currentPath.cctv}&year=${currentPath.year}&month=${currentPath.month}&day=${currentPath.day}` }
  ].filter(Boolean);

  // Fetch function
    const fetchImages = useCallback(async (page = 1) => {
        if (loading || !hasMore) return;
        setLoading(true);

        try {
            const params = new URLSearchParams({
            page,
            limit: 20,
            ...(currentPath.cctv && { cctv: currentPath.cctv }),
            ...(currentPath.year && { year: currentPath.year }),
            ...(currentPath.month && { month: currentPath.month }),
            ...(currentPath.day && { day: currentPath.day })
            });

            const res = await fetch(`/supabase-api/violations?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { data, hasMore } = await res.json();

            setImages(prev => page === 1 ? data : [...prev, ...data]);
            setHasMore(hasMore);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [currentPath, loading, hasMore]);

  // Initial load
  useEffect(() => {
    setImages([]);
    setHasMore(true);
    fetchImages(0);
  }, [currentPath]);

  // Infinite scroll observer
  const lastImageRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchImages(images.length);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, images.length, fetchImages]);

  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center space-x-2 text-sm">
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

      <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">
        Violation Images {currentPath.cctv && `- CCTV ${currentPath.cctv}`}
        {currentPath.day && ` - ${format(new Date(currentPath.year, currentPath.month - 1, currentPath.day), 'dd MMM yyyy')}`}
      </h2>

      {/* Masonry Grid */}
      {images.length === 0 && !loading ? (
        <p className="text-center text-gray-500">No images found.</p>
      ) : (
        <div className="masonry-grid">
            {images.map((img, index) => (
                <div
                key={img.id}
                ref={index === images.length - 1 ? lastImageRef : null}
                className="mb-4 group relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-shadow masonry-item"
                >
                    <LazyLoadImage
                    src={img.signedUrl}
                    alt={img.violation}
                    effect="blur"
                    placeholderSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYIIA"
                    className="w-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                    wrapperClassName="w-full"
                    />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-sm font-semibold">{img.violation}</p>
                    <p className="text-xs">{format(new Date(img.timestamp), 'HH:mm:ss')}</p>
                </div>
                </div>
            ))}
        </div>
      )}

      {/* Loading & Load More */}
      {loading && <div className="text-center py-8">Loading more images...</div>}
      {!hasMore && images.length > 0 && (
        <div className="text-center py-8 text-gray-500">No more images.</div>
      )}
    </div>
  );
};

export default ImagesShow;