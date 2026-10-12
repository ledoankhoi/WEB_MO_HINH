import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-xl border bg-surface px-3.5 text-sm text-fg placeholder:text-muted/60 transition " +
  "focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none disabled:opacity-60";

const borderClass = (error?: string) => (error ? "border-danger" : "border-line");

type Common = { label: string; name: string; error?: string; hint?: ReactNode };

function Wrapper({ label, name, error, hint, required, children }: Common & { required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, error?: string, hint?: ReactNode) =>
  error ? `${name}-error` : hint ? `${name}-hint` : undefined;

export function Field({ label, name, error, hint, className = "", ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrapper label={label} name={name} error={error} hint={hint} required={props.required}>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        {...props}
        className={`h-11 ${CONTROL} ${borderClass(error)} ${className}`}
      />
    </Wrapper>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  className = "",
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrapper label={label} name={name} error={error} hint={hint} required={props.required}>
      <textarea
        id={name}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        {...props}
        className={`py-2.5 ${CONTROL} ${borderClass(error)} ${className}`}
      />
    </Wrapper>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  className = "",
  children,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrapper label={label} name={name} error={error} hint={hint} required={props.required}>
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        {...props}
        className={`h-11 ${CONTROL} ${borderClass(error)} ${className}`}
      >
        {children}
      </select>
    </Wrapper>
  );
}
