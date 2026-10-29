#!/bin/sh
# Encrypted off-site backup with restic. Runs once (`backup.sh`) or daily at $BACKUP_AT IST (`--loop`).
# The result is written to app_settings.backup_status, which the admin shows under Settings → Operations.
set -eu

report() {
  ok="$1"; msg="$2"
  psql -v ON_ERROR_STOP=1 -q -c "insert into app_settings (key, value) values ('backup_status', jsonb_build_object('ok', $ok, 'message', '$(printf %s "$msg" | sed "s/'/''/g")', 'at', now()))
    on conflict (key) do update set value = excluded.value, updated_at = now();" || true
}

run_once() {
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  if ! restic cat config >/dev/null 2>&1; then
    restic init
  fi
  pg_dump --format=custom --no-owner --file="$work/lokmangal.dump"
  restic backup --tag nightly --host lokmangal "$work/lokmangal.dump" /data/media /data/private /data/state
  restic forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
  restic check --read-data-subset=2%
  size=$(du -h "$work/lokmangal.dump" | cut -f1)
  report true "Database dump $size, media and private files backed up"
  echo "backup ok ($size)"
}

if [ "${1:-}" = "--loop" ]; then
  while true; do
    now=$(date +%H:%M)
    if [ "$now" = "${BACKUP_AT:-01:30}" ]; then
      if ! run_once; then report false "Backup failed — check the backup container logs"; fi
      sleep 61
    fi
    sleep 30
  done
else
  run_once || { report false "Backup failed — check the backup container logs"; exit 1; }
fi
