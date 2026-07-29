import type { Metadata } from "next";
import "./globals.css";
import AstryxProvider from "@/components/AstryxProvider";

export const metadata: Metadata = {
  title: "Aegis Disaster Evacuation Control",
  description: "Real-time AI-powered disaster routing & emergency responder dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AstryxProvider>{children}</AstryxProvider>
      </body>
    </html>
  );
}
