import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

const title = "Nordlys Analytics (fictional): runway dashboard";
const description =
  "Cash, burn and runway for a fictional Copenhagen SaaS startup, with AI-drafted investor updates checked against the data. All data is synthetic.";

// The preview image is app/opengraph-image.png (a cropped screenshot), picked up by Next.js.
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

// Sets the theme before the page paints: ?theme=dark|light, then saved choice, then system setting.
const themeScript = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <footer className="footer">
          <span>Built with Claude Code by Knut Barka</span>
          <span>Nordlys Analytics ApS (fictional): all data is synthetic</span>
          <Link href="/method/">How this works</Link>
          <a href="https://github.com/knbarka-beep/startup-runway">Code on GitHub</a>
        </footer>
      </body>
    </html>
  );
}
