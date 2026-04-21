import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RegenerateButtonProps {
  onRegenerate: () => void;
}

// Button that forces immediate PIN rotation, invalidating the current one.
export function RegenerateButton({ onRegenerate }: RegenerateButtonProps) {
  return (
    <Button variant="outline" onClick={onRegenerate} aria-label="Régénérer le code maintenant">
      <RefreshCw className="mr-2 size-4" aria-hidden />
      Régénérer maintenant
    </Button>
  );
}
