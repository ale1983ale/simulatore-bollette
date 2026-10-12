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
          window.location.href = "/Outlook-Invio-Android.apk";
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
