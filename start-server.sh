#!/bin/bash
cd /home/z/my-project
rm -f dev.log
exec NEXT_TELEMETRY_DISABLED=1 bun --bun next dev -p 3000 -H 0.0.0.0 > /home/z/my-project/dev.log 2>&1
