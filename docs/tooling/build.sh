#!/usr/bin/env sh
# Build the system documentation PDF in the pinned TeX image.
#   docs/tooling/build.sh          → docs/build/uniflow.pdf
#   docs/tooling/build.sh -pvc     → rebuild on every save (latexmk preview-continuously)
# Links into the source point at the current commit, so a PDF always matches its code.
set -eu
cd "$(dirname "$0")/.."
image=uniflow-docs:$(sha256sum tooling/Dockerfile | cut -c1-12)
docker image inspect "$image" >/dev/null 2>&1 || docker build -q -t "$image" tooling >/dev/null
rev=$(git rev-parse --short=12 HEAD 2>/dev/null || echo master)
exec docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/docs" "$image" \
  -usepretex="\\def\\docrev{$rev}" "$@"
