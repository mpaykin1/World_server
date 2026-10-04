'use strict';

const matter=require('./world-matter-engine');
const {WorldStructureEngine}=require('./world-structure-engine');
const {WorldClusterEngine}=require('./world-cluster-engine');
const {WorldPressureEngine}=require('./world-pressure-engine');
const {WorldPhysicsRuntime}=require('./world-physics-runtime');
const adapters=require('./world-cell-adapters');
const {WorldPhysicsSequencer}=require('./world-physics-sequencer');
const renderBridge=require('./world-physics-render-bridge');

module.exports={...matter,WorldStructureEngine,WorldClusterEngine,WorldPressureEngine,
  WorldPhysicsRuntime,WorldPhysicsSequencer,...adapters,...renderBridge};
