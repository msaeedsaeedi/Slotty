#!/usr/bin/env bash
# Roll out an image that's already in ECR: register task-definition revisions with it, run the
# migrations as a one-off task, then update the web and worker services and wait for them.
# Used by .github/workflows/deploy.yml; it also works by hand with the same variables
# (values from `terraform output github_actions_variables` in infra/aws/app):
#
#   IMAGE_TAG=<git sha> ECR_REPOSITORY=… ECS_CLUSTER=slotty ECS_SUBNETS=subnet-a,subnet-b \
#   ECS_SECURITY_GROUP=sg-… APP_URL=https://… infra/aws/deploy.sh
set -euo pipefail

: "${IMAGE_TAG:?}" "${ECR_REPOSITORY:?}" "${ECS_CLUSTER:?}" "${ECS_SUBNETS:?}" "${ECS_SECURITY_GROUP:?}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

log() { echo "[deploy] $*"; }

# New revision of a family's latest task definition, with only the image changed.
register() {
  local family=$1 image=$2
  aws ecs describe-task-definition --task-definition "$family" --query taskDefinition --output json \
    | jq --arg image "$image" '
        .containerDefinitions[0].image = $image
        | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions, volumes,
           placementConstraints, requiresCompatibilities, cpu, memory, runtimePlatform}
        | with_entries(select(.value != null))' > "$work/$family.json"
  aws ecs register-task-definition --cli-input-json "file://$work/$family.json" \
    --query taskDefinition.taskDefinitionArn --output text
}

image="$ECR_REPOSITORY:$IMAGE_TAG"
migrate_td=$(register slotty-migrate "$image-migrate")
web_td=$(register slotty-web "$image")
worker_td=$(register slotty-worker "$image")
log "registered $migrate_td, $web_td, $worker_td"

# ── Migrations ──
task=$(aws ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$migrate_td" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$ECS_SUBNETS],securityGroups=[$ECS_SECURITY_GROUP],assignPublicIp=DISABLED}" \
  --started-by "deploy-${IMAGE_TAG:0:20}" --query 'tasks[0].taskArn' --output text)
log "migrating ($task)"
aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$task"
read -r code reason < <(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$task" \
  --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)
aws logs get-log-events --log-group-name /slotty/migrate --log-stream-name "migrate/migrate/${task##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || true
if [ "$code" != "0" ]; then
  log "migrations failed (exit $code: $reason); services left on the previous release"
  exit 1
fi

# ── Services ──
aws ecs update-service --cluster "$ECS_CLUSTER" --service web --task-definition "$web_td" >/dev/null
aws ecs update-service --cluster "$ECS_CLUSTER" --service worker --task-definition "$worker_td" >/dev/null
log "rolling out web and worker"
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services web worker

# A circuit-breaker rollback also ends "stable", on the old revision: check we're on the new one.
for pair in "web $web_td" "worker $worker_td"; do
  read -r service wanted <<< "$pair"
  read -r running state < <(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$service" \
    --query 'services[0].deployments[?status==`PRIMARY`] | [0].[taskDefinition, rolloutState]' --output text)
  if [ "$running" != "$wanted" ] || [ "$state" != "COMPLETED" ]; then
    log "$service did not roll out (running $running, $state); the circuit breaker rolled it back"
    exit 1
  fi
done

if [ -n "${APP_URL:-}" ]; then
  curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$APP_URL/health" >/dev/null
  log "healthy: $APP_URL"
fi
log "done: $IMAGE_TAG"
