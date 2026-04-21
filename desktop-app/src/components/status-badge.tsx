import { Wifi, WifiOff, RotateCw, CircleOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ConnectionState } from "@/features/signaling/signaling.types";

interface StatusBadgeProps {
  state: ConnectionState;
  className?: string;
}

// Compact visual indicator for the signaling connection state.
// Renders icon + short French label; colors use the shadcn theme tokens.
export function StatusBadge({ state, className }: StatusBadgeProps) {
  const config = BADGES[state];
  const Icon = config.icon;
  return (
    <span
      role="status"
      aria-label={`Statut signaling : ${config.label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {config.label}
    </span>
  );
}

const BADGES: Record<ConnectionState, { icon: typeof Wifi; label: string; className: string }> = {
  open: { icon: Wifi, label: "Connecté", className: "bg-primary/10 text-primary" },
  connecting: { icon: RotateCw, label: "Connexion…", className: "bg-muted text-muted-foreground" },
  reconnecting: { icon: RotateCw, label: "Reconnexion…", className: "bg-amber-500/10 text-amber-600" },
  offline: { icon: WifiOff, label: "Hors ligne", className: "bg-destructive/10 text-destructive" },
  disabled: { icon: CircleOff, label: "Désactivé", className: "bg-muted text-muted-foreground" },
};
