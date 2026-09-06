import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { WindowsProvider } from "~/components/window/window-context";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: {
    default: "Cipher — what a chain earns against what it costs",
    template: "%s — Cipher",
  },
  description:
    "Cipher measures the gap between what each major chain earns and what it costs, and ranks them by it. Built on DefiLlama, Artemis and Mayan.",
  openGraph: {
    title: "Cipher — what a chain earns against what it costs",
    description:
      "A valuation screen for blockchains: fundamentals versus what the market pays.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <TRPCReactProvider>
          <WindowsProvider>
            <div className="relative z-10">{children}</div>
          </WindowsProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
