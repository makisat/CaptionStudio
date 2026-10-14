import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caption Studio — Audio to SRT",
  description: "Naturally phrased captions, in your language. Turn audio into editable SRT subtitles.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
