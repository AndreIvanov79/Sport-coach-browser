import type { Lang } from "../types.ts";
import { ru } from "./ru.ts";
import { en } from "./en.ts";
import { ro } from "./ro.ts";
export type Dict = Record<string, string>;
export const DICTS: Record<Lang, Dict> = { ru, en, ro };
export const LANGS: Lang[] = ["ru", "en", "ro"];
const STORE = "sport-coach-lang";
export function detectLang(): Lang {
 try { const saved = localStorage.getItem(STORE) as Lang | null; if (saved && LANGS.includes(saved)) return saved; } catch { /* storage unavailable */ }
 const nav = typeof navigator !== "undefined" ? (navigator.languages?.[0] ?? navigator.language ?? "") : "";
 const code = nav.toLowerCase().slice(0, 2);
 return code === "ru" || code === "uk" || code === "be" ? "ru" : code === "ro" || code === "mo" ? "ro" : code ? "en" : "ru";
}
let lang: Lang = typeof window === "undefined" ? "ru" : detectLang();
export const getLang = () => lang;
export function setLang(next: Lang) { lang = next; try { localStorage.setItem(STORE, next); } catch { /* ignore */ } if (typeof document !== "undefined") document.documentElement.lang = next; }
export function t(key: string, params?: Record<string, string | number | undefined>): string {
 const s = DICTS[lang][key] ?? DICTS.ru[key] ?? key;
 return params ? s.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? String(params[k]) : "") : s;
}
export const has = (key: string) => key in DICTS[lang] || key in DICTS.ru;
export const speechLang = () => ({ ru: "ru-RU", en: "en-US", ro: "ro-RO" }[lang]);
