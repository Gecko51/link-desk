import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

interface PinInputProps {
  value: string; // 0-9 chars, digits only
  onChange: (next: string) => void;
  onComplete?: (full: string) => void; // Called once 9 digits are entered
  disabled?: boolean;
  className?: string;
}

const SLOT_COUNT = 9;
// Visual dash inserted after these slot indices (produces XXX-XXX-XXX layout).
const SEPARATOR_AFTER = new Set([2, 5]);

// 9-slot PIN input with auto-advance, backspace navigation and paste support.
// Accepts digits only. On reaching the 9th digit, onComplete fires once.
export function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  className,
}: PinInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Build a fixed-length array of single chars from the raw value string.
  const digits = Array.from({ length: SLOT_COUNT }, (_, i) => value[i] ?? "");

  // Replace the character at `index` with the first digit of `digit`, then
  // propagate the new full string up via onChange and auto-advance focus.
  function setDigitAt(index: number, digit: string) {
    const clean = digit.replace(/\D/g, "").slice(0, 1);
    const nextArr = [...digits];
    nextArr[index] = clean;
    const next = nextArr.join("");
    onChange(next);

    // Auto-advance to the next slot when a digit was typed.
    if (clean && index < SLOT_COUNT - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    // Fire onComplete only when all 9 slots are filled.
    if (next.length === SLOT_COUNT && !next.includes("") && onComplete) {
      onComplete(next);
    }
  }

  // Handle keyboard navigation: backspace jumps back, arrows move laterally.
  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < SLOT_COUNT - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  // Paste handler: strips non-digits, fills as many slots as available,
  // then moves focus to the last filled slot (or slot 8 if all filled).
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, SLOT_COUNT);
    if (!pasted) return;
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, SLOT_COUNT - 1);
    inputsRef.current[focusIndex]?.focus();
    if (pasted.length === SLOT_COUNT && onComplete) {
      onComplete(pasted);
    }
  }

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {digits.map((digit, i) => (
        // Wrap each input + optional separator in a flex container.
        <div key={i} className="flex items-center">
          <Input
            ref={(el) => {
              // Callback ref: store the DOM node in the mutable array.
              inputsRef.current[i] = el;
            }}
            value={digit}
            onChange={(e) => setDigitAt(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            disabled={disabled}
            aria-label={`Chiffre ${i + 1}`}
            className="size-12 text-center text-2xl font-mono tabular-nums"
          />
          {/* Visual dash separator after slot 2 and slot 5 only. */}
          {SEPARATOR_AFTER.has(i) && (
            <span aria-hidden className="px-1 text-xl text-muted-foreground">
              -
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
