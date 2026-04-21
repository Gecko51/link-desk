import { cn } from "@/lib/cn";

interface PinTimerProps {
  secondsRemaining: number;
  totalSeconds: number;
  className?: string;
}

// Countdown bar + mm:ss label showing time until the next auto-rotation.
// Color shifts from green to amber to red as expiry approaches.
export function PinTimer({ secondsRemaining, totalSeconds, className }: PinTimerProps) {
  const progress = Math.max(0, Math.min(1, secondsRemaining / totalSeconds));
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const label = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Piecewise color: > 50% green, 20-50% amber, < 20% red.
  const barColor =
    progress > 0.5 ? "bg-primary" : progress > 0.2 ? "bg-amber-500" : "bg-destructive";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all duration-1000 ease-linear", barColor)}
          style={{ width: `${progress * 100}%` }}
          role="progressbar"
          aria-valuenow={secondsRemaining}
          aria-valuemin={0}
          aria-valuemax={totalSeconds}
          aria-label="Temps restant avant rotation du code"
        />
      </div>
      <span className="font-mono tabular-nums text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
