const UNDO_MS = 5000;

export function mountToasts(container) {
  return {
    push({ message, onUndo, timeout = onUndo ? UNDO_MS : 3200 }) {
      const toast = document.createElement("div");
      toast.className = "undo-toast";
      toast.setAttribute("role", "status");
      const text = document.createElement("p");
      text.className = "undo-message";
      text.textContent = message;
      toast.append(text);
      const timer = document.createElement("span");
      timer.className = "undo-timer";
      timer.setAttribute("aria-hidden", "true");
      timer.style.animationDuration = `${timeout}ms`;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        toast.remove();
      };
      const timeoutId = window.setTimeout(finish, timeout);
      if (onUndo) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "undo-button";
        button.textContent = "Undo";
        button.addEventListener("click", () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          button.disabled = true;
          timer.remove();
          Promise.resolve()
            .then(onUndo)
            .then(() => toast.remove())
            .catch((error) => {
              text.textContent = error?.message || "Couldn't undo that.";
              button.remove();
              window.setTimeout(() => toast.remove(), 2800);
            });
        });
        toast.append(button);
      }
      toast.append(timer);
      container.append(toast);
    },
  };
}
