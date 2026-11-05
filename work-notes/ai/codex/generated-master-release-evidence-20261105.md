# Generated game release evidence

Base: f6198fa208b12121626fc8c7b29f5691c7119335 (#595).

The existing generated-game Chromium workflow only runs on pull_request and workflow_dispatch. Its PR artifact records a synthetic merge SHA, so it cannot serve as a default-branch release build. Add push/master path-filtered execution of the same builder, geometry and browser checks. Include canonical lib/engines changes in both PR and push paths, because changing physics/mechanics/adapters can invalidate the generated game even when builder files do not change.

No publication, permissions, secrets, infrastructure or accepted game changes. Keep contents: read and existing checks unchanged. PR run proves the new YAML still executes; post-merge master run must produce a manifest with that actual checkout SHA before publication. Review is advisory by the owner's META GAMES decision; concrete defects and technical checks remain blocking.
