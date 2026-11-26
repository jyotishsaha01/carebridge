import type { Metadata } from "next";
import "./globals.css";
import PrivateSession from "./private-session";

export const metadata: Metadata = {
  title: "CareBridge — Global Healthcare. Trusted Care. Smarter Costs.",
  description: "Connect with qualified specialists through convenient virtual consultations with transparent pricing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to main content</a><div id="main-content" tabIndex={-1}><PrivateSession>{children}</PrivateSession></div></body>
    </html>
  );
}
