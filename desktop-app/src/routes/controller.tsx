import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PinInput } from "@/components/pin-input";
import { formatPin } from "@/features/pin/pin-generator";
import { useAppState } from "@/app-state";

// Controller view — PIN entry screen.
// Phase 3: handleConnect envoie un connect_request au serveur de signaling
// via session.requestConnect (useSession → SignalingApi.send).
export function ControllerRoute() {
  const { signaling, session } = useAppState();
  const [pin, setPin] = useState("");

  // The button is active only when exactly 9 digits have been entered.
  const complete = pin.length === 9 && /^\d{9}$/.test(pin);

  function handleConnect() {
    if (!complete) return;
    // Envoie le PIN (formatté avec tirets) au serveur de signaling.
    session.requestConnect(formatPin(pin));
  }

  return (
    <main
      data-testid="controller-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <StatusBadge state={signaling.connection} />
          </div>
          <CardTitle className="mt-2 text-2xl">Saisissez le code</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Entrez les 9 chiffres communiqués par la personne que vous allez dépanner.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {/* onComplete is intentionally a no-op here — handleConnect handles submission. */}
          <PinInput
            value={pin}
            onChange={setPin}
            onComplete={() => undefined}
          />
          <Button
            size="lg"
            onClick={handleConnect}
            disabled={!complete}
            className="min-w-48"
          >
            Se connecter
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
