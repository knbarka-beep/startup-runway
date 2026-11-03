import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nordlys Analytics (fictional): runway dashboard",
  description: "Cash, burn and runway for a fictional Copenhagen SaaS startup. All data is synthetic.",
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
          <span>All data is fictional</span>
          <Link href="/method/">How this works</Link>
        </footer>
      </body>
    </html>
  );
}
