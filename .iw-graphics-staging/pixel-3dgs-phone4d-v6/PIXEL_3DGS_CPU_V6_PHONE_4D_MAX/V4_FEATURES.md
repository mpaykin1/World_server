# V4 feature matrix

## Inputs
- 360 panorama set
- 360 video
- perspective space video
- character turntable/orbit video

## Video automation
- probe metadata
- blur/exposure analysis
- duplicate filtering
- scene-cut detection
- longest continuous shot selection
- keyframe selection
- auto `space/character` classification
- streaming FastAPI upload
- background job progress

## Space reconstruction
- SIFT correspondences
- DIS dense-flow fallback
- Essential Matrix visual odometry
- upright camera stabilization
- loop-closure drift correction
- perspective pinhole rays
- optional ONNX depth
- multi-view photometric depth search
- dynamic-object residual mask
- floor semantics
- surfel fusion
- Manhattan planes
- tangent hole filling
- sparse TSDF
- hybrid planar proxy
- collision + navgrid

## Character reconstruction
- adaptive CPU subject segmentation
- optional ONNX segmentation
- orbit camera model
- foreground-only multi-view depth fusion
- metric height normalization
- pixel palette quantization
- anisotropic surfels
- hidden hull proxy
- capsule collision

## Runtime/output
- PLY LOD0/LOD1/LOD2
- covariance data
- spatial chunks
- EWA anisotropic splat renderer
- weighted blended OIT
- autonomous HTML viewer
- manifests and quality reports
