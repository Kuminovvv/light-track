import { delaGothicOne, roboto } from '@shared/lib'
import { appMetadata } from '@shared/metadata'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = appMetadata

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang='ru' data-lt-installed='true'>
      <body
        className={`${roboto.className} ${delaGothicOne.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
