# Reproducible build environment for the system documentation.
# Pinned by digest: TeX Live 2026 (scheme-medium), plus the few packages the style needs.
#   bun run docs:build   (builds this image on first use, then docs/build/uniflow.pdf)
FROM texlive/texlive:latest-medium@sha256:3a3949a847929f989eb70a4c92ba43b38dcd4242e08a8a6a0b6f5ef3db1525ee

# Packages beyond scheme-medium, each with the reason it's needed.
RUN tlmgr install \
      tcolorbox environ tikzfill pdfcol listingsutf8 \
      xltabular ltablex multirow cleveref \
      libertinus-fonts libertinus-otf inconsolata \
      siunitx \
      fontawesome5 \
      xurl \
      csquotes \
  && tlmgr path add

WORKDIR /docs
ENTRYPOINT ["latexmk"]
