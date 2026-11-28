class_name IK
extends RefCounted
## Inverse kinematics helpers.


## Two bones from `root` to `target`, lengths `a` (upper) and `b` (lower).
## Returns the joint (knee / elbow). `bend` (+1 / -1) picks which side of the
## root->target line the joint goes: in Godot's y-down screen space, -1 puts
## it counter-clockwise (up, for a limb reaching down-right). Out of reach the
## limb goes straight; too close, it folds.
static func two_bone(root: Vector2, target: Vector2, a: float, b: float, bend: float) -> Vector2:
	var d := target - root
	var dl := d.length()
	var dir := d / dl if dl > 0.001 else Vector2.DOWN
	var dist := clampf(dl, absf(a - b) + 0.01, a + b - 0.01)
	var cos_a := clampf((a * a + dist * dist - b * b) / (2.0 * a * dist), -1.0, 1.0)
	return root + dir.rotated(acos(cos_a) * bend) * a
