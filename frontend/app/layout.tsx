import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { DemoProvider } from "@/components/ui/DemoContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Inova Systems Solutions ERP",
  description: "Sistema de Gestão Empresarial",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // O middleware emite um nonce por request para a CSP nonce-based. Lemos via
  // headers() para anexar a scripts inline obrigatórios (ex.: tema dark).
  // Em runtime sem middleware (testes/SSG), nonce pode ser ausente — nesse
  // caso o script inline não roda (degradação segura).
  // Next 15: `headers()` é async.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="pt-br" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: `
          try {
            const theme = localStorage.getItem('theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          } catch {}
        `}} />
      </head>
      <body className="min-h-screen bg-bg-primary">
        <DemoProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </DemoProvider>
      </body>
    </html>
  );
}
