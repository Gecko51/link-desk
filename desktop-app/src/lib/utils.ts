import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge tailwind classes while de-duplicating conflicting utilities.
// Shared helper used by every shadcn component. The `@/lib/cn` path
// re-exports this function for code that imports `cn` directly.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
