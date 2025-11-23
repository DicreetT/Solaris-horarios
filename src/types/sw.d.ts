// Service Worker global type definitions
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: any;
};
