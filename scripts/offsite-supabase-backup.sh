#!/usr/bin/env bash
# Encrypted off-site backup; keep credentials and customer data OUT of Git.
set -euo pipefail
umask 077
for tool in pg_dump pg_restore age rclone sha256sum; do command -v "$tool" >/dev/null || { echo "Missing: $tool" >&2; exit 2; }; done
: "${SUPABASE_DATABASE_URL:?Set PostgreSQL URL as a private secret}"
: "${AGE_RECIPIENT:?Set a public age recipient key}"
: "${OFFSITE_DEST:?Set a private external rclone destination}"
# Pass connection details in the child environment, never on its command line.
export PGDATABASE="$SUPABASE_DATABASE_URL" PGSSLMODE=require
unset SUPABASE_DATABASE_URL
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$scratch/supabase-$stamp.dump.age"
remote="${OFFSITE_DEST%/}/supabase-$stamp.dump.age"
# Consistent MVCC snapshot; data is only written to disk after encryption.
pg_dump --no-password --format=custom --no-owner --no-acl \
  --schema=public --schema=auth --schema=storage | age -r "$AGE_RECIPIENT" -o "$archive"
test -s "$archive"
if [[ -n "${AGE_IDENTITY_FILE:-}" ]]; then
  test -r "$AGE_IDENTITY_FILE"
  age -d -i "$AGE_IDENTITY_FILE" "$archive" | pg_restore --list >/dev/null
fi
rclone copyto "$archive" "$remote"
local_digest="$(sha256sum "$archive" | cut -d' ' -f1)"
remote_digest="$(rclone cat "$remote" | sha256sum | cut -d' ' -f1)"
[[ "$local_digest" == "$remote_digest" ]] || { echo "Off-site checksum mismatch" >&2; exit 1; }
echo "Verified encrypted backup at: $remote"
echo "SHA256: $local_digest"
echo "Run a separate restore rehearsal and export Storage binary objects."
