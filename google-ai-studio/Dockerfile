# Optional fallback for direct Cloud Run/container testing.
# Google AI Studio Starter Tier remains the default publish path.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "google-ai-studio/cloudrun-entry.cjs"]
