import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-code",
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
    <html lang="en" className={`${bricolage.variable} ${inter.variable} ${jetbrainsMono.variable} dark h-full`}>
      <body>
        <header className="top-nav">
          <Link href="/" className="logo" aria-label="Game Hub home">
            <span className="logo-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path className="spoke" d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span>Game Hub</span>
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            <Link className="nav-link" href="/#games">Games</Link>
            <Link className="nav-link" href="/#how-it-works">How it works</Link>
            <Link className="nav-link" href="/#public-rooms">Friends</Link>
            <Link className="nav-cta" href="/pro">Sign in</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer wrap">
          <span>© Game Hub 2026 · made for game nights</span>
          <div className="footer-links">
            <Link href="/#public-rooms">Status</Link>
            <Link href="/#games">Games</Link>
            <Link href="/pro">Pro</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
