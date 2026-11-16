FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        git \
        python3 \
        ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Codex のバージョン（必要なら CODEX_VERSION で変える）
ARG CODEX_VERSION=0.165.0
RUN npm install -g @openai/codex@${CODEX_VERSION}

COPY .agents/skills/decision-twin /workspace/skills/decision-twin
COPY examples/decision-twin-skill/assets /workspace/assets
COPY examples/decision-twin-skill/docker/check-results /usr/local/bin/check-results
COPY examples/decision-twin-skill/docker/run-decision-twin-skill /usr/local/bin/run-decision-twin-skill

RUN chmod +x /usr/local/bin/check-results /usr/local/bin/run-decision-twin-skill \
    && mkdir -p /workspace/reports

WORKDIR /workspace
