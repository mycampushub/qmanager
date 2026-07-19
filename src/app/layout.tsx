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
  title: "QueueFlow - Smart Queue Management System | Digital Queue Management Platform",
  description: "Transform your waiting line management with QueueFlow's virtual queue management system. A digital queue management platform with QR code entry, real-time updates, and affordable queue management for businesses of all sizes. Reduce customer waiting frustration and improve staff productivity.",
  keywords: ["queue management system", "digital queue management", "smart queue management", "virtual queue management", "online queue system", "cloud queue management", "QR queue management", "customer queue management", "waiting line management", "queue ticket system", "queue management platform", "queue management solution", "queue management application", "enterprise queue management", "affordable queue management", "multi-branch queue management", "electronic queue management", "queue ticket software"],
  authors: [{ name: "QueueFlow" }],
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-512.png",
  },
  openGraph: {
    title: "QueueFlow - Smart Queue Management System | Digital Queue Management Platform",
    description: "Transform waiting line management with a virtual queue management system. QR-based digital queue management, real-time updates, and affordable queue management for every business.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QueueFlow - Smart Queue Management System",
    description: "A digital queue management platform that reduces customer waiting frustration. QR queue management with real-time updates.",
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
        {/* PWA manifest + SW are injected dynamically by usePwa hook — only for logged-in users */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}