import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PharmaTree | Supply Chain Control Centre",
  description: "PharmaTree is a blockchain-powered pharmaceutical supply chain dashboard for medicine provenance, transfer approvals, and inventory control.",
  keywords: ["PharmaTree", "pharma blockchain", "medicine traceability", "supply chain", "inventory dashboard"],
  applicationName: "PharmaTree",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "PharmaTree",
    description: "Blockchain-based pharmaceutical supply chain verification dashboard",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
