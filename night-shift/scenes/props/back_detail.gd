extends Node2D
## Depth in the back wall: things behind the room you can't get to.
##   bgdoor   a doorway into a dark room (no door left, just black beyond)
##   bggrate  a barred grate onto a dark void
## Root sits at the cell's centre on the wall.

var kind := "bgdoor"


func _ready() -> void:
	z_index = -6
	queue_redraw()


func _draw() -> void:
	match kind:
		"bgdoor":
			draw_rect(Rect2(-12, -20, 24, 36), Color(0.15, 0.15, 0.15))
			draw_rect(Rect2(-10, -18, 20, 34), Color(0.012, 0.012, 0.016))
			# A second frame further in: it goes back a long way.
			draw_rect(Rect2(-6, -12, 12, 1), Color(0.06, 0.06, 0.07))
			draw_rect(Rect2(-6, -12, 1, 28), Color(0.05, 0.05, 0.06))
			draw_rect(Rect2(5, -12, 1, 28), Color(0.05, 0.05, 0.06))
		"bggrate":
			draw_rect(Rect2(-11, -8, 22, 16), Color(0.14, 0.14, 0.15))
			draw_rect(Rect2(-9, -6, 18, 12), Color(0.015, 0.015, 0.02))
			for i in 5:
				draw_rect(Rect2(-8 + i * 4, -6, 1, 12), Color(0.26, 0.26, 0.27))
