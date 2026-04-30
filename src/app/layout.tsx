import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";

const AuthProvider = dynamic(() => import("@/lib/auth-context").then(mod => mod.AuthProvider), { 
  ssr: false,
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: 'swap' });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: 'swap' });

export const metadata: Metadata = {
  title: "House of Trials | Tech Fest",
  description: "Only one will remain. Alice in Borderland theme survival games.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${playfair.variable} ${jetbrainsMono.variable} font-sans antialiased bg-scanlines`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
