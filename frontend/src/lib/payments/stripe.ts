import { paymentService } from "@/services/payment.service";
import type { PaymentRequest, PaymentResult } from "./index";

export async function processStripePayment(
  data: PaymentRequest
): Promise<PaymentResult> {
  if (!data.orderId) {
    return {
      success: false,
      provider: "stripe",
      status: "failed",
      message: "An order is required before payment can be initialized."
    };
  }

  const response = await paymentService.createPaymentSession({
    orderId: data.orderId,
    provider: "stripe"
  }, `legacy-payment-${globalThis.crypto.randomUUID()}`);

  return {
    success: response.success,
    provider: "stripe",
    status: "pending",
    transactionId: response.data.payment._id
  };
}
