import "./globals.css";
import WorkspaceSession from "./workspace-session";

export const metadata = { robots: { index: false, follow: false }, title: "CareBridge Admin", description: "CareBridge operations console" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WorkspaceSession>{children}</WorkspaceSession></body></html>;
}
