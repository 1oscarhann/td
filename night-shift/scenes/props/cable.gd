class_name WallCable
extends Line2D
## A power cable hanging along a wall between two fixings, sagging in the middle.
## Drawn in the ENVIRONMENT layer on purpose: it's scenery and always visible.
## The design doc's Cables creature reuses this exact scene (a fake cable just
## gets an AI script later), so real and fake must look identical.
## Root sits on the left fixing; `end_point` is the right fixing, relative to it.

@export var end_point := Vector2(96, 0)
## How far (px) the middle droops below a straight line.
@export var sag := 8.0
@export var segments := 12


func _ready() -> void:
	var pts := PackedVector2Array()
	for i in segments + 1:
		var t := float(i) / segments
		var p := Vector2.ZERO.lerp(end_point, t)
		p.y += sag * 4.0 * t * (1.0 - t)   # parabola: 0 at the ends, `sag` in the middle
		pts.append(p.round())
	points = pts
