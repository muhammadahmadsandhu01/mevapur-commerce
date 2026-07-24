import {
  PaymentRequest,
  PaymentResult
} from "./index";

export async function processCODPayment(
  data: PaymentRequest
): Promise<PaymentResult> {

  return {

    success: true,

    provider: "COD",

    status: "pending",

    transactionId: "",

    message: "Cash on Delivery selected"

  };

}