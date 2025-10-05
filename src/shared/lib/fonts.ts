import { Dela_Gothic_One, Roboto } from 'next/font/google'

export const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

export const delaGothicOne = Dela_Gothic_One({
  variable: '--font-dela-gothic-one',
  subsets: ['latin'],
  weight: ['400'],
})
