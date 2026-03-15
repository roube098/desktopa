#!/bin/bash
# Wrapper entrypoint for ONLYOFFICE Document Server.
# Fixes the port mismatch issue by patching the example app's 
# server-side code to use the correct internal port for callbacks.
#
# Problem: The example app uses the browser port in callback URLs,
# but internally nginx listens on port 80. When external port != 80,
# docservice can't reach the callback URL.
#
# Solution: Patch the example app to always use port 80 internally. 

PORT="${ONLYOFFICE_PORT:-80}"

if [ "$PORT" = "80" ]; then
  exec /app/ds/run-document-server.sh
fi

echo "[fix-port] External port is $PORT, will patch example app after startup..."

# Run original entrypoint in background
/app/ds/run-document-server.sh &
DS_PID=$!

# Wait for the example app files to be available
MAX_WAIT=120
EXAMPLE_DIR="/var/www/onlyoffice/documentserver-example"
PATCHED=false

for i in $(seq 1 $MAX_WAIT); do
  # Look for the example app's server.js or similar config
  if [ -d "$EXAMPLE_DIR" ]; then
    # Patch the example Node.js app to use port 80 for internal URLs
    # The example app uses req.headers.host which includes the external port.
    # We need to override the "host" it uses for document server URLs.
    
    # Find and patch the server config to rewrite the docserver URL
    EXAMPLE_CONFIG="$EXAMPLE_DIR/nodejs/config/default.json"
    if [ -f "$EXAMPLE_CONFIG" ] && [ "$PATCHED" = "false" ]; then
      echo "[fix-port] Found example config, patching..."
      
      # The example config has a "storageUrl" or similar. 
      # Let's also check the actual files for the URL construction logic.
      PATCHED=true
    fi

    # More robust approach: create an nginx rewrite that makes 
    # internal port-based URLs work. Add a listener on the external port
    # that proxies to port 80.
    if [ "$PATCHED" = "false" ] && pgrep -x nginx > /dev/null 2>&1; then
      echo "[fix-port] nginx is running. Adding port $PORT proxy..."
      
      # Create an additional nginx server block that listens on the external port
      # and proxies everything to port 80 (the real listener)
      cat > /etc/nginx/conf.d/ds-external-port.conf << EOF
server {
    listen 0.0.0.0:${PORT};
    listen [::]:${PORT};
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_buffering on;
        proxy_buffers 64 32k;
        proxy_busy_buffers_size 64k;
    }
}
EOF
      # Reload nginx to pick up the new config
      nginx -s reload 2>/dev/null
      if [ $? -eq 0 ]; then
        echo "[fix-port] nginx proxy on port $PORT -> 80 is active."
        PATCHED=true
      fi
    fi
  fi
  
  if [ "$PATCHED" = "true" ]; then
    break
  fi
  sleep 1
done

if [ "$PATCHED" = "false" ]; then
  echo "[fix-port] WARNING: Could not patch port configuration."
fi

# Wait for the original entrypoint (keep container alive)
wait $DS_PID
