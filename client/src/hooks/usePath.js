import { useCallback, useEffect, useState } from 'react';

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const change = () => setPath(window.location.pathname);
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
  }, []);

  const go = useCallback(next => {
    window.history.pushState({}, '', next);
    setPath(next);
    window.scrollTo(0, 0);
  }, []);

  return [path, go];
}
