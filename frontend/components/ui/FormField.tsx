'use client';

import { useId } from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}

export function FormField({ label, required, error, helperText, children }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="label-input">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': !!error,
      })}
      {error && (
        <p id={errorId} className="text-xs text-red-500 mt-1" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperId} className="text-xs text-gray-400 mt-1">
          {helperText}
        </p>
      )}
    </div>
  );
}
