import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { Topbar } from "@/components/Topbar";

// Gotham is the brand face (design doc 04); Montserrat is the bundled
// fallback for machines where Gotham isn't licensed/installed.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "CortexWatt — Train",
  description: "Measured brain training. Seven games, six domains, one honest index.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="min-h-screen">
        <Topbar />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
