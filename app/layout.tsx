import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TFA Dashboard | The Future Animation Agency",
  description: "Management dashboard for TFA Animation Agency",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
