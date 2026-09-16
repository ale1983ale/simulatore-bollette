import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OutlookEmail from "./OutlookEmail";
import OutlookEmailPreview from "./OutlookEmailPreview";
import OutlookEmailKeywords from "./OutlookEmailKeywords";
import OutlookEmailPreviewRefresh from "./OutlookEmailPreviewRefresh";
import OutlookEmailCommonFiles from "./OutlookEmailCommonFiles";

const hasAdminSession = Boolean(localStorage.getItem("admin_session"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {hasAdminSession && <OutlookEmail />}
    {hasAdminSession && <OutlookEmailPreview />}
    {hasAdminSession && <OutlookEmailKeywords />}
    {hasAdminSession && <OutlookEmailPreviewRefresh />}
    {hasAdminSession && <OutlookEmailCommonFiles />}
  </React.StrictMode>
);
