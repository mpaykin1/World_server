class_name GameMotionDriver
extends Node

@export_range(1.0,120.0,1.0) var animation_hz: float = 60.0
var secondary_motion_budget := 1.0
var ik_budget := 1.0
var _stride_phase := 0.0

func set_animation_hz(value: float) -> void: animation_hz = clampf(value,1.0,120.0)
func set_secondary_motion_budget(value: float) -> void: secondary_motion_budget = clampf(value,0.0,1.0)
func set_ik_budget(value: float) -> void: ik_budget = clampf(value,0.0,1.0)

func progress_to_frame(progress: float, frame_count: int) -> int:
	if frame_count <= 1: return 0
	return clampi(roundi(clampf(progress,0.0,1.0)*float(frame_count-1)),0,frame_count-1)

func smoothstep(progress: float) -> float:
	var t:=clampf(progress,0.0,1.0);return t*t*(3.0-2.0*t)

func locomotion_phase(speed_mps: float, delta: float, stride_length_m: float=1.0) -> float:
	_stride_phase=fmod(_stride_phase+maxf(0.0,speed_mps)*maxf(0.0,delta)/maxf(0.05,stride_length_m),1.0)
	return _stride_phase

func drive_animated_sprite(sprite: AnimatedSprite2D, progress: float) -> void:
	if sprite==null or sprite.sprite_frames==null:return
	sprite.frame=progress_to_frame(progress,sprite.sprite_frames.get_frame_count(sprite.animation))

func drive_animation_player(player: AnimationPlayer, animation: StringName, progress: float) -> void:
	if player==null or not player.has_animation(animation):return
	var length:=player.get_animation(animation).length;player.play(animation);player.seek(clampf(progress,0.0,1.0)*length,true);player.pause()

func drive_locomotion(player: AnimationPlayer, animation: StringName, speed_mps: float, delta: float, stride_length_m: float=1.0) -> void:
	drive_animation_player(player,animation,locomotion_phase(speed_mps,delta,stride_length_m))

func visual_sway(visual_child: Node3D, base_rotation: Vector3, time_seconds: float, amount: float=.05, speed: float=1.0) -> void:
	if visual_child==null:return
	var r:=base_rotation;r.z+=sin(time_seconds*speed)*amount*secondary_motion_budget;visual_child.rotation=r

# Attach visual-only motion to a visual child, not CharacterBody3D/StaticBody3D collision roots.
# For physically moving doors/platforms, animate the body and collision shape coherently.
