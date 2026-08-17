#!/bin/bash
# Nightly SQLite snapshot. Point ETD_BACKUP_DIR at a folder synced by
# OneDrive (UGA-approved storage) so offsite copies happen automatically.
set -euo pipefail

DB="${ETD_DB_PATH:?set ETD_DB_PATH}"
DEST="${ETD_BACKUP_DIR:?set ETD_BACKUP_DIR}"
KEEP=30

mkdir -p "$DEST"
STAMP="$(date +%Y-%m-%d)"
sqlite3 "$DB" ".backup '$DEST/etd-$STAMP.sqlite'"

# prune: keep the newest $KEEP snapshots
ls -1t "$DEST"/etd-*.sqlite 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r f; do
  rm -- "$f"
done
echo "backup ok: $DEST/etd-$STAMP.sqlite"
