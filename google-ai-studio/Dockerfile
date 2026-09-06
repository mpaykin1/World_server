# Optional fallback for direct Cloud Run/container testing.
# Google AI Studio Starter Tier remains the default publish path.
# Node major matches package.json "engines".node (24.x) — keep these two in
# sync; scripts/google-ai-studio-slots.cjs build-guard fails the gate if they
# drift again.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "google-ai-studio/cloudrun-entry.cjs"]
