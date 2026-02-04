FROM node:22-bookworm-slim AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-bookworm-slim AS node

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY --from=builder /build/dist/ /
COPY package.json package-lock.json /
RUN npm ci --omit=dev

ENTRYPOINT ["node", "/index.js"]
CMD ["-c", "/config/config.json"]
