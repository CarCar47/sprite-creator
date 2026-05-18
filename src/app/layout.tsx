import type { Metadata } from "next";
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

const SITE_URL = "https://sprite-creator-seven.vercel.app";
const TITLE = "Sprite Creator — AI sprite sheets for Unity 2D";
const DESCRIPTION =
  "Describe a character. Get a Unity-ready base sprite + 7 animated action sheets (idle / walk / run / jump / attack / hurt / death) with transparent backgrounds and Unity-importable JSON manifests. Free providers, MIT licensed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Sprite Creator",
  authors: [{ name: "Carlos Ramon Cardenas", url: "https://github.com/CarCar47" }],
  keywords: [
    "Unity 2D",
    "sprite sheet",
    "AI sprite generator",
    "FLUX.1-schnell",
    "Next.js",
    "Vercel",
    "game dev",
    "pixel art",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Sprite Creator",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Sprite Creator — generate Unity-ready 2D sprite sheets from a text description",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
