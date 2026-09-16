import { useEffect } from "react";

function findButtons() {
  const common = document.querySelector<HTMLButtonElement>('[data-common-safe-mode="true"]');
  if (!common) return null;
  const row = common.parentElement;
  if (!row) return null;
  const single = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "File unico (consigliato)"
  );
  const separate = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "File già separati"
  );
  if (!single || !separate) return null;
  return { common, single, separate };
}

export default function OutlookEmailModeStyleFix() {
  useEffect(() => {
    const setInactiveStyle = (button: HTMLButtonElement) => {
      if (!button.dataset.modeStyleBg) {
        button.dataset.modeStyleBg = button.style.background || "";
        button.dataset.modeStyleColor = button.style.color || "";
      }
      button.style.background = "#e2e8f0";
      button.style.color = "#0f172a";
    };

    const restoreStyle = (button: HTMLButtonElement) => {
      if (button.dataset.modeStyleBg !== undefined) {
        button.style.background = button.dataset.modeStyleBg;
        button.style.color = button.dataset.modeStyleColor || "";
        delete button.dataset.modeStyleBg;
        delete button.dataset.modeStyleColor;
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const clicked = target.closest<HTMLButtonElement>("button");
      if (!clicked) return;

      const buttons = findButtons();
      if (!buttons) return;

      if (clicked === buttons.common) {
        setInactiveStyle(buttons.single);
        setInactiveStyle(buttons.separate);
        buttons.common.style.background = "#2563eb";
        buttons.common.style.color = "white";
        return;
      }

      if (clicked === buttons.single || clicked === buttons.separate) {
        restoreStyle(buttons.single);
        restoreStyle(buttons.separate);
        buttons.common.style.background = "#e2e8f0";
        buttons.common.style.color = "#0f172a";
      }
    };

    const keepCommonExclusive = () => {
      const buttons = findButtons();
      if (!buttons) return;
      const active = buttons.common.style.background === "rgb(37, 99, 235)" || buttons.common.style.background === "#2563eb";
      if (active) {
        setInactiveStyle(buttons.single);
        setInactiveStyle(buttons.separate);
      }
    };

    document.addEventListener("click", onClick, true);
    const timer = window.setInterval(keepCommonExclusive, 400);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearInterval(timer);
      const buttons = findButtons();
      if (buttons) {
        restoreStyle(buttons.single);
        restoreStyle(buttons.separate);
      }
    };
  }, []);

  return null;
}
