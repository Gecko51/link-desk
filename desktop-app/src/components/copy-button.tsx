import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  label?: string;
}

// Copy-to-clipboard with a 2s success affordance (checkmark + toast).
// Falls back to a toast error if the Clipboard API is blocked.
export function CopyButton({ value, label = "Copier le code" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Code copié", {
        description: "Vous pouvez le coller maintenant.",
      });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Échec de la copie", {
        description: "Sélectionnez le code puis Ctrl+C.",
      });
    }
  }

  return (
    <Button variant="secondary" onClick={handleCopy} aria-label={label}>
      {copied ? (
        <Check className="mr-2 size-4" aria-hidden />
      ) : (
        <Copy className="mr-2 size-4" aria-hidden />
      )}
      {copied ? "Copié !" : label}
    </Button>
  );
}
