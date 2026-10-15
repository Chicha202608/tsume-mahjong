# Score display fonts

These WOFF2 files contain subsets for the current Japanese score labels only.
When adding a new label, regenerate the relevant subset to include its glyphs.

## Kouzan Score

- Original: 衡山毛筆フォント, by 青柳衡山.
- Source: https://opentype.jp/kouzanmouhitufont.htm
- Download: https://opentype.jp/bin/KouzanMouhituFont.zip
- The distributor permits free use, commercial use without restrictions, logo
  use and redistribution in publications/CDs. Original font is provided without warranty.
- Retained from the earlier score-tier comparison; no longer loaded by the UI.
- Score tiers now use the system-installed Meiryo Bold, with Yu Gothic and
  sans-serif fallbacks. No Microsoft font files are redistributed.

## Yuji Yaku

- Original: Yuji Syuku, Copyright 2021 The Yuji Project Authors.
- Source: https://github.com/google/fonts/tree/main/ofl/yujisyuku
- Project: https://github.com/Kinutafontfactory/Yuji
- Licensed under SIL Open Font License 1.1; see Yuji-OFL.txt.
- Used only for yaku names and dora labels.
- The original Yuji Syuku font does not contain U+4E48 (么). That character
  keeps the existing text and uses the serif fallback; no yaku labels are renamed.

Both subsets were generated with fontTools and Brotli. Original name and
copyright tables are retained. Fonts are served locally without third-party requests.
