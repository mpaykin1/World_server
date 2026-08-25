------------------------------ MODULE ControlPlane ------------------------------
EXTENDS Naturals, TLC
VARIABLES a, b, release
vars == <<a,b,release>>
Init == /\\ a = "pending" /\\ b = "pending" /\\ release = "blocked"
RunA == /\\ a = "pending" /\\ a' \\in {"pass","fail"} /\\ UNCHANGED <<b,release>>
RunB == /\\ a = "pass" /\\ b = "pending" /\\ b' \\in {"pass","fail"} /\\ UNCHANGED <<a,release>>
Promote == /\\ a = "pass" /\\ b = "pass" /\\ release' = "canary" /\\ UNCHANGED <<a,b>>
Next == RunA \/ RunB \/ Promote
TypeOK == /\\ a \\in {"pending","pass","fail"} /\\ b \\in {"pending","pass","fail"} /\\ release \\in {"blocked","canary"}
DependencyOrder == b # "pending" => a = "pass"
SafePromotion == release = "canary" => /\\ a = "pass" /\\ b = "pass"
=============================================================================
