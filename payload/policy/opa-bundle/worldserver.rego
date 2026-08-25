package worldserver.integration
import rego.v1

default allow := false

deny contains "release gate is not wired to integration:verify" if { not input.release_gate_wired }
deny contains "disaster-recovery snapshot is missing or unverified" if { not input.dr_verified }
deny contains "SLSA/in-toto provenance is missing or invalid" if { not input.provenance_valid }
deny contains "system integration gate failed" if { not input.integration_gate_pass }
deny contains "project directive constitution gate failed" if { not input.project_directives_pass }
deny contains "user-mandated technology lock failed" if { not input.technology_lock_pass }
deny contains "graphics quality ratchet failed" if { not input.graphics_ratchet_pass }
deny contains "audio variation gate failed" if { not input.audio_variation_pass }
deny contains "gameplay physical contract failed" if { not input.gameplay_contract_pass }
deny contains "desktop AI output contract failed" if { not input.desktop_ai_report_pass }
deny contains "asset batching/atlas policy failed" if { not input.asset_batching_pass }
deny contains "CycloneDX SBOM generation failed" if { not input.sbom_pass }
deny contains "signed rollback-resistant update trust failed" if { not input.update_trust_pass }
deny contains "feature flag safety contract failed" if { not input.feature_flags_pass }
deny contains "configuration contract failed" if { not input.config_contract_pass }
deny contains "adapter sandbox fail-closed contract failed" if { not input.adapter_sandbox_pass }
deny contains "reproducible-build gate failed" if { not input.reproducible_build_pass }
deny contains "GPU was made mandatory although CPU-first policy forbids it" if { input.gpu_mandatory }
deny contains "last-writer-wins detected on a protected integration path" if { input.last_writer_wins }
deny contains "a 100% production claim has no production certification evidence" if { input.unverified_100_claim }

allow if { count(deny) == 0 }
decision := {"allow": allow, "deny": deny}
