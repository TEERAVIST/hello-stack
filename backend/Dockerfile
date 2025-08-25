FROM node:20-alpine
WORKDIR /app

# enable pnpm (pin a version you like)
RUN corepack enable && corepack prepare pnpm@9.7.1 --activate

# only the minimal files for deps layer
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# now copy the rest
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
