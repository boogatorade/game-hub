import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Game Hub",
  description: "Multiplayer browser games with realtime rooms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Link href="/" className="text-lg font-bold tracking-tight text-white">Game Hub</Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-300">
              <Link href="/" className="hover:text-white">Games</Link>
              <Link href="/pro" className="rounded-md border border-white/15 px-3 py-1.5 hover:border-white/35 hover:text-white">Pro</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t border-white/10 py-6">
          <div className="mx-auto flex max-w-6xl justify-between px-5 text-sm text-zinc-500 sm:px-8">
            <span>Game Hub</span>
            <Link href="/pro" className="hover:text-zinc-200">/pro</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
