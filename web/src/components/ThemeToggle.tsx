import { useState, useEffect } from 'react';
import './ThemeToggle.css';

type Theme = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'system';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'system') {
        // If switching from system, determine current system pref and switch to opposite
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isSystemDark ? 'light' : 'dark';
      }
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  const getIcon = () => {
    if (theme === 'system') return '🌗';
    if (theme === 'light') return '☀️';
    return '🌙';
  };

  return (
    <button 
      className="theme-toggle" 
      onClick={toggleTheme} 
      title={`Tema: ${theme === 'system' ? 'Sistema' : theme === 'light' ? 'Claro' : 'Oscuro'}`}
    >
      {getIcon()}
    </button>
  );
}
