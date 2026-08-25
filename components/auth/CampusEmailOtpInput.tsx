"use client";

import { useRef } from "react";
import { CAMPUS_EMAIL_CODE_LENGTH } from "@/lib/campusEmailVerification";

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
};

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "").slice(0, CAMPUS_EMAIL_CODE_LENGTH);
}

export function CampusEmailOtpInput({ value, disabled, onChange, onComplete }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: CAMPUS_EMAIL_CODE_LENGTH }, (_, i) => value[i] ?? "");

  function commit(next: string) {
    const digits = digitsOnly(next);
    onChange(digits);
    if (digits.length === CAMPUS_EMAIL_CODE_LENGTH) {
      onComplete?.(digits);
    }
  }

  return (
    <div className="cq-onboard-otp" role="group" aria-label="6-digit verification code">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={index === 0 ? "cq-campus-otp-0" : undefined}
          className="cq-onboard-otp-cell"
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoCorrect="off"
          spellCheck={false}
          pattern="[0-9]*"
          maxLength={1}
          aria-label={`Digit ${index + 1} of ${CAMPUS_EMAIL_CODE_LENGTH}`}
          value={char}
          disabled={disabled}
          onChange={(event) => {
            const incoming = digitsOnly(event.target.value);
            if (!incoming) {
              const next = `${value.slice(0, index)}${value.slice(index + 1)}`;
              commit(next);
              return;
            }
            if (incoming.length > 1) {
              commit(`${value.slice(0, index)}${incoming}`);
              const focusAt = Math.min(index + incoming.length, CAMPUS_EMAIL_CODE_LENGTH - 1);
              refs.current[focusAt]?.focus();
              return;
            }
            const next = `${value.slice(0, index)}${incoming}${value.slice(index + 1)}`;
            commit(next);
            refs.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !chars[index] && index > 0) {
              event.preventDefault();
              commit(value.slice(0, index - 1) + value.slice(index));
              refs.current[index - 1]?.focus();
            }
          }}
          onPaste={(event) => {
            const pasted = digitsOnly(event.clipboardData.getData("text"));
            if (!pasted) return;
            event.preventDefault();
            commit(pasted);
            const focusAt = Math.min(pasted.length, CAMPUS_EMAIL_CODE_LENGTH) - 1;
            refs.current[Math.max(0, focusAt)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
