import { processCODPayment } from "./cod";
import { processStripePayment } from "./stripe";
import { processJazzCashPayment } from "./jazzcash";

export type PaymentMethod =
  | "COD"
  | "visa"
  | "mastercard"
  | "jazzcash";

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

    case "COD":
      return processCODPayment(data);

    case "visa":
    case "mastercard":
      return processStripePayment(data);

    case "jazzcash":
      return processJazzCashPayment(data);

    default:
      return {
        success: false,
        provider: "unknown",
        status: "failed",
        message: "Unsupported payment method"
      };
  }
}