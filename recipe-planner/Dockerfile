# syntax=docker/dockerfile:1
#
# Multi-stage build for the RecipePlanner SPA.
#
# Stage 1 builds the Vite/React app. Vite env vars (import.meta.env.VITE_*) are
# COMPILE-TIME — the PocketBase URL must be injected as a build ARG, never a
# runtime env var. The build fails loud when VITE_POCKETBASE_URL is empty so a
# production image can never silently fall back to a stale host.
#
# Stage 2 serves the static bundle on :3000 with SPA history fallback.

FROM node:22-slim AS build
WORKDIR /app

# Install against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build-time API base(s). VITE_POCKETBASE_URL is required (see below);
# VITE_POCKETBASE_TEST_URL is optional (falls back to the production URL).
ARG VITE_POCKETBASE_URL
ARG VITE_POCKETBASE_TEST_URL
ENV VITE_POCKETBASE_URL=${VITE_POCKETBASE_URL}
ENV VITE_POCKETBASE_TEST_URL=${VITE_POCKETBASE_TEST_URL}

COPY . .
RUN test -n "$VITE_POCKETBASE_URL" \
  || { echo 'ERROR: VITE_POCKETBASE_URL build arg is required'; exit 1; }; \
  npm run build

FROM nginx:1.27-alpine AS serve
# Static server on :3000 with client-side-routing fallback (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
