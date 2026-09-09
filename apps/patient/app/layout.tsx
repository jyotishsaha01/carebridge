import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareBridge — Global Healthcare. Trusted Care. Smarter Costs.",
  description: "Affordable specialist consultations with a modern, patient-first CareBridge experience.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
