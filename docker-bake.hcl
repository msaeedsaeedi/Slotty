# Both images in one Buildx run, so their shared stages build once and in parallel:
#   docker buildx bake                       → slotty-app:latest and slotty-app:latest-migrate (local)
#   REPOSITORY=<ecr url> TAG=<sha> docker buildx bake --push        (what CI does)
variable "REPOSITORY" { default = "slotty-app" }
variable "TAG" { default = "latest" }

group "default" {
  targets = ["app", "migrate"]
}

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
}

target "app" {
  inherits = ["_common"]
  target   = "app"
  tags     = ["${REPOSITORY}:${TAG}"]
}

target "migrate" {
  inherits = ["_common"]
  target   = "migrate"
  tags     = ["${REPOSITORY}:${TAG}-migrate"]
}
