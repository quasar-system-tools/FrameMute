import React from "react";
import ReactDOM from "react-dom/client";
import FrameMuteWebApp from "./FrameMuteWebApp";

async function removeLegacyOfflineCache() {
  try {
    if ("serviceWorker" in navigator) {
      const appScope = new URL(import.meta.env.BASE_URL, window.location.href).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((registration) => registration.scope === appScope)
        .map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter((name) => name.startsWith("framemute-local-"))
        .map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.warn("Could not remove the legacy FrameMute offline cache", error);
  }
}

void removeLegacyOfflineCache();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FrameMuteWebApp />
  </React.StrictMode>,
);
