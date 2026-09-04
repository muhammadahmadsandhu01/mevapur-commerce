"use client";

import { InputHTMLAttributes, forwardRef, useId } from "react";

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-semibold text-gray-700">
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          {...props}
          className={`w-full rounded-xl border px-4 py-3 bg-gray-50 outline-none transition duration-200
          ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200"
              : "border-gray-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100"
          }
          ${className}`}
        />

        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500 font-medium mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

InputField.displayName = "InputField";

export default InputField;
