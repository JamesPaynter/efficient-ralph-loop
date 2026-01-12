FROM node:20
RUN npm i -g @openai/codex @anthropic-ai/claude-code
WORKDIR /workspace
