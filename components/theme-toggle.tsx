"use client";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem("txkpro-theme", theme);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  return (
    <>
      <style>{`html[data-theme="light"] .theme-icon-sun{display:none}html[data-theme="dark"] .theme-icon-moon{display:none}`}</style>
      <button className={`theme-toggle ${className}`.trim()} type="button" onClick={toggleTheme} aria-label="Toggle light and dark mode" title="Toggle light and dark mode">
        <span className="theme-toggle-icon" aria-hidden="true">
          <svg className="theme-icon theme-icon-moon" viewBox="0 0 24 24" role="presentation"><path d="M20.3 15.6A8.5 8.5 0 0 1 8.4 3.7 8.5 8.5 0 1 0 20.3 15.6Z" /></svg>
          <svg className="theme-icon theme-icon-sun" viewBox="0 0 24 24" role="presentation"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>
        </span>
        <span className="theme-toggle-label">Theme</span>
      </button>
    </>
  );
}
