import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: {
    default: "Chainbase — find the undervalued chain",
    template: "%s — Chainbase",
  },
  description:
    "Ranks every major blockchain by how cheap it trades relative to the fees, capital and users it actually has. Built on DefiLlama, Artemis and Mayan.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    title: "Chainbase — find the undervalued chain",
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
          <div className="relative z-10">{children}</div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
