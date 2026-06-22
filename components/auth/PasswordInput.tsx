"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentPropsWithoutRef } from "react";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type">;

export function PasswordInput({ className = "", id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  return (
    <div className="cq-auth-password-field">
      <input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        className={`cq-auth-input cq-auth-password-input ${className}`.trim()}
      />
      <button
        type="button"
        className="cq-auth-password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputId}
        tabIndex={0}
      >
        {visible ? (
          <EyeOff className="h-[1.125rem] w-[1.125rem]" aria-hidden strokeWidth={2} />
        ) : (
          <Eye className="h-[1.125rem] w-[1.125rem]" aria-hidden strokeWidth={2} />
        )}
      </button>
    </div>
  );
}
