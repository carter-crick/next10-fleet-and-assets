import type { Metadata } from "next"
import { Montserrat } from 'next/font/google'
import "./globals.css"

const montserrat = Montserrat({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: "Fleet & Assets",
  description: "Fleet and asset management for Balanced Comfort and Sailor's Air & Plumbing",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" style={{ colorScheme: "light" }}>
      <body className={`${montserrat.className} min-h-full bg-gray-50 text-gray-900`}>
        {children}
      </body>
    </html>
  )
}
