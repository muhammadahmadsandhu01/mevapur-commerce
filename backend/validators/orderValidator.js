const { z } = require('zod');

/**
 * Schema for Creating an Order
 * Ensures client sends only raw data (IDs, quantities), no prices
 */
const createOrderSchema = z.object({
  items: z.array(z.object({
    product: z.string().min(1, "Product ID is required"),
    quantity: z.number().int().positive("Quantity must be a positive integer")
  })).min(1, "Order must have at least one item"),
  
  shippingAddress: z.object({
    fullName: z.string().min(3, "Full name is required (min 3 chars)"),
    phone: z.string().regex(/^03\d{9}$/, "Valid Pakistani phone number required (03XXXXXXXXX)"),
    address: z.string().min(10, "Complete street address is required"),
    city: z.string().min(2, "City is required"),
    postalCode: z.string().regex(/^\d{5}$/, "5-digit postal code required")
  }),
  
  paymentMethod: z.enum(['COD', 'visa', 'mastercard', 'jazzcash'], {
    errorMap: () => ({ message: "Invalid payment method selected" })
  }),
  
  couponCode: z.string().optional(),
  notes: z.string().max(500, "Notes cannot exceed 500 characters").optional()
});

module.exports = {
  createOrderSchema
};