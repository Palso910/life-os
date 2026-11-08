import type { Metadata, Viewport } from "next";
import { LifeProvider } from "@/lib/storage/life-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeOS — avance à ton rythme",
  description: "Tes habitudes, tes projets et ton équilibre, réunis dans un espace personnel.",
  applicationName: "LifeOS",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "LifeOS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/images/logo.svg",
    apple: "/images/logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-mode="nuit" data-accent="bleu">
      <body>
        <LifeProvider>{children}</LifeProvider>
      </body>
    </html>
  );
}
