// Re-export cn from utils so both @/lib/cn and @/lib/utils resolve correctly.
// shadcn CLI generates components importing from @/lib/utils — this file
// exists for manual use and consistency with the plan's convention.
export { cn } from "./utils";
