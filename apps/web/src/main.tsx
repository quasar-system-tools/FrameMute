import React from "react";
import ReactDOM from "react-dom/client";
import { MasklyEditor } from "@maskly/editor";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MasklyEditor />
  </React.StrictMode>,
);
