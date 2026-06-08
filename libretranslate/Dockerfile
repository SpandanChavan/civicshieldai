FROM libretranslate/libretranslate

# Load only 7 languages to fit in Render's free 512MB RAM
# Adding more languages will OOM crash the container
ENV LT_LOAD_ONLY=en,hi,ta,te,bn,gu,mr

# Expose port for Render
EXPOSE 5000
