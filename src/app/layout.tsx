const isProduction = process.env.NEXT_PUBLIC_BASE_URL === 'https://updatemachine.com';

export const metadata = {
  title: 'Update Machine',
  ...(isProduction ? {} : { robots: 'noindex, nofollow' }),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
