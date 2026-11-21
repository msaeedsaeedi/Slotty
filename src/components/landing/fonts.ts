import { Martian_Mono, Mona_Sans } from "next/font/google";

/*
 * Landing page only. Mona Sans (variable width, set semi-expanded for headlines) has the plain,
 * confident voice of transit signage; Martian Mono's numerals read like split-flap digits.
 * Both are variable fonts, so one file each covers every weight and width used.
 */
export const sans = Mona_Sans({ subsets: ["latin"], axes: ["wdth"], display: "swap", variable: "--lp-font-sans" });
export const mono = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], display: "swap", variable: "--lp-font-mono" });
