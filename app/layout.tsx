import type {Metadata} from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { ThemeProvider } from '@/lib/ThemeContext';
import { AuthGuard } from '@/components/AuthGuard';
import './globals.css'; // Global styles

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });

export const metadata: Metadata = {
  title: "Solarithm Designer's Project Sheet",
  description: "Distraction-free workspace for designers to view their assigned projects and update their progress.",
  openGraph: {
    title: "Solarithm Designer's Project Sheet",
    description: "Distraction-free workspace for designers to view their assigned projects and update their progress.",
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('solarithm-theme') || localStorage.getItem('theme');
                  var isDark = stored ? stored === 'dark' : true;
                  var root = document.documentElement;
                  if (isDark) {
                    root.classList.add('dark');
                    root.classList.remove('light');
                    root.style.colorScheme = 'dark';
                  } else {
                    root.classList.remove('dark');
                    root.classList.add('light');
                    root.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
