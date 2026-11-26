import "./globals.css";
import WorkspaceSession from "./workspace-session";
import PageNavigation from "./page-navigation";

export const metadata = { robots: { index: false, follow: false }, title: "CareBridge Admin", description: "CareBridge operations console" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PageNavigation /><WorkspaceSession>{children}</WorkspaceSession></body></html>;
}
