import type { Metadata } from "next";
import "./globals.css";
import WorkspaceSession from "./workspace-session";

export const metadata: Metadata = {
  title: "CareBridge Doctor Workspace",
  robots: { index: false, follow: false },
  description: "Clinical workspace for CareBridge healthcare professionals.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WorkspaceSession>{children}</WorkspaceSession></body>
    </html>
  );
}
