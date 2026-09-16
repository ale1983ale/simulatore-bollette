import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OutlookEmail from "./OutlookEmail";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <OutlookEmail />
  </React.StrictMode>
);
