import { useEffect, useState } from "react";
import { ThemeContext } from "./ThemeContext";

export default function ThemeProvider({ children }) {
  // Initialize state from localStorage if available, otherwise default to "system"
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") || "system";
    }
    return "system";
  });

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (mode) => {
      // 1. Remove both classes to start fresh
      root.classList.remove("light", "dark");

      if (mode === "system") {
        // Check user's OS preference
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.add(systemPrefersDark ? "dark" : "light");
      } else {
        // Force the selected mode
        root.classList.add(mode);
      }
    };

    applyTheme(theme);

    // 2. Save choice to localStorage
    localStorage.setItem("theme", theme);

    // 3. (Optional) Listen for system changes if mode is 'system'
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}