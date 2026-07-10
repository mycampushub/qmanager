#!/bin/bash
cd /home/z/my-project
while true; do
  echo "=== Starting dev server at $(date) ==="
  NEXT_TELEMETRY_DISABLED=1 bun --bun next dev -p 3000 2>&1
  echo "=== Server exited with code $? at $(date), restarting in 2s ==="
  sleep 2
done
