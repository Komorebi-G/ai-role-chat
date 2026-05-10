"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import en from "@/locales/en";
import zhCN from "@/locales/zh-CN";

// ---- Types ----

export type Locale = "en" | "zh-CN";
export type TranslationKey = keyof typeof en;
type TranslationMap = Record<TranslationKey, string>;

// ---- Translation maps ----

const translations: Record<Locale, TranslationMap> = {
  en,
  "zh-CN": zhCN,
};

// ---- Language detection ----

function detectBrowserLanguage(): Locale {
  if (typeof window === "undefined") return "en";
  const nav = window.navigator.language || "";
  return nav.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function loadStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem("locale");
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch { /* ignore */ }
  return detectBrowserLanguage();
}

function saveStoredLocale(locale: Locale) {
  try { localStorage.setItem("locale", locale); } catch { /* ignore */ }
}

// ---- Context ----

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, ...args: (string | number)[]) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

// ---- Provider ----

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(loadStoredLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    saveStoredLocale(l);
  }, []);

  const t = useCallback(
    (key: TranslationKey, ...args: (string | number)[]): string => {
      const dict = translations[locale];
      const template = dict[key] ?? key;
      if (args.length === 0) return template;
      return template.replace(/{(\d+)}/g, (_, idx) => String(args[Number(idx)] ?? ""));
    },
    [locale]
  );

  // Avoid SSR mismatch — render children only after hydration
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: "en", setLocale, t }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ---- Hook ----

export function useTranslation() {
  return useContext(I18nContext);
}

// ---- Standalone translate (non-React contexts) ----

export function translate(locale: Locale, key: TranslationKey, ...args: (string | number)[]): string {
  const dict = translations[locale];
  const template = dict[key] ?? key;
  if (args.length === 0) return template;
  return template.replace(/{(\d+)}/g, (_, idx) => String(args[Number(idx)] ?? ""));
}
