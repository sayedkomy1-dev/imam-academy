/* eslint-disable no-restricted-globals */
// Main PWA Service Worker Entry — delegates Push Notifications & Background Teacher Alerts to /sw-push.js
try {
  importScripts('/sw-push.js');
} catch {
  // Fallback if importScripts is unavailable
}
