# Production image for Cloud Run (docs/deploy.md). Runs Next's standalone server on $PORT.
# Migrations are not run here: the deploy workflow runs `prisma migrate deploy` before deploying.

FROM node:24-bookworm-slim AS base
# Prisma's query engine needs OpenSSL; ca-certificates for TLS to Supabase and balldontlie.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
# npm skips an optional package whose download fails, and Next's native compiler is one, so fail
# here instead of in `next build` with a confusing wasm error.
RUN npm ci --fetch-retries=5 \
  && node -e "require.resolve('@next/swc-linux-' + process.arch + '-gnu')"

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
