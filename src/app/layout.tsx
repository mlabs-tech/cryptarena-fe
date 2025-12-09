import type { Metadata } from "next";
import { Orbitron, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { SolanaWalletProvider } from "@/context/WalletContext";
import { PythStreamProvider } from "@/context/PythStreamContext";
import ScreenSizeGuard from "@/components/ScreenSizeGuard";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CryptArena - Battle with Crypto Champions",
  description: "Enter the arena and battle with your favorite crypto champions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${orbitron.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <AuthProvider>
          <SolanaWalletProvider>
            <PythStreamProvider>
              <ScreenSizeGuard>{children}</ScreenSizeGuard>
            </PythStreamProvider>
          </SolanaWalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
