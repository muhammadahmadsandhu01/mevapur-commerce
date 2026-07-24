export interface ValidationErrors {
  [key: string]: string;
}

export const validateField = (
  name: string,
  value: string
): string | null => {
  switch (name) {
    case "fullName":
      if (!value.trim()) return "Full name is required";
      if (value.trim().length < 3) return "Name must be at least 3 characters";
      return null;

    case "email":
      if (!value.trim()) return "Email is required";
      if (!/\S+@\S+\.\S+/.test(value)) return "Invalid email address";
      return null;

    case "phone":
      if (!value.trim()) return "Phone number is required";
      if (!/^03\d{9}$/.test(value.replace(/\s/g, "")))
        return "Valid Pakistani number required (e.g., 03001234567)";
      return null;

    case "address":
      if (!value.trim()) return "Address is required";
      if (value.trim().length < 10) return "Please enter complete address";
      return null;

    case "postalCode":
      if (!value.trim()) return "Postal code is required";
      if (!/^\d{5}$/.test(value)) return "Enter 5-digit postal code";
      return null;

    default:
      return null;
  }
};

export const validateAll = (data: Record<string, string>): ValidationErrors => {
  const errors: ValidationErrors = {};
  const fields = ["fullName", "email", "phone", "address", "postalCode"];

  fields.forEach((field) => {
    const error = validateField(field, data[field]);
    if (error) errors[field] = error;
  });

  return errors;
};