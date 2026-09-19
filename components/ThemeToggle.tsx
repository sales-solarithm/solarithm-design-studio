"use client";

import { useTheme } from '@/lib/ThemeContext';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme, toggleTheme } = useTheme();

  const handleSelect = (mode: 'light' | 'dark' | 'system') => {
    setTheme(mode);
    if (typeof window !== 'undefined') {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      if (mode === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else if (mode === 'light') {
        root.classList.add('light');
        root.style.colorScheme = 'light';
      } else {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(isDark ? 'dark' : 'light');
        root.style.colorScheme = isDark ? 'dark' : 'light';
      }
    }
  };

  const handleDirectClick = () => {
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      const nextTheme = isDark ? 'light' : 'dark';
      handleSelect(nextTheme);
    } else {
      toggleTheme();
    }
  };

  return (
    <div className="relative group">
      <button 
        onClick={handleDirectClick}
        type="button"
        title={`Current mode: ${theme}. Click to switch between Light and Dark`}
        aria-label="Switch Theme Mode"
        className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2A2A2A] hover:bg-gray-100 dark:hover:bg-[#333333] text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-200 cursor-pointer flex items-center justify-center active:scale-95"
      >
        {theme === 'light' ? (
          <Sun size={18} className="text-amber-500" />
        ) : theme === 'dark' ? (
          <Moon size={18} className="text-[#D4AF37]" />
        ) : (
          <Monitor size={18} className="text-amber-500 dark:text-[#D4AF37]" />
        )}
      </button>
      
      {/* Dropdown Menu on hover */}
      <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 py-1">
        <button 
          type="button"
          onClick={() => handleSelect('light')} 
          className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors ${theme === 'light' ? 'text-[#D4AF37] font-bold bg-amber-50/50 dark:bg-transparent' : 'text-gray-700 dark:text-gray-300'}`}
        >
          <Sun size={14} className="text-amber-500" /> Light
        </button>
        <button 
          type="button"
          onClick={() => handleSelect('dark')} 
          className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors ${theme === 'dark' ? 'text-[#D4AF37] font-bold bg-amber-50/50 dark:bg-transparent' : 'text-gray-700 dark:text-gray-300'}`}
        >
          <Moon size={14} className="text-[#D4AF37]" /> Dark
        </button>
        <button 
          type="button"
          onClick={() => handleSelect('system')} 
          className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors ${theme === 'system' ? 'text-[#D4AF37] font-bold bg-amber-50/50 dark:bg-transparent' : 'text-gray-700 dark:text-gray-300'}`}
        >
          <Monitor size={14} className="text-gray-500 dark:text-gray-400" /> System
        </button>
      </div>
    </div>
  );
}

export default ThemeToggle;
