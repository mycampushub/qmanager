import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#059669',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "QueueFlow - Smart Queue Management SaaS",
  description: "Zero-friction queue management with QR codes, real-time updates, and edge-native performance. Eliminate waiting lines for your business.",
  keywords: ["queue management", "QMS", "SaaS", "queue system", "waiting line", "customer management", "real-time queue", "PWA"],
  authors: [{ name: "QueueFlow" }],
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-512.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'QueueFlow',
  },
  openGraph: {
    title: "QueueFlow - Smart Queue Management",
    description: "Eliminate waiting lines with smart, QR-based queue management. Real-time updates, pay-per-entry billing, and multi-location support.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QueueFlow - Smart Queue Management",
    description: "Eliminate waiting lines with smart queue management.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-512.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}