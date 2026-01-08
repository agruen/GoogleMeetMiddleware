#!/bin/sh
set -e

# Check if config directory is writable
if [ ! -w "/app/config" ]; then
  echo "ERROR: /app/config is not writable by the container."
  echo ""
  echo "To fix this, run on your host:"
  echo "  mkdir -p config data"
  echo "  chmod 777 config data"
  echo ""
  echo "Or use specific ownership:"
  echo "  chown -R 1000:1000 config data"
  echo ""
  exit 1
fi

# Check if data directory is writable
if [ ! -w "/data" ]; then
  echo "ERROR: /data is not writable by the container."
  echo ""
  echo "To fix this, run on your host:"
  echo "  mkdir -p config data"
  echo "  chmod 777 config data"
  echo ""
  exit 1
fi

# Start the application
exec node dist/index.js
