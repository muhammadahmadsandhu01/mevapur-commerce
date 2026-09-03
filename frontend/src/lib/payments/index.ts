import { processCODPayment } from "./cod";
import { processStripePayment } from "./stripe";
import { processJazzCashPayment } from "./jazzcash";
import type { PaymentProvider } from "@/services/payment.service";

export type PaymentMethod = PaymentProvider;

export interface PaymentRequest {
  amount: number;
  currency?: string;
  orderId?: string;
  customerName?: string;
  customerEmail?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  provider: string;
  status: "pending" | "paid" | "failed";
  message?: string;
}

export async function processPayment(
  method: PaymentMethod,
  data: PaymentRequest
): Promise<PaymentResult> {
  switch (method) {
    case "cod":
      return processCODPayment(data);

    case "stripe":
      return processStripePayment(data);

    case "jazzcash":
    case "easypaisa":
      return processJazzCashPayment(data);

    case "bank_transfer":
    case "raast":
      return {
        success: true,
        provider: method,
        status: "pending",
        message: "Manual payment instructions required"
      };

    default:
      return {
        success: false,
        provider: "unknown",
        status: "failed",
        message: "Unsupported payment method"
      };
  }
}