import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Platforma Wolontariatu',
  description: 'Łączymy wolontariuszy z organizacjami. Dopasowanie AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
            <a href="/" className="font-bold text-green-700 text-lg">🌿 Wolontariat</a>
            <a href="/tasks" className="text-gray-600 hover:text-green-700 transition-colors">Zadania</a>
            <a href="/volunteers" className="text-gray-600 hover:text-green-700 transition-colors">Wolontariusze</a>
            <a href="/organizations" className="text-gray-600 hover:text-green-700 transition-colors">Organizacje</a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
