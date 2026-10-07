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

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message:
        error instanceof Error
          ? error.message
          : "Errore imprevisto dell'app.",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("APP RENDER ERROR:", error, info);
  }

  private recover = async () => {
    try {
      localStorage.removeItem("app_tab");
      sessionStorage.removeItem("ge_app_recovery_attempted");

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      if ("serviceWorker" in navigator) {
        const registrations =
          await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) =>
            registration.unregister()
          )
        );
      }
    } catch (error) {
      console.warn("APP RECOVERY CLEANUP ERROR:", error);
    }

    window.location.replace("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f1f5f9",
          padding: 20,
          boxSizing: "border-box",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: "min(560px, 100%)",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 22,
            boxShadow: "0 16px 40px rgba(15,23,42,.12)",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            GESTIONE ENERGIA
          </div>
          <div
            style={{
              marginTop: 10,
              color: "#475569",
              lineHeight: 1.5,
            }}
          >
            L'app ha rilevato un problema di caricamento. Premi
            RIPRISTINA APP: la sessione di accesso resta salvata, mentre
            vengono aggiornati cache e file della webapp.
          </div>
          {this.state.message && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 9,
                background: "#fff7ed",
                color: "#9a3412",
                fontSize: 12,
                overflowWrap: "anywhere",
              }}
            >
              {this.state.message}
            </div>
          )}
          <button
            type="button"
            onClick={() => void this.recover()}
            style={{
              marginTop: 16,
              width: "100%",
              border: 0,
              borderRadius: 10,
              padding: "12px 14px",
              background: "#f97316",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            RIPRISTINA APP
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
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
    </AppErrorBoundary>
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
      .register("/sw.js?v=6", {
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
