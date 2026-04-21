import { CopyButton } from "@/components/copy-button";
import { PinDisplay } from "@/components/pin-display";
import { PinTimer } from "@/components/pin-timer";
import { RegenerateButton } from "@/components/regenerate-button";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_PIN_ROTATION_MS } from "@/features/pin/pin.types";
import { useAppState } from "@/app-state";

// Host view - shows the rotating PIN the user must share verbally.
// PRD §3 Module 1: 9-digit PIN, 30-min rotation, manual regen invalidates prior.
// PIN is no longer fetched locally — it is read from AppStateContext (hoisted in App.tsx).
export function HostRoute() {
  const { pinSession, secondsRemaining, regeneratePin, signaling } = useAppState();
  const totalSeconds = Math.round(DEFAULT_PIN_ROTATION_MS / 1000);

  return (
    <main
      data-testid="host-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <StatusBadge state={signaling.connection} />
          </div>
          <CardTitle className="mt-2 text-2xl">Votre code de connexion</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Communiquez ce code à la personne qui va se connecter.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <PinDisplay pin={pinSession.pin} />
          <PinTimer
            secondsRemaining={secondsRemaining}
            totalSeconds={totalSeconds}
            className="w-full"
          />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CopyButton value={pinSession.pin} />
            <RegenerateButton onRegenerate={regeneratePin} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
