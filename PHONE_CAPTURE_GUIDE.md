# Phone capture — V6

Open `/capture-app/` from the Python server on the phone.

The capture app records:
- video;
- device orientation;
- IMU acceleration/rotation rate when the browser exposes it;
- GPS as a low-frequency drift anchor when permission is granted.

It uploads `video + capture_pose.json` together to `/capture/upload`.

## Space
Move smoothly through the scene. Avoid pure rotation from one fixed point. Prefer visible parallax and repeat views of the same surfaces.

## Character
Keep the full body in frame and move around the subject. V6 also builds CPU temporal deformation tracks. A moving/deforming subject is supported better than V5, but this is still not a learned CUDA 4DGS trainer.

## Best-quality pose source
If a native capture app can export real ARKit/ARCore camera `position + quaternion` per timestamp, put those values into the same pose JSON. V6 will prefer native positions over GPS and visual-odometry drift.
