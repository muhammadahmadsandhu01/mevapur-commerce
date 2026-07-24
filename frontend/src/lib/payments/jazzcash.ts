import {
  PaymentRequest,
  PaymentResult
} from "./index";

export async function processJazzCashPayment(
  data: PaymentRequest
): Promise<PaymentResult> {

  /*
      NEXT STEP

      JazzCash API

      Verify Payment

      Return transactionId
  */

  return {

    success: true,

    provider: "jazzcash",

    status: "paid",

    transactionId:
      "JAZZ_" + Date.now()

  };

}