import {
  PaymentRequest,
  PaymentResult
} from "./index";

export async function processJazzCashPayment(
  _data: PaymentRequest
): Promise<PaymentResult> {
  void _data;
  return {
    success: false,
    provider: "jazzcash",
    status: "failed",
    message: "JazzCash payments are not currently available."
  };
}
