#!/bin/sh
set -e

# Check if setup is already complete (config file exists)
SETUP_COMPLETE=false
if [ -f "/app/config/app-config.json" ] || [ -f "/app/config/.setup-complete" ]; then
  SETUP_COMPLETE=true
fi

# Only require writable config if setup is not complete
if [ "$SETUP_COMPLETE" = "false" ] && [ ! -w "/app/config" ]; then
  echo "ERROR: /app/config is not writable by the container."
  echo "This is required for the setup wizard to save configuration."
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

# Check if data directory is writable (always required for database)
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
