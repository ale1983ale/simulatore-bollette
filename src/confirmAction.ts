/** Finestra di conferma condivisa: centrale, responsive e accessibile. */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.60);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(3px)";
    const panel = document.createElement("div");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Conferma operazione");
    panel.style.cssText = "width:min(440px,100%);max-height:85vh;overflow:auto;background:white;border-radius:20px;padding:26px;box-shadow:0 25px 75px rgba(15,23,42,.32);box-sizing:border-box;font-family:inherit;color:#0f172a";
    const icon = document.createElement("div");
    icon.textContent = "!";
    icon.style.cssText = "display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:#fff0e5;color:#ea580c;font-size:27px;font-weight:900;margin-bottom:16px";
    const title = document.createElement("h2");
    title.textContent = "Conferma operazione";
    title.style.cssText = "font-size:21px;font-weight:850;margin:0 0 10px";
    const description = document.createElement("p");
    description.textContent = message;
    description.style.cssText = "font-size:15px;line-height:1.55;color:#475569;white-space:pre-wrap;margin:0 0 24px";
    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap";
    const cancel = document.createElement("button");
    cancel.textContent = "ANNULLA";
    cancel.style.cssText = "border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:11px;padding:12px 18px;font-weight:800;cursor:pointer;font-size:14px";
    const confirm = document.createElement("button");
    confirm.textContent = "CONFERMA";
    confirm.style.cssText = "border:0;background:#f97316;color:white;border-radius:11px;padding:12px 20px;font-weight:850;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(249,115,22,.25)";
    let finished = false;
    const previousFocus = document.activeElement as HTMLElement | null;
    const finish = (value: boolean) => {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      previousFocus?.focus?.();
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
      if (event.key === "Tab") {
        const target = document.activeElement;
        if (event.shiftKey && target === cancel) { event.preventDefault(); confirm.focus(); }
        else if (!event.shiftKey && target === confirm) { event.preventDefault(); cancel.focus(); }
      }
    };
    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);
    backdrop.onclick = event => { if (event.target === backdrop) finish(false); };
    buttons.append(cancel, confirm);
    panel.append(icon, title, description, buttons);
    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener("keydown", onKey, true);
    cancel.focus();
  });
}
