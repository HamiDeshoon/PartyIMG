#!/bin/bash
# Restore Script for LensShare

if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup_folder_path>"
  echo "Example: ./restore.sh ./backups/2026-06-07_00-00-00"
  exit 1
fi

BACKUP_DIR=$1

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Backup directory $BACKUP_DIR not found!"
  exit 1
fi

echo "Restoring Database..."
# Backup current one just in case
cp database.sqlite database.sqlite.pre_restore.bak
sqlite3 database.sqlite ".restore '$BACKUP_DIR/database.sqlite.bak'"

echo "Restoring Uploads..."
tar -xzf "$BACKUP_DIR/uploads.tar.gz"

echo "Restore complete!"
