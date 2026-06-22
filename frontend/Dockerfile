FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --frozen-lockfile

FROM base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Base pública das propostas (subdomínio proposta.*). NEXT_PUBLIC_* é inlinado
# em build-time, então precisa vir como build-arg (não basta env de runtime).
# Fallback de robustez no cliente; a fonte da verdade é o `public_url` do backend.
ARG NEXT_PUBLIC_PROPOSAL_URL
ENV NEXT_PUBLIC_PROPOSAL_URL=${NEXT_PUBLIC_PROPOSAL_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# NEXT_PUBLIC_API_URL deve ser passado via docker-compose ou docker run -e
# Não definir valor padrão aqui para forçar configuração explícita por ambiente

CMD ["node", "server.js"]
