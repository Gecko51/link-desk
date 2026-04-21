import { cn } from "@/lib/cn";

interface PinDisplayProps {
  pin: string; // Expected format "XXX-XXX-XXX"
  className?: string;
}

// Large monospace display of the rotating PIN.
// Selectable text so users can copy manually (copy-button.tsx also provides a 1-click copy).
export function PinDisplay({ pin, className }: PinDisplayProps) {
  return (
    <p
      aria-label={`Code de connexion : ${pin.replace(/-/g, " ")}`}
      className={cn(
        "select-all font-mono text-6xl font-bold tracking-wider tabular-nums",
        className,
      )}
    >
      {pin}
    </p>
  );
}
