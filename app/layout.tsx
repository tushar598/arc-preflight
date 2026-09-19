import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arc Preflight — Stop paying gas for blocked transfers",
  description: "A zero-infrastructure SDK that intercepts USDC transfers to blocklisted addresses on Arc before they hit the network. Save gas, prevent reverts.",
  keywords: ["arc", "preflight", "usdc", "blocklist", "web3", "viem", "ethers"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ background: '#0A0B0F' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
