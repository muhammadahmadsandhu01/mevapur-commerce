import { useState, useMemo } from "react";
import { useCartStore } from "@/store/cartStore";
import { calculateTotals } from "@/lib/checkout/pricing";
import { validateField, validateAll } from "@/lib/checkout/validation";

const COUPONS: Record<string, number> = {
  MEVA20: 20,
  FIRSTORDER: 15,
  RAMADAN: 25,
  WELCOME: 10,
};

export const useCheckout = () => {
  const { items } = useCartStore();
  
  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    province: "Punjab",
    city: "Lahore",
    country: "Pakistan",
    postalCode: "",
    paymentMethod: "COD",
    notes: "",
  });

  // UI State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  // Derived State (Calculations)
  const discountPercent = useMemo(() => {
    return appliedCoupon ? COUPONS[appliedCoupon] || 0 : 0;
  }, [appliedCoupon]);

  const totals = useMemo(() => {
    return calculateTotals(items, discountPercent);
  }, [items, discountPercent]);

  // Handlers
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleBlur = (fieldName: string) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const error = validateField(fieldName, formData[fieldName as keyof typeof formData]);
    if (error) setErrors((prev) => ({ ...prev, [fieldName]: error }));
  };

  const applyCoupon = () => {
    const code = couponCode.toUpperCase().trim();
    if (COUPONS[code]) {
      setAppliedCoupon(code);
      return { success: true, message: `Coupon ${code} applied!` };
    }
    return { success: false, message: "Invalid coupon code." };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
  };

  const validateForm = () => {
    const newErrors = validateAll(formData);
    setErrors(newErrors);
    setTouched(
      Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {})
    );
    return Object.keys(newErrors).length === 0;
  };

  return {
    formData,
    errors,
    touched,
    couponCode,
    appliedCoupon,
    totals,
    handleChange,
    handleBlur,
    applyCoupon,
    removeCoupon,
    validateForm,
    setFormData,
  };
};