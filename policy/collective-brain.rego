package worldserver.collectivebrain

default allow := false

safe_operations := {
  "read",
  "test",
  "build-preview",
  "memory-recall",
  "memory-checkpoint",
  "quality-analysis"
}

approval_operations := {
  "merge-master",
  "production-deploy",
  "destructive-db-migration",
  "delete-production-data",
  "rotate-production-secret",
  "promote-visual-baseline"
}

hard_denied_operations := {
  "memory-ingest-env-file",
  "memory-ingest-private-key",
  "remote-plaintext-bearer",
  "silent-disable-regression-test"
}

allow if {
  input.operation in safe_operations
}

allow if {
  input.operation in approval_operations
  input.human_approved == true
}

deny_reason := "hard-denied" if {
  input.operation in hard_denied_operations
}

deny_reason := "human-approval-required" if {
  input.operation in approval_operations
  not input.human_approved
}

deny_reason := "unknown-operation-deny-by-default" if {
  not input.operation in safe_operations
  not input.operation in approval_operations
  not input.operation in hard_denied_operations
}
