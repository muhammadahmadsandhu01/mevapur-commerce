"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// ForwardRef use kar rahe hain taake parent components se focus manage ho sake
const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">
          {label}
        </label>

        <input
          ref={ref}
          {...props}
          className={`w-full rounded-xl border px-4 py-3 bg-gray-50 outline-none transition duration-200
          ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200"
              : "border-gray-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          }
          ${className}`}
        />

        {error && (
          <p className="text-xs text-red-500 font-medium mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

InputField.displayName = "InputField";

export default InputField;