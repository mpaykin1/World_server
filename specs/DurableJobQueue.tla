----------------------------- MODULE DurableJobQueue -----------------------------
EXTENDS Naturals, TLC
CONSTANT MaxAttempts
VARIABLES state, owner, attempts
vars == <<state, owner, attempts>>
Init == /\\ state = "queued" /\\ owner = "none" /\\ attempts = 0
Claim(w) == /\\ state = "queued" /\\ state' = "leased" /\\ owner' = w /\\ attempts' = attempts + 1
Ack == /\\ state = "leased" /\\ state' = "done" /\\ owner' = "none" /\\ UNCHANGED attempts
FailRetry == /\\ state = "leased" /\\ attempts < MaxAttempts /\\ state' = "queued" /\\ owner' = "none" /\\ UNCHANGED attempts
FailDead == /\\ state = "leased" /\\ attempts >= MaxAttempts /\\ state' = "dead" /\\ owner' = "none" /\\ UNCHANGED attempts
Next == Claim("A") \/ Claim("B") \/ Ack \/ FailRetry \/ FailDead
TypeOK == /\\ state \\in {"queued","leased","done","dead"} /\\ owner \\in {"none","A","B"} /\\ attempts \\in 0..MaxAttempts
TerminalNoOwner == state \\in {"done","dead"} => owner = "none"
LeaseHasOwner == state = "leased" => owner # "none"
AttemptsBounded == attempts <= MaxAttempts
=============================================================================
