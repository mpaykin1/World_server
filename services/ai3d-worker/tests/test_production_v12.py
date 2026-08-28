import tempfile,unittest
from pathlib import Path
from ai3d.production_v12 import artifact_hygiene_gate_v12,compatibility_matrix_gate_v12,shader_stutter_gate_v12,thermal_memory_pressure_gate_v12,adversarial_corpus_gate_v12,autofix_progress_gate_v12,quality_confidence_v12,convergence_gate_v12

class TestProductionV12(unittest.TestCase):
    def test_hygiene_clean(self):
        self.assertTrue(artifact_hygiene_gate_v12([Path('a.py'),Path('b.json')])['passed'])
    def test_hygiene_detects_pyc_virtual_path(self):
        self.assertFalse(artifact_hygiene_gate_v12([Path('x/__pycache__/a.pyc')])['passed'])
    def test_compatibility_pass(self):
        rows=[{'engine':'blender','version':'4.3.0','available':True,'smokePassed':True},{'engine':'godot','version':'4.7.1','available':True,'smokePassed':True}]
        self.assertTrue(compatibility_matrix_gate_v12(rows)['passed'])
    def test_compatibility_fails_missing_godot(self):
        rows=[{'engine':'blender','version':'4.3.0','available':True,'smokePassed':True}]
        self.assertFalse(compatibility_matrix_gate_v12(rows)['passed'])
    def test_shader_stutter_pass(self):
        rows=[{'frameTimeMs':16.0,'shaderCompileTelemetry':'INSTRUMENTED'} for _ in range(100)]
        self.assertTrue(shader_stutter_gate_v12(rows)['passed'])
    def test_shader_compile_after_warmup_fails(self):
        rows=[{'frameTimeMs':16.0,'shaderCompileTelemetry':'INSTRUMENTED'} for _ in range(100)];rows[80]['shaderCompileEvent']=True;rows[80]['shaderCompileMs']=8
        self.assertFalse(shader_stutter_gate_v12(rows)['passed'])
    def test_pressure_pass(self):
        rows=[{'fps':60,'rssMb':500+i*.2,'vramMb':800+i*.2,'temperatureC':70,'thermalState':'nominal','memoryPressure':'normal'} for i in range(40)]
        self.assertTrue(thermal_memory_pressure_gate_v12(rows)['passed'])
    def test_pressure_fails_critical(self):
        rows=[{'fps':60,'rssMb':500,'vramMb':800,'temperatureC':70,'thermalState':'nominal','memoryPressure':'normal'} for _ in range(40)];rows[-1]['memoryPressure']='critical'
        self.assertFalse(thermal_memory_pressure_gate_v12(rows)['passed'])
    def test_adversarial_requires_all(self):
        rows=[{'faultClass':'a','detected':True,'detectorFailedClosed':True}]
        self.assertTrue(adversarial_corpus_gate_v12(rows,{'requiredFaultClasses':['a']})['passed'])
        self.assertFalse(adversarial_corpus_gate_v12(rows,{'requiredFaultClasses':['a','b']})['passed'])
    def test_autofix_converges(self):
        a=[{'openAfter':['x'],'checksPassed':False},{'openAfter':[],'checksPassed':True}]
        self.assertTrue(autofix_progress_gate_v12(a)['passed'])
    def test_autofix_stall_escalates(self):
        a=[{'openAfter':['x'],'checksPassed':False} for _ in range(3)]
        self.assertEqual(autofix_progress_gate_v12(a)['status'],'ROOT_CAUSE_ESCALATION_REQUIRED')
    def test_quality_non_compensating(self):
        layers={k:1 for k in ['static','zeroErrors','regression','adversarial','compatibility','shaderStutter','pressure','runtime','fleet','profiler','roblox']};layers['runtime']=0
        q=quality_confidence_v12(layers);self.assertFalse(q['passed']);self.assertEqual(q['confidencePercent'],0)
    def test_convergence_requires_adversarial(self):
        c=convergence_gate_v12(v11={'passed':True},artifact_hygiene={'passed':True},adversarial={'passed':False},compatibility={'passed':True},shader_stutter={'passed':True},pressure={'passed':True})
        self.assertFalse(c['passed']);self.assertEqual(c['status'],'CONTINUE_FIX_LOOP_V12')

class TestRuntimePackV12(unittest.TestCase):
    def test_runtime_pack_emits_collectors(self):
        from ai3d.production_v12 import write_v12_runtime_pack
        with tempfile.TemporaryDirectory() as d:
            files=write_v12_runtime_pack(Path(d))
            names={p.name for p in files}
            self.assertIn('web_runtime_collector_v12.js',names)
            self.assertIn('godot_runtime_collector_v12.gd',names)
            self.assertIn('runtime-evidence-contract-v12.json',names)
            self.assertIn('UNAVAILABLE',(Path(d)/'web_runtime_collector_v12.js').read_text())

class TestEvidenceHonestyV12(unittest.TestCase):
    def test_shader_unobservable_is_not_pass(self):
        rows=[{'frameTimeMs':16.0} for _ in range(100)]
        q=shader_stutter_gate_v12(rows);self.assertFalse(q['passed']);self.assertIn('shaderCompileTelemetryUnobservable',q['failures'])
    def test_pressure_unobservable_is_not_pass(self):
        rows=[{'frameTimeMs':16.0,'thermalState':'UNAVAILABLE','memoryPressure':'UNAVAILABLE'} for _ in range(40)]
        q=thermal_memory_pressure_gate_v12(rows);self.assertFalse(q['passed']);self.assertIn('noMemoryOrThermalPressureMetric',q['failures'])
