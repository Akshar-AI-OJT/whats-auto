import { Noto_Sans, Nunito_Sans, Inter } from "next/font/google";

export const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
