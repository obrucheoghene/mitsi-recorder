#!/bin/bash
set -e

# Start Xvfb (virtual display for headless browser)
export DISPLAY=:99
Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
sleep 1

# Start PulseAudio (audio capture from browser)
pulseaudio --start --exit-idle-time=-1
sleep 1

# Start the application
exec node dist/main.js
