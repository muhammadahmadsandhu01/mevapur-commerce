"use client";

import Card from "@/components/ui/Card";
import InputField from "@/components/ui/InputField";
import { Mail } from "lucide-react";

interface ContactFormProps {
  formData: {
    fullName: string;
    email: string;
    phone: string;
  };
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFieldBlur: (field: string) => (e: React.FocusEvent<HTMLInputElement>) => void;
}

export default function ContactForm({
  formData,
  errors,
  touched,
  handleChange,
  handleFieldBlur,
}: ContactFormProps) {
  
  // Helper for phone border color logic (moved from parent)
  const getPhoneBorderColor = () => {
    if (errors.phone && touched.phone) return "#EF4444";
    if (touched.phone) return "#0F766E";
    return "#E5E7EB";
  };

  return (
    <Card>
      <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2.5">
        <Mail size={22} className="text-teal-700" /> 
        Contact Information
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Full Name */}
        <InputField
          label="Full Name *"
          name="fullName"
          value={formData.fullName}
          onChange={handleChange}
          onBlur={handleFieldBlur("fullName")}
          placeholder="Enter your full name"
          error={touched.fullName ? errors.fullName : undefined}
        />

        {/* Email */}
        <InputField
          label="Email *"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          onBlur={handleFieldBlur("email")}
          placeholder="your@email.com"
          error={touched.email ? errors.email : undefined}
        />
      </div>

      {/* Phone Number (Custom Layout so kept inline for now) */}
      <div className="mt-5 relative">
        <label 
          className={`absolute left-4 bg-white px-1 transition-all duration-200 pointer-events-none
            ${formData.phone ? '-top-2.5 text-xs font-bold text-teal-700' : 'top-3.5 text-sm font-semibold text-gray-500'}
          `}
        >
          📱 Phone Number *
        </label>
        
        <div className="flex">
          <div 
            className="bg-gray-50 px-4 py-3 rounded-l-xl border-y-2 border-l-2 flex items-center font-bold text-gray-700 text-sm whitespace-nowrap"
            style={{ 
              borderColor: getPhoneBorderColor(),
            }}
          >
            🇵🇰 +92
          </div>
          <input 
            name="phone" 
            value={formData.phone} 
            onChange={handleChange} 
            onBlur={handleFieldBlur("phone")}
            className="flex-1 bg-gray-50 border-y-2 border-r-2 border-l-0 rounded-r-xl px-4 py-3 outline-none transition-all duration-200 font-medium text-gray-900 placeholder-gray-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            style={{ 
              borderColor: getPhoneBorderColor(),
              paddingTop: formData.phone ? '24px' : '12px', // Adjust for floating label if needed, but standard padding works here
            }}
            placeholder="03XX XXXXXXX"
          />
        </div>
        
        {errors.phone && touched.phone && (
          <p className="text-xs text-red-500 font-bold mt-1.5 ml-1">❌ {errors.phone}</p>
        )}
      </div>
    </Card>
  );
}