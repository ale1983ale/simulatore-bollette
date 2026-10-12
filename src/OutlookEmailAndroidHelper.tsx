import { useEffect } from "react";

export default function OutlookEmailAndroidHelper() {
  useEffect(() => {
    const ensure = () => {
      const windowsButton = document.querySelector<HTMLButtonElement>('[data-auto-send-outlook="true"]');
      if (!windowsButton?.parentElement) return;
      const row = windowsButton.parentElement;

      if (!row.querySelector('[data-android-install="true"]')) {
        const installButton = document.createElement("button");
        installButton.type = "button";
        installButton.dataset.androidInstall = "true";
        installButton.textContent = "📱 Installa app Android";
        installButton.style.border = "0";
        installButton.style.borderRadius = "10px";
        installButton.style.padding = "10px 14px";
        installButton.style.fontWeight = "700";
        installButton.style.cursor = "pointer";
        installButton.style.background = "#334155";
        installButton.style.color = "white";
        installButton.addEventListener("click", () => {
          const downloadUrl = new URL("/Outlook-Invio-Android.apk", window.location.origin).href;
          const native = (window as Window & { AndroidFiles?: { openExternalUrl?: (url: string) => void } }).AndroidFiles;
          if (typeof native?.openExternalUrl === "function") {
            native.openExternalUrl(downloadUrl);
          } else if (/GestioneEnergiaAndroid/i.test(navigator.userAgent)) {
            window.alert("Questa versione dell'APK non può aprire il download. Aggiorna Gestione Energia alla versione 1.0.7 oppure apri simulatore-bollette.vercel.app in Chrome per installare l'app Invio Email Agenti.");
          } else {
            window.location.assign(downloadUrl);
          }
        });
        row.appendChild(installButton);
      }
    };

    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(ensure, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelector('[data-android-install="true"]')?.remove();
    };
  }, []);

  return null;
}
