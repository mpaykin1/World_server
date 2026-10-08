# «Пороки» — code review + repair

Trigger in ChatGPT: «Проверь скилом Пороки репозиторий / этот PR».
Trigger in Codex: $poroki. Supports both read-only reviews and approved repairs.

User-scope Codex install: copy this folder to $HOME/.agents/skills/poroki.
Repo-scope Codex install: leave the folder in <repo>/.agents/skills/poroki.
ChatGPT Skill upload: zip the top-level poroki/ folder and upload it through Skills (if your account/workspace supports custom Skills).
Skill format: SKILL.md + scripts. Python script is stdlib-only and heuristic.

Run from this skill directory:
python -m unittest discover -s scripts -p test_*.py
python scripts/poroki_audit.py --repo <repo-root> --json

The script only provides review prompts. The agent must reproduce bugs and run relevant project tests before declaring a fix.
