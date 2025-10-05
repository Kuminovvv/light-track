import type {Metadata} from "next";
import React from "react";
import {robotoFlex, unbounded} from "@shared/lib";
import {appMetadata} from "@shared/metadata";
import "./globals.css";

export const metadata: Metadata = appMetadata

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ru" data-lt-installed="true">
        <body
            className={`${robotoFlex.className} ${unbounded.variable} antialiased`}
        >
        {children}
        </body>
        </html>
    );
}
