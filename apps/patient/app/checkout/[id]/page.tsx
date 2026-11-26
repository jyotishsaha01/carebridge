"use client";

import { useParams } from "next/navigation";
import CheckoutForm from "../checkout-form";

export default function AppointmentCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  return <CheckoutForm key={id} appointmentId={id} />;
}
