#!/usr/bin/env bash
# Run Terraform for one deployment of this stack, kept apart from the other:
#   ./tf.sh slotty  plan          # current production (us-east-1, member of ../org)
#   ./tf.sh uniflow init          # standalone account (ap-southeast-2, ADR-037)
#   ./tf.sh uniflow plan -out=uniflow.tfplan
# Each deployment has its own backend (deployments/<d>.backend.hcl), working directory
# (.terraform-<d>) and var files (deployments/<d>.tfvars, then <d>.secret.tfvars, gitignored).
# The providers also refuse any account but the deployment's own (allowed_account_ids).
set -euo pipefail
cd "$(dirname "$0")"

d=${1:?usage: ./tf.sh <slotty|uniflow> <terraform command> [args]}
cmd=${2:?usage: ./tf.sh <slotty|uniflow> <terraform command> [args]}
shift 2
[[ -f deployments/$d.backend.hcl && -f deployments/$d.tfvars ]] || { echo "unknown deployment: $d" >&2; exit 1; }
[[ -f deployments/$d.secret.tfvars ]] || { echo "missing deployments/$d.secret.tfvars (see deployments/secret.tfvars.example)" >&2; exit 1; }
# terraform.tfvars would be loaded into every deployment.
[[ ! -f terraform.tfvars ]] || { echo "move terraform.tfvars to deployments/<its deployment>.secret.tfvars first" >&2; exit 1; }

export TF_DATA_DIR=.terraform-$d
case $cmd in
  init) exec terraform init -reconfigure -backend-config="deployments/$d.backend.hcl" "$@" ;;
  plan | apply | destroy | import | refresh | console)
    exec terraform "$cmd" -var-file="deployments/$d.tfvars" -var-file="deployments/$d.secret.tfvars" "$@" ;;
  *) exec terraform "$cmd" "$@" ;;
esac
