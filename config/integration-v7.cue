package integration
projectDirectives: {
  schemaVersion: "7.5.0"
  solutionStrategy: {
    scalableFirst: true
    preferMinimumManualActions: true
    combineStepsWhenSafe: true
    batchAssetsWhenFeasible: true
    productionGameQualityOverTemplateAssets: true
  }
  delivery: {
    noInlineHtml: true
    fullFileCodeDelivery: true
    rootCauseRequiredForBugfix: true
    permanentRegressionPreventionRequired: true
  }
  graphics: {
    preserveExistingGraphics: true
    noDestructiveSimplification: true
    qualityRatchet: true
  }
  audio: minimumVariantsPerEvent: >=4
}
flags: {
  schemaVersion: string
  flags: [string]: {
    type: "boolean" | "string" | "number" | "object"
    defaultValue: _
    enabled: bool
    rollout: >=0 & <=100
  }
}
updateTrust: {
  framework: "TUF-aligned-subset"
  rollbackProtection: true
  freezeProtection: true
  threshold: >=1
}
sandbox: {
  mode: "fail-closed"
  allowNetwork: false
  allowSubprocess: false
}

projectDirectives: {
  supplyChain: {signReleaseEvidence: true, tamperEvidentTransparencyLog: true}
  verification: {modelCheckDurableStateMachines: true, semanticDependencyGraph: true}
  storage: {contentAddressed: true, distributedCasReady: true}
  deviceTesting: {neverCountEmulatorAsRealDevice: true}
  adapters: {typedWitContracts: true, wasiComponentModelPreferred: true}
}

projectDirectives: {
  verification: {nativeAstWhenAvailable: true, mandatoryTlcInCI: true, rejectVulnerableCosign: true}
  tooling: {autoInstallFreePinnedToolsLocally: true, neverRequireGlobalInstall: true}
  storage: {zeroConfigCasDiscovery: true}
  supplyChain: {monitorTransparencyContinuously: true}
  deviceTesting: {automatedExecutor: true}
  adapters: {generateWitBindings: true}
}

projectDirectives: {
  evidence: {legacyExplicitRecipesOnly: true, noNameBasedAutocertification: true}
  reliability: {sloErrorBudgetController: true}
  database: {expandMigrateContract: true, fencedLeaderRequired: true, snapshotBeforeMigration: true}
  assets: {contentDefinedDeltaChunks: true, verifyReconstruction: true}
  debugging: {causalGraph: true, secretRedaction: true}
}
