import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareBridge — Global Healthcare. Trusted Care. Smarter Costs.",
  description: "Connect with qualified specialists through convenient virtual consultations with transparent pricing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
