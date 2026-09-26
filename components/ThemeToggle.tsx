"use client";

import React, { useSyncExternalStore } from "react";
import { useTheme } from "@/lib/ThemeContext";
import { Sun, Moon } from "lucide-react";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const isDark = isClient ? theme === "dark" : true;
  const tooltipText = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";

  return (
    <div className="relative group inline-flex items-center">
      <button
        onClick={toggleTheme}
        type="button"
        title={tooltipText}
        aria-label={tooltipText}
        className="p-2 sm:px-2.5 sm:py-2 rounded-lg border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#2A2A2A] hover:bg-gray-100 dark:hover:bg-[#333333] hover:border-[#D4AF37]/60 text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
      >
        {isDark ? (
          <Sun className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#D4AF37] group-hover:rotate-45 transition-transform duration-300" />
        ) : (
          <Moon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-slate-700 dark:text-gray-300 group-hover:-rotate-12 transition-transform duration-300" />
        )}
        <span className="text-xs font-semibold hidden lg:inline-block text-gray-700 dark:text-gray-200">
          {isDark ? "Light" : "Dark"}
        </span>
      </button>

      {/* Hover Tooltip matching header design */}
      <div className="absolute -bottom-9 right-0 sm:left-1/2 sm:-translate-x-1/2 px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap bg-gray-900 text-white dark:bg-[#1A1A1A] dark:text-gray-200 border border-gray-700 dark:border-[#444444] shadow-lg pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        {tooltipText}
      </div>
    </div>
  );
}

export default ThemeToggle;
