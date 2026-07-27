export interface ValidationErrors {
  [key: string]: string;
}

// Base validation function
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

// --- Enterprise Secure Validation ---

interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrors;
}

// FIX ADDED HERE: Index signature added for compatibility
interface AddressData {
  [key: string]: string; 
  fullName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

export const secureValidation = {
  /**
   * Validate complete checkout form with enhanced security
   */
  validateCheckout: (address: AddressData, couponCode?: string): ValidationResult => {
    const errors: ValidationErrors = {};
    
    // Basic field validation
    const baseErrors = validateAll(address);
    Object.assign(errors, baseErrors);
    
    // Additional validations
    if (couponCode) {
      if (couponCode.length < 3) {
        errors.couponCode = 'Coupon code too short';
      }
      if (!/^[A-Z0-9_-]+$/i.test(couponCode)) {
        errors.couponCode = 'Invalid coupon format';
      }
    }
    
    // Phone number specific validation for Pakistan
    if (address.phone) {
      const phoneRegex = /^03\d{9}$/;
      if (!phoneRegex.test(address.phone.replace(/\s/g, ''))) {
        errors.phone = 'Valid Pakistani mobile number required (03XXXXXXXXX)';
      }
    }
    
    // Address complexity validation
    if (address.address) {
      const words = address.address.trim().split(/\s+/);
      if (words.length < 3) {
        errors.address = 'Please provide a complete address with street, area, and landmark';
      }
    }
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  },

  /**
   * Sanitize user input before sending to server
   */
  sanitizeInput: (input: string): string => {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/script/gi, '') // Prevent script injection
      .slice(0, 500); // Limit length
  },

  /**
   * Validate individual field with security enhancements
   */
  validateFieldSecure: (name: string, value: string): string | null => {
    const sanitizedValue = secureValidation.sanitizeInput(value);
    
    // Use base validation
    const baseError = validateField(name, sanitizedValue);
    if (baseError) return baseError;
    
    // Additional field-specific validations
    switch (name) {
      case 'fullName':
        if (sanitizedValue.split(' ').length < 2) {
          return 'Please enter both first and last name';
        }
        break;
      
      case 'phone':
        if (!/^03\d{9}$/.test(sanitizedValue.replace(/\s/g, ''))) {
          return 'Valid Pakistani mobile number required (03XXXXXXXXX)';
        }
        break;
      
      case 'address':
        if (sanitizedValue.length < 15) {
          return 'Please provide a detailed address';
        }
        break;
    }
    
    return null;
  }
};