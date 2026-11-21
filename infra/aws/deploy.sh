#!/usr/bin/env bash
# Roll out an image that's already in ECR: register task-definition revisions with it, run the
# migrations as a one-off task (skipped when prisma/migrations hasn't changed since the running
# release), then update the web and worker services and verify the rollout.
# Used by .github/workflows/deploy.yml; it also works by hand from a checkout with the same
# variables (values from `terraform output github_actions_variables` in infra/aws/app):
#
#   IMAGE_TAG=<git sha> RELEASE=v1.2.0 ECR_REPOSITORY=… ECS_CLUSTER=slotty \
#   ECS_SUBNETS=subnet-a,subnet-b ECS_SECURITY_GROUP=sg-… APP_URL=https://… infra/aws/deploy.sh
#
# RELEASE (the release tag) becomes APP_VERSION and is what /health reports; it defaults to
# IMAGE_TAG. FORCE_MIGRATE=1 runs the migrate task even when no migration changed. ROLLBACK=1
# deploys a release older than the running one, without running migrations (ADR-024).
set -euo pipefail

: "${IMAGE_TAG:?}" "${ECR_REPOSITORY:?}" "${ECS_CLUSTER:?}" "${ECS_SUBNETS:?}" "${ECS_SECURITY_GROUP:?}"
command -v jq >/dev/null || { echo "[deploy] needs jq" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

RELEASE=${RELEASE:-$IMAGE_TAG}

log() { printf '[deploy %3ss] %s\n' "$SECONDS" "$*"; }

# New revision of a family's latest task definition, with only the image (and APP_VERSION, the
# release recorded with usage events and reported by /health) changed.
register() {
  local family=$1 image=$2
  aws ecs describe-task-definition --task-definition "$family" --query taskDefinition --output json \
    | jq --arg image "$image" --arg version "$RELEASE" '
        .containerDefinitions[0].image = $image
        | .containerDefinitions[0].environment = ([.containerDefinitions[0].environment[]? | select(.name != "APP_VERSION")]
            + [{name: "APP_VERSION", value: $version}])
        | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions, volumes,
           placementConstraints, requiresCompatibilities, cpu, memory, runtimePlatform}
        | with_entries(select(.value != null))' > "$work/$family.json"
  aws ecs register-task-definition --cli-input-json "file://$work/$family.json" \
    --query taskDefinition.taskDefinitionArn --output text
}

# The release the web service runs now (its APP_VERSION), or empty.
running_version() {
  local td
  td=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services web \
    --query 'services[0].deployments[?status==`PRIMARY`] | [0].taskDefinition' --output text)
  aws ecs describe-task-definition --task-definition "$td" \
    --query 'taskDefinition.containerDefinitions[0].environment[?name==`APP_VERSION`] | [0].value' --output text
}

# The running release is a tag (v1.2.0) or, before ADR-024, a commit SHA; prev_sha is its commit.
prev=$(running_version 2>/dev/null || true)
[ "$prev" = "None" ] && prev=""
commit_of() {
  git rev-parse -q --verify "$1^{commit}" 2>/dev/null && return
  git fetch -q origin "refs/tags/$1:refs/tags/$1" 2>/dev/null || git fetch -q origin "$1" 2>/dev/null || return 0
  git rev-parse -q --verify "$1^{commit}" 2>/dev/null || true
}
prev_sha=""
[ -n "$prev" ] && prev_sha=$(commit_of "$prev")
have_prev=false
[ -n "$prev_sha" ] && have_prev=true
rolling_back=false

# Going backwards: this commit is older than the running release. Only on purpose (ROLLBACK=1);
# otherwise it's a run queued behind a newer release, so stop without changing anything.
if $have_prev && [ "$prev_sha" != "$IMAGE_TAG" ] && git merge-base --is-ancestor "$IMAGE_TAG" "$prev_sha" 2>/dev/null; then
  if [ "${ROLLBACK:-}" != "1" ]; then
    log "$prev, a newer release, is already live; not deploying $RELEASE (set ROLLBACK=1 to go back)"
    exit 0
  fi
  log "rolling back from $prev to $RELEASE"
  rolling_back=true
fi

# Do migrations need to run? Yes unless the running release is known, its commit is available,
# and prisma/migrations is identical between it and this one.
needs_migrations() {
  [ "${FORCE_MIGRATE:-}" = "1" ] && { log "FORCE_MIGRATE=1"; return 0; }
  # Migrations are expand-then-contract, so the older release runs on the newer schema; the
  # older migrate image has nothing to apply anyway.
  $rolling_back && { log "rollback: schema left as it is"; return 1; }
  [ -z "$prev" ] && { log "running release unknown"; return 0; }
  $have_prev || { log "can't fetch running release $prev"; return 0; }
  [ "$prev_sha" = "$IMAGE_TAG" ] && { log "redeploying the running release"; return 1; }
  if git diff --quiet "$prev_sha" "$IMAGE_TAG" -- prisma/migrations; then
    log "no migration changes since $prev"
    return 1
  fi
  return 0
}

image="$ECR_REPOSITORY:$IMAGE_TAG"

# ── Migrations ──
if needs_migrations; then
  migrate_td=$(register slotty-migrate "$image-migrate")
  task=$(aws ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$migrate_td" --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$ECS_SUBNETS],securityGroups=[$ECS_SECURITY_GROUP],assignPublicIp=DISABLED}" \
    --started-by "deploy-${IMAGE_TAG:0:20}" --query 'tasks[0].taskArn' --output text)
  log "migrating with $migrate_td ($task)"
  aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$task"
  read -r code reason < <(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$task" \
    --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)
  aws logs get-log-events --log-group-name /slotty/migrate --log-stream-name "migrate/migrate/${task##*/}" \
    --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || true
  if [ "$code" != "0" ]; then
    log "migrations failed (exit $code: $reason); services left on the previous release"
    exit 1
  fi
  log "migrations applied"
else
  log "skipping migrations"
fi

# ── Services ──
web_td=$(register slotty-web "$image")
worker_td=$(register slotty-worker "$image")
aws ecs update-service --cluster "$ECS_CLUSTER" --service web --task-definition "$web_td" >/dev/null
aws ecs update-service --cluster "$ECS_CLUSTER" --service worker --task-definition "$worker_td" >/dev/null
log "rolling out $web_td and $worker_td"

# Verify the rollout ourselves instead of waiting for ECS's own COMPLETED verdict, which arrives
# minutes after the swap is done (ADR-022). Done means: the new revision is primary, runs the
# desired count, and no older deployment has tasks left. Web tasks only count once their container
# health check passes, and old ones only drain after that (minimum healthy 100%). The circuit
# breaker stays on and still rolls back a revision whose tasks keep failing.
# Prints "done", "wait", or "failed: <why>"; a failed API call counts as "wait".
rollout_state() {
  local service=$1 wanted=$2
  aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$service" --output json 2>/dev/null \
    | jq -r --arg td "$wanted" '
        .services[0] as $s
        | ($s.deployments | map(select(.status == "PRIMARY")) | .[0]) as $p
        | if $p.taskDefinition != $td or $p.rolloutState == "FAILED" then
            "failed: primary is \($p.taskDefinition) (\($p.rolloutState)) \($p.rolloutStateReason // "")"
          elif $p.runningCount == $s.desiredCount
               and ($s.deployments | map(select(.status != "PRIMARY" and .runningCount > 0)) | length == 0)
          then "done" else "wait" end' 2>/dev/null || echo wait
}

events() {
  aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$1" \
    --query 'services[0].events[:8].[createdAt,message]' --output text || true
}

pending="web worker"
deadline=$((SECONDS + 600))
while [ -n "$pending" ]; do
  still=""
  for service in $pending; do
    wanted=$web_td; [ "$service" = worker ] && wanted=$worker_td
    state=$(rollout_state "$service" "$wanted")
    case $state in
      done) log "$service rolled out" ;;
      failed*) log "$service did not roll out: ${state#failed: }"; events "$service"; exit 1 ;;
      *) still="$still $service" ;;
    esac
  done
  pending=${still# }
  [ -z "$pending" ] && break
  if [ "$SECONDS" -ge "$deadline" ]; then
    for service in $pending; do log "$service still rolling out after 10 minutes"; events "$service"; done
    exit 1
  fi
  sleep 5
done

# The new release answers through the public URL (CloudFront → API Gateway → Cloud Map), and its
# database check passes. Three answers in a row, so a lingering old task can't pass for it.
if [ -n "${APP_URL:-}" ]; then
  ok=0
  for _ in $(seq 60); do
    version=$(curl -fsS --max-time 5 "$APP_URL/health" 2>/dev/null | jq -r '.version // empty' || true)
    if [ "$version" = "$RELEASE" ]; then ok=$((ok + 1)); [ "$ok" -ge 3 ] && break; else ok=0; fi
    sleep 2
  done
  if [ "$ok" -lt 3 ]; then
    log "$APP_URL/health doesn't report $RELEASE (last answer: ${version:-none})"
    exit 1
  fi
  log "healthy: $APP_URL serves $RELEASE"
fi
log "done: $RELEASE ($IMAGE_TAG)"
