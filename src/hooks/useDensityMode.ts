import { useEffect, useState } from 'react';

export function useDensityMode() {
  const getMode = () => {
    if (typeof document === 'undefined') return 'comfortable';
    return document.documentElement.getAttribute('data-density') === 'compact'
      ? 'compact'
      : 'comfortable';
  };

  const [mode, setMode] = useState<'comfortable' | 'compact'>(getMode);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setMode(getMode());
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-density'] });
    return () => observer.disconnect();
  }, []);

  return mode;
}

export default useDensityMode;
