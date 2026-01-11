import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// FIX: Added SSR safety check to prevent crash on build
export const isIframe = typeof window !== 'undefined' ? window.self !== window.top : false;
