const reloadToLatestLunaris = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('Lunaris cache recovery failed', error);
  } finally {
    window.location.replace(`/?lunaris_refresh=${Date.now()}`);
  }
};

reloadToLatestLunaris();
