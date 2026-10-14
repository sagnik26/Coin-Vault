import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Coin Vault',
  description: 'Gold coins for skins, emotes, and battle passes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
