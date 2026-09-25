"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem("txkpro-theme", theme);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <MoonIcon className="theme-icon theme-icon-moon" />
        <SunIcon className="theme-icon theme-icon-sun" />
      </span>
      <span className="theme-toggle-label">Theme</span>
    </button>
  );
}
