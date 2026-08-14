import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seiko Operations",
  description: "Labels, scanning and end-to-end business traceability for Seiko System V2.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
