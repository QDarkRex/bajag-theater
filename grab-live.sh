# !/bin/bash

# Target Datarhei Restreamer HLS/MPEG-TS stream URL
# Replace 'stream.m3u8' with the actual process/stream name if different
RESTREAMER_URL="http://192.168.30.10:6010/memfs/stream.m3u8"

echo "Pulling stream from Datarhei Restreamer: $RESTREAMER_URL"

# Create video directory if it doesn't exist
mkdir -p video

# Use ffmpeg directly to capture the local stream instead of yt-dlp
ffmpeg -i "$RESTREAMER_URL" -c copy -bsf:a aac_adtstoasc video/output.mkv
