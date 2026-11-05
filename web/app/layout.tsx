import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Fonts are downloaded at build time and served from the site itself (no request to Google at runtime).
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source-serif" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });

const title = "Nordlys Analytics (fictional): runway dashboard";
const description =
  "Cash, burn and runway for a fictional Copenhagen SaaS startup, with AI-drafted investor updates checked against the data. All data is synthetic.";

// The live address. Link previews (LinkedIn, Slack) need absolute URLs, so the preview
// image (app/opengraph-image.png, a cropped screenshot) and og:url are built from it.
const site = "https://nordlys-runway.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title,
  description,
  openGraph: { title, description, type: "website", url: site },
  twitter: { card: "summary_large_image", title, description },
};

// Sets the theme before the page paints: ?theme=dark|light, then the saved choice, else light (the default).
const themeScript = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('theme')||'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <footer className="mx-auto mt-4 mb-8 flex max-w-[1200px] flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 pt-4 text-xs text-muted">
          <span>Built with Claude Code by Knut Barka</span>
          <span>Nordlys Analytics ApS (fictional): all data is synthetic</span>
          <Link href="/method/">How this works</Link>
          <a href="https://github.com/knbarka-beep/startup-runway">Code on GitHub</a>
        </footer>
      </body>
    </html>
  );
}
