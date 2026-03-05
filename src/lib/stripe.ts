import { loadStripe } from "@stripe/stripe-js"

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

if (!stripePublishableKey) {
  console.warn(
    "Missing Stripe publishable key. Check VITE_STRIPE_PUBLISHABLE_KEY in your .env file."
  )
}

export const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null
