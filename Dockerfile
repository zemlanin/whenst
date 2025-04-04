# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.12.0
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base as build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install node modules
COPY package-lock.json package.json ./
RUN npm ci --include=dev

# Copy application code
COPY . .

# Build application
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev


# Final stage for app image
FROM base

RUN apt-get update -y && apt-get install -y \
    # LiteFS setup
    ca-certificates fuse3 sqlite3 \
    libsqlite3-mod-spatialite

ENV WHENST_SPATIALITE_MOD="/usr/lib/x86_64-linux-gnu/mod_spatialite.so"

ENV WHENST_SERVE_PRECOMPRESSED="true"

# LiteFS setup
COPY --from=flyio/litefs:0.5 /usr/local/bin/litefs /usr/local/bin/litefs

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000

# the server is started from `exec.cmd` in `litefs.yml`
ENTRYPOINT litefs mount
