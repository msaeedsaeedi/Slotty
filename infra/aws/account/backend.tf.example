# Copy to backend.tf after the first apply, then: terraform init -migrate-state
terraform {
  backend "s3" {
    bucket       = "uniflow-tfstate-063140644495"
    key          = "account.tfstate"
    region       = "ap-southeast-2"
    profile      = "uniflow"
    encrypt      = true
    use_lockfile = true
  }
}
