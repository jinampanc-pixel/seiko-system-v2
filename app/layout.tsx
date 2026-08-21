import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seiko System V2",
  description: "Labels, scanning and end-to-end business traceability for Seiko System V2.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "Seiko System V2",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Seiko V2" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
