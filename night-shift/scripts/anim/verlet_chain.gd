class_name VerletChain
extends RefCounted
## A chain of points with inertia and fixed segment lengths (position-based
## physics). Point 0 is pinned to an anchor; the rest swing, trail behind and
## settle on their own. `stiffness` pulls every point a little towards a posed
## shape each step, so a limb can be springy instead of a rope: it holds the
## pose, but sways, lags and overshoots around it.
## Simulate in WORLD space so the owner's movement makes it swing.

var p := PackedVector2Array()
var lengths := PackedFloat32Array()
var gravity := Vector2(0, 600)
## Velocity kept per step (1 = none lost).
var damping := 0.92
var iterations := 3
## 0..1 per step towards the pose (0 = rope, 1 = rigid pose).
var stiffness := 0.2
## Points can't go below this y (the floor) or above `ceil_y`.
var floor_y := INF
var ceil_y := -INF

var _prev := PackedVector2Array()


## Start at rest in this shape.
func setup(points: PackedVector2Array) -> void:
	p = points.duplicate()
	_prev = points.duplicate()
	set_lengths_from(points)


## Segment lengths follow a pose (when the owner squashes or stretches).
func set_lengths_from(points: PackedVector2Array) -> void:
	lengths.resize(points.size() - 1)
	for i in lengths.size():
		lengths[i] = points[i].distance_to(points[i + 1])


func step(dt: float, anchor: Vector2, pose := PackedVector2Array()) -> void:
	var n := p.size()
	if n < 2:
		return
	var g := gravity * dt * dt
	# 1) Inertia: keep moving the way it was moving.
	for i in range(1, n):
		var cur := p[i]
		var vel := (cur - _prev[i]) * damping
		_prev[i] = cur
		p[i] = cur + vel + g
	_prev[0] = p[0]
	p[0] = anchor
	# 2) Springy: drift towards the pose.
	if stiffness > 0.0 and pose.size() == n:
		for i in range(1, n):
			p[i] = p[i].lerp(pose[i], stiffness)
	# 3) Constraints: segment lengths, floor, ceiling.
	for it in iterations:
		p[0] = anchor
		for i in n - 1:
			var a := p[i]
			var b := p[i + 1]
			var d := b - a
			var dist := d.length()
			if dist < 0.0001:
				continue
			var diff := (dist - lengths[i]) / dist
			if i == 0:
				p[i + 1] = b - d * diff
			else:
				p[i] = a + d * (diff * 0.5)
				p[i + 1] = b - d * (diff * 0.5)
		for i in range(1, n):
			var q := p[i]
			if q.y > floor_y or q.y < ceil_y:
				q.y = clampf(q.y, ceil_y, floor_y)
				p[i] = q


## Teleported: move the whole chain without it whipping.
func shift(by: Vector2) -> void:
	for i in p.size():
		p[i] += by
		_prev[i] += by
