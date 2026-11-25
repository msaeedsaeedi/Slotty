# slotty-prod, the current production until the move (#135). Non-secret settings only; the rest
# (account_role_arn, alert_email, VAPID keys) is in slotty.secret.tfvars (gitignored).
# Every other value is the variable's default.

# The repository was renamed Uniflow on 2026-11-25 (#135). This deployment's roles still trust the
# old name (the default subject prefix), so slotty-prod can't be deployed from GitHub until the
# move; accepted, nothing is released there before it.
