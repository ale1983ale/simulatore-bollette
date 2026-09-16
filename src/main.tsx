import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OutlookEmail from "./OutlookEmail";

const hasAdminSession = Boolean(localStorage.getItem("admin_session"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {hasAdminSession && <OutlookEmail />}
  </React.StrictMode>
);
