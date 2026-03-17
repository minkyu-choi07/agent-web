import type { Metadata } from 'next'
import {
  Chakra_Petch,
  Source_Code_Pro,
} from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
})

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'ANVIL // Multi-Agent Flow Editor',
  description:
    'Tactical configuration editor for multi-agent workflows.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${chakraPetch.variable} ${sourceCodePro.variable}`}
    >
      <body className="min-h-screen antialiased">
        <div className="grid-overlay" />
        <div className="scanline-overlay" />
        <div className="relative z-10">{children}</div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#111318',
              color: '#e8eaf0',
              border: '1px solid #1e2230',
              borderRadius: '0px',
              fontFamily:
                'var(--font-mono), monospace',
              fontSize: '0.8125rem',
              boxShadow:
                '0 0 12px rgba(0, 229, 160, 0.1)',
            },
          }}
        />
      </body>
    </html>
  )
}
