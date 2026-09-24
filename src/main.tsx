import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OutlookEmail from "./OutlookEmail";
import OutlookEmailPreview from "./OutlookEmailPreview";
import OutlookEmailKeywords from "./OutlookEmailKeywords";
import OutlookEmailPreviewRefresh from "./OutlookEmailPreviewRefresh";
import OutlookEmailCommonFiles from "./OutlookEmailCommonFiles";
import OutlookEmailModeStyleFix from "./OutlookEmailModeStyleFix";
import OutlookEmailSingleDraftFix from "./OutlookEmailSingleDraftFix";
import OutlookEmailAutoSendPackageSafe from "./OutlookEmailAutoSendPackageSafe";
import OutlookEmailAndroidHelper from "./OutlookEmailAndroidHelper";

const hasAdminSession = Boolean(localStorage.getItem("admin_session"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <OutlookEmail />
    {hasAdminSession && <OutlookEmailPreview />}
    {hasAdminSession && <OutlookEmailKeywords />}
    {hasAdminSession && <OutlookEmailPreviewRefresh />}
    {hasAdminSession && <OutlookEmailCommonFiles />}
    {hasAdminSession && <OutlookEmailModeStyleFix />}
    {hasAdminSession && <OutlookEmailSingleDraftFix />}
    {hasAdminSession && <OutlookEmailAutoSendPackageSafe />}
    {hasAdminSession && <OutlookEmailAndroidHelper />}
  </React.StrictMode>
);


if ("serviceWorker" in navigator) {
  let reloadingForNewWorker = false;

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      if (reloadingForNewWorker) return;
      reloadingForNewWorker = true;
      window.location.reload();
    }
  );

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => {
        void registration.update();

        // Se la webapp resta aperta a lungo, ricontrolla
        // periodicamente la disponibilità di una nuova versione.
        window.setInterval(() => {
          void registration.update();
        }, 5 * 60 * 1000);
      })
      .catch((error) => {
        console.error(
          "PWA SERVICE WORKER REGISTRATION ERROR:",
          error
        );
      });
  });
}
