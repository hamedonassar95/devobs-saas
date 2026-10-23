#!/usr/bin/env bash

set -euo pipefail

# Neon Free computes can be asleep when a deployment reaches the migration
# step. Retry only Prisma connection failures; schema and migration errors
# should fail immediately without retrying.
max_attempts=6
delay_seconds=5
attempt=1
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

while (( attempt <= max_attempts )); do
  : > "$log_file"

  set +e
  npm run db:migrate:deploy 2>&1 | tee "$log_file"
  migration_status=${PIPESTATUS[0]}
  set -e

  if (( migration_status == 0 )); then
    exit 0
  fi

  if ! grep -Eq 'P1001|P1002' "$log_file"; then
    echo "Database migration failed for a non-connection reason; stopping without retry." >&2
    exit "$migration_status"
  fi

  if (( attempt == max_attempts )); then
    echo "Database connection remained unavailable after ${attempt} attempts." >&2
    exit "$migration_status"
  fi

  echo "Database connection failed with a transient Prisma error; retrying in ${delay_seconds}s (${attempt}/${max_attempts})." >&2
  sleep "$delay_seconds"
  delay_seconds=$((delay_seconds < 30 ? delay_seconds * 2 : 30))
  attempt=$((attempt + 1))
done
