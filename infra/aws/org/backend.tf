# Copy to backend.tf after the first apply, then: terraform init -migrate-state
terraform {
  backend "s3" {
    bucket       = "slotty-tfstate-007576456316"
    key          = "org.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
