import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/**
 * Create Stripe Payment Intent
 */
export const createPaymentIntent = async (amount: number) => {
  try {
    const token =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("mevapur-auth-storage") || "{}")
            ?.state?.token
        : null;

    const response = await axios.post(
      `${API_URL}/payments/create-payment-intent`,
      {
        amount,
        currency: "pkr",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;

  } catch (error: any) {
    throw new Error(
      error.response?.data?.message || "Failed to create payment."
    );
  }
};

/**
 * Verify Stripe Payment
 */
export const verifyStripePayment = async (
  paymentIntentId: string
) => {

  try {

    const token =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("mevapur-auth-storage") || "{}")
            ?.state?.token
        : null;

    const response = await axios.post(
      `${API_URL}/payments/verify`,
      {
        paymentIntentId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;

  } catch (error: any) {

    throw new Error(
      error.response?.data?.message || "Payment verification failed."
    );

  }

};