from __future__ import annotations
import unittest
import numpy as np
from ai3d.semantic_projection_v7 import mask_from_model_output, semantic_projection_config

class SemanticV7Tests(unittest.TestCase):
    def test_multiclass_mask(self):
        x=np.zeros((1,3,2,2),dtype=np.float32);x[0,2,0,1]=5;x[0,1,1,1]=3
        m=mask_from_model_output(x,[2]);self.assertTrue(m[0,1]);self.assertFalse(m[1,1])
    def test_multiclass_requires_ids(self):
        with self.assertRaises(ValueError):mask_from_model_output(np.zeros((1,3,2,2),dtype=np.float32),[])
    def test_binary_threshold(self):
        m=mask_from_model_output(np.array([[[[0.1,0.8],[0.6,0.2]]]],dtype=np.float32),None,.5);self.assertEqual(int(m.sum()),2)
    def test_projection_requires_camera(self):
        r=semantic_projection_config({'maskCreated':True,'maskPath':'/nope'},None);self.assertFalse(r['enabled'])

if __name__=='__main__':unittest.main()
