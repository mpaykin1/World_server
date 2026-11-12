FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json bridge.mjs cli.mjs mcp.mjs ./
USER node
EXPOSE 8765
CMD ["node", "bridge.mjs"]
