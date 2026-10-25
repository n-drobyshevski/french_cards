import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { THEME_INIT_SCRIPT } from "@/components/providers/theme";
import { SIDEBAR_INIT_SCRIPT } from "@/components/shell/sidebar-init";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";
import { FIRST_RUN_INIT_SCRIPT } from "@/lib/first-run-init";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Французские слова на карточках, с подсказками и уровнем сленга.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f1ee" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a forced light/dark theme before first paint on every route. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Desktop: keeps the sidebar hidden with `[` hidden from the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
        {/* First-run hints this device is past (the swipe legend): their space is never laid out. */}
        <script dangerouslySetInnerHTML={{ __html: FIRST_RUN_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
