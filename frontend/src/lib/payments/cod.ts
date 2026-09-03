import type {
  PaymentRequest,
  PaymentResult,
} from "./index";

export async function processCODPayment(
  _data?: PaymentRequest
): Promise<PaymentResult> {
  void _data;
  return {
    success: true,
    provider: "COD",
    status: "pending",
    transactionId: "",
    message: "Cash on Delivery selected",
  };
}