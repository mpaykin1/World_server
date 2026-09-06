# Optional fallback for direct Cloud Run/container testing.
# Google AI Studio Starter Tier remains the default publish path.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "google-ai-studio/cloudrun-entry.cjs"]
