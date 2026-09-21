import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/MotionProvider";

/**
 * Tier 1 — headlines and the wordmark.
 *
 * Only the weights the scale actually uses. Every extra weight is another file on the
 * critical path for a cut nobody renders.
 */
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

/** Tier 2 — body, buttons, inputs, labels, tables. The workhorse. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

/**
 * Tier 3 — metadata, tool shortcuts, layer labels.
 *
 * A monospace here is doing real work rather than decoration: these are values you scan
 * and compare in a column (timestamps, key combos, layer names), and equal advance width
 * is what makes a column scannable.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "CoCanvas",
    template: "%s · CoCanvas",
  },
  description: "A collaborative canvas for thinking out loud, together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The variables land on <html> so every subtree inherits them — including anything
      // portalled to document.body, like the Share dialog.
      className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
