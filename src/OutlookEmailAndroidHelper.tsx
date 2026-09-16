import { useEffect } from "react";

export default function OutlookEmailAndroidHelper() {
  useEffect(() => {
    const ensure = () => {
      const windowsButton = document.querySelector<HTMLButtonElement>('[data-auto-send-outlook="true"]');
      if (!windowsButton?.parentElement) return;
      const row = windowsButton.parentElement;

      if (!row.querySelector('[data-android-package="true"]')) {
        const packageButton = document.createElement("button");
        packageButton.type = "button";
        packageButton.dataset.androidPackage = "true";
        packageButton.textContent = "📦 Pacchetto Android";
        packageButton.style.border = "0";
        packageButton.style.borderRadius = "10px";
        packageButton.style.padding = "10px 14px";
        packageButton.style.fontWeight = "700";
        packageButton.style.cursor = "pointer";
        packageButton.style.background = "#0f766e";
        packageButton.style.color = "white";
        packageButton.addEventListener("click", () => {
          windowsButton.click();
          window.setTimeout(() => {
            window.alert("Pacchetto creato. Sul telefono apri l'app 'Invio Email Agenti', seleziona lo ZIP e poi apri le email una alla volta in Outlook.");
          }, 700);
        });
        row.appendChild(packageButton);
      }

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
      document.querySelector('[data-android-package="true"]')?.remove();
      document.querySelector('[data-android-install="true"]')?.remove();
    };
  }, []);

  return null;
}
