extends Node2D
## The foreground layer: pipes, girders and hanging cables between you and the
## room, close to the camera. They slide past faster than the world (parallax
## 1.35x), darkened, and partly hide things.
##
## How the parallax works: an item meant to sit at world x is drawn at
## x * K, and the whole layer is offset by -(K - 1) * camera x. At the camera
## right on it, it's exactly at x; as the camera moves, it moves K times as fast.

const K := 1.35
const BASE := Color(0.20, 0.20, 0.22)
const EDGE := Color(0.30, 0.30, 0.32)

var items: Array = []            # {x, floor_y, kind}


func _ready() -> void:
	z_as_relative = false
	z_index = 30
	modulate = Color(0.62, 0.62, 0.66)   # darkened: nearer the camera, out of the light


func add_item(x: float, floor_y: float, kind: String) -> void:
	items.append({"x": x, "floor_y": floor_y, "kind": kind})


func _process(_delta: float) -> void:
	var cam := get_viewport().get_camera_2d()
	if cam == null:
		return
	position.x = -(K - 1.0) * cam.get_screen_center_position().x
	queue_redraw()


func _draw() -> void:
	var cam := get_viewport().get_camera_2d()
	if cam == null:
		return
	var cx := cam.get_screen_center_position().x
	for it in items:
		var x: float = it.x
		if absf(x - cx) > 520.0:
			continue
		var fx := x * K
		var fy: float = it.floor_y
		match it.kind:
			"pipe":
				draw_rect(Rect2(fx - 4, fy - 300, 8, 380), BASE)
				draw_rect(Rect2(fx - 4, fy - 300, 1, 380), EDGE)
				for j in 6:
					draw_rect(Rect2(fx - 5, fy - 290 + j * 62, 10, 3), EDGE)
			"girder":
				var a := Vector2(fx - 70, fy - 260)
				var b := Vector2(fx + 50, fy + 40)
				draw_line(a, b, BASE, 9.0)
				draw_line(a + Vector2(0, -4), b + Vector2(0, -4), EDGE, 1.0)
				for j in 6:
					draw_circle(a.lerp(b, 0.08 + j * 0.16), 1.0, EDGE)
			"cables":
				for j in 3:
					var p0 := Vector2(fx - 40 + j * 9, fy - 300)
					var p1 := Vector2(fx + 30 + j * 7, fy - 300)
					var sag := 150.0 + j * 22.0
					var pts := PackedVector2Array()
					for s in 13:
						var t := float(s) / 12.0
						pts.append(p0.lerp(p1, t) + Vector2(0, sin(t * PI) * sag))
					draw_polyline(pts, BASE, 3.0 - j * 0.5)
