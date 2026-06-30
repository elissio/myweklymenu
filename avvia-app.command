#!/bin/bash
# Doppio clic per accendere "Il mio menu" e usarla dai telefoni sulla stessa Wi-Fi.
# Lascia aperta questa finestra mentre la usi. Per spegnere: chiudila o premi Ctrl+C.

DIR="$(cd "$(dirname "$0")" && pwd)"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"

echo "============================================================"
echo "  Il mio menu settimanale — server acceso"
echo "------------------------------------------------------------"
echo "  Sul MAC:        http://localhost:4173"
if [ -n "$IP" ]; then
  echo "  Dai TELEFONI:   http://$IP:4173   (stessa Wi-Fi)"
else
  echo "  Dai TELEFONI:   <Mac non connesso al Wi-Fi?>"
fi
echo "------------------------------------------------------------"
echo "  Lascia aperta questa finestra. Per spegnere: Ctrl+C."
echo "============================================================"

python3 "$DIR/il-mio-menu/server.py"
