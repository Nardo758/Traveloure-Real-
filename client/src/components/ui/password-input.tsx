import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * DX-4: one password input with an in-field show/hide control.
 *
 * Wraps the existing Input so every call site's props, ref, id, autoComplete,
 * data-testid and aria-* attributes are unchanged. The button is type="button"
 * (never submits), sits directly after the input in tab order, and the field
 * starts hidden. A form submit or a cleared control returns it to hidden.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, value, ...props }, forwardedRef) => {
  const [visible, setVisible] = React.useState(false);
  const localRef = React.useRef<HTMLInputElement | null>(null);
  const testId = (props as { "data-testid"?: string })["data-testid"];

  React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLInputElement);

  React.useEffect(() => {
    if (value === "" || value === null || value === undefined) setVisible(false);
  }, [value]);

  React.useEffect(() => {
    const form = localRef.current?.form;
    if (!form) return;
    const reset = () => setVisible(false);
    form.addEventListener("submit", reset);
    return () => form.removeEventListener("submit", reset);
  }, []);

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        ref={localRef}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
