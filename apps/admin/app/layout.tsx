import "./globals.css";

export const metadata = { title: "CareBridge Admin", description: "CareBridge operations console" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
