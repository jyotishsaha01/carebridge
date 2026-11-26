import type { Metadata } from "next";
import "./globals.css";
import WorkspaceSession from "./workspace-session";
import PageNavigation from "./page-navigation";

export const metadata: Metadata = {
  title: "CareBridge Doctor Workspace",
  robots: { index: false, follow: false },
  description: "Clinical workspace for CareBridge healthcare professionals.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><PageNavigation /><WorkspaceSession>{children}</WorkspaceSession></body>
    </html>
  );
}
