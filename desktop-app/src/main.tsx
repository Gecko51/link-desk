import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// React 18 strict-mode root. Strict mode is kept on throughout the app to
// catch side-effect regressions early during the UI-only phase.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
