import { useEffect, useState } from 'react';

/** Hash routes: `#/app/office/<id>` → ['app', 'office', '<id>']. */
function read() {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function useRoute() {
  const [segments, setSegments] = useState(read);
  useEffect(() => {
    const onHash = () => setSegments(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return segments;
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}
