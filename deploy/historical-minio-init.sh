#!/bin/sh
set -eu
umask 077
# Credentials remain in the local administrator/application environment, never renderer assets.
attempt=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo 'Local attachment storage did not become ready.' >&2; exit 1; fi
  sleep 2
done
fingerprint=$(printf '%s\n' 'clinic-historical-scans:clinic-attachments:v1' "$HISTORICAL_S3_ACCESS_KEY" "$HISTORICAL_S3_SECRET_KEY" | sha256sum)
if [ -f /state/owner ]; then
  if [ "$(cat /state/owner)" != "$fingerprint" ]; then echo 'Attachment initializer ownership changed; explicit operator reconciliation is required.' >&2; exit 1; fi
  if ! mc stat local/clinic-historical-scans >/dev/null 2>&1 || ! mc admin user info local "$HISTORICAL_S3_ACCESS_KEY" >/dev/null 2>&1 || ! mc admin policy info local clinic-attachments >/dev/null 2>&1; then
    echo 'Owned attachment resources could not be verified; no changes made.' >&2
    exit 1
  fi
  exit 0
fi
inspection=$(mktemp /tmp/clinic-attachment-inspection.XXXXXX)
trap 'rm -f "$inspection"' 0
single_field() {
  field_tail=${1#*"$2"}
  if [ "$field_tail" = "$1" ]; then return 1; fi
  case "$field_tail" in *"$2"*) return 1 ;; esac
}
require_absent() {
  expected_code=$1
  shift
  if mc --json "$@" >"$inspection" 2>&1; then
    echo 'Attachment bucket/account/policy already exists without initializer ownership; no changes made.' >&2
    exit 1
  fi
  # A failed request is not proof of absence. Match one actual JSON error-code field.
  if [ "$(wc -c <"$inspection")" -gt 8192 ]; then
    echo 'Attachment resource absence could not be established; no changes made.' >&2
    exit 1
  fi
  compact=$(tr -d '[:space:]' <"$inspection")
  case "$compact" in '{'*'}') ;; *) echo 'Invalid attachment resource inspection; no changes made.' >&2; exit 1 ;; esac
  if ! single_field "$compact" '"status":' || ! single_field "$compact" '"Code":'; then
    echo 'Ambiguous attachment resource inspection; no changes made.' >&2
    exit 1
  fi
  case "$compact" in *'"status":"error"'*) ;; *) echo 'Attachment resource absence could not be established; no changes made.' >&2; exit 1 ;; esac
  case "$compact" in *"\"Code\":\"$expected_code\""*) ;; *) echo 'Attachment resource absence could not be established; no changes made.' >&2; exit 1 ;; esac
}
# This pinned mc stat emits no machine-readable bucket error code. A successful
# authenticated bucket listing establishes absence without interpreting errors.
if ! mc --json ls local >"$inspection" 2>&1; then
  echo 'Attachment bucket absence could not be established; no changes made.' >&2
  exit 1
fi
if [ "$(wc -c <"$inspection")" -gt 8192 ]; then
  echo 'Attachment bucket inspection exceeded its bound; no changes made.' >&2
  exit 1
fi
while IFS= read -r record || [ -n "$record" ]; do
  compact=$(printf '%s' "$record" | tr -d '[:space:]')
  case "$compact" in '{'*'}') ;; *) echo 'Invalid attachment bucket inspection; no changes made.' >&2; exit 1 ;; esac
  if ! single_field "$compact" '"status":' || ! single_field "$compact" '"key":'; then
    echo 'Ambiguous attachment bucket inspection; no changes made.' >&2
    exit 1
  fi
  case "$compact" in *'"status":"success"'*) ;; *) echo 'Attachment bucket inspection failed; no changes made.' >&2; exit 1 ;; esac
  case "$compact" in *'"key":"clinic-historical-scans/"'*|*'"key":"clinic-historical-scans"'*) echo 'Attachment bucket already exists without initializer ownership; no changes made.' >&2; exit 1 ;; esac
done <"$inspection"
require_absent XMinioAdminNoSuchUser admin user info local "$HISTORICAL_S3_ACCESS_KEY"
require_absent XMinioAdminNoSuchPolicy admin policy info local clinic-attachments
mc mb local/clinic-historical-scans >/dev/null
mc anonymous set none local/clinic-historical-scans >/dev/null
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::clinic-historical-scans/*"]}]}' >/tmp/attachment-policy.json
mc admin policy create local clinic-attachments /tmp/attachment-policy.json >/dev/null
mc admin user add local "$HISTORICAL_S3_ACCESS_KEY" "$HISTORICAL_S3_SECRET_KEY" >/dev/null
mc admin policy attach local clinic-attachments --user "$HISTORICAL_S3_ACCESS_KEY" >/dev/null
printf '%s' "$fingerprint" >/state/owner
