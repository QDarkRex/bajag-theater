FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates python3 && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@8.15.9

WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS final

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 streamlink && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@8.15.9

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY public ./public
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 6969
CMD ["pnpm", "start"]
