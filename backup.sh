#!/bin/bash
# Backup Script for LensShare

BACKUP_DIR="./backups/$(date +%Y-%m-%d_%H-%M-%S)"
mkdir -p "$BACKUP_DIR"

# 1. Backup SQLite Database safely using SQLite backup command
echo "Backing up Database..."
sqlite3 database.sqlite ".backup '$BACKUP_DIR/database.sqlite.bak'"

# 2. Backup Uploads Directory (optional compression)
echo "Compressing Uploads Directory..."
tar -czf "$BACKUP_DIR/uploads.tar.gz" ./uploads

echo "Backup complete. Saved in $BACKUP_DIR"
