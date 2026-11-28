extends Node2D
## Story rooms: dense little scenes, never explained. Drawn in pixels, lit like
## the environment. Root sits on the floor (or `above_floor` px up the wall).
##   crisps_stack / crisps_stack_low  the shop's crisps, boxed and stacked to the
##                                    ceiling, years of them
##   kettle_table   a staff room table: a kettle, mugs (one still full), a
##                  biscuit tin
##   rota           a staff rota pinned to the wall: one name, every shift
##   stock_cage     a wire stock cage, cut open from the inside
##   sleeping_bag   someone slept down here: a bag, a pillow, a torch, batteries

var kind := "crisps_stack"
var room_height := 96.0          # floor to ceiling here (px)

const CRISP := [Color(0.62, 0.18, 0.14), Color(0.20, 0.33, 0.55), Color(0.70, 0.55, 0.12), Color(0.24, 0.45, 0.22)]
const CARD := Color(0.47, 0.37, 0.23)
const CARD_DARK := Color(0.34, 0.26, 0.15)


func _ready() -> void:
	queue_redraw()


func _draw() -> void:
	match kind:
		"crisps_stack", "crisps_stack_low":
			# Boxes stacked to the ceiling (or nearly), a crisp packet peeking out
			# of every few, leaning a little.
			var top := room_height - 2.0 if kind == "crisps_stack" else room_height * 0.55
			var y := 0.0
			var row := 0
			while y + 12.0 <= top:
				for i in 3:
					var x := -21.0 + i * 14.0 + (2.0 if row % 2 else 0.0)
					draw_rect(Rect2(x, -y - 12.0, 13, 12), CARD if (i + row) % 3 else CARD_DARK)
					draw_rect(Rect2(x, -y - 12.0, 13, 1), CARD.lightened(0.15))
					if (i * 7 + row * 3) % 4 == 0:
						draw_rect(Rect2(x + 4, -y - 14.0, 5, 3), CRISP[(i + row) % CRISP.size()])
				y += 12.0
				row += 1
		"kettle_table":
			draw_rect(Rect2(-18, -14, 36, 2), Color(0.42, 0.40, 0.36))       # table top
			draw_rect(Rect2(-16, -12, 2, 12), Color(0.30, 0.30, 0.30))
			draw_rect(Rect2(14, -12, 2, 12), Color(0.30, 0.30, 0.30))
			draw_rect(Rect2(-14, -22, 8, 8), Color(0.75, 0.75, 0.72))        # kettle
			draw_rect(Rect2(-6, -20, 2, 3), Color(0.75, 0.75, 0.72))
			draw_rect(Rect2(-13, -24, 6, 2), Color(0.20, 0.20, 0.20))
			draw_rect(Rect2(-1, -18, 4, 4), Color(0.80, 0.25, 0.20))         # mugs
			draw_rect(Rect2(5, -18, 4, 4), Color(0.85, 0.85, 0.80))
			draw_rect(Rect2(6, -18, 2, 1), Color(0.35, 0.22, 0.12))          # this one's still full
			draw_rect(Rect2(10, -19, 6, 5), Color(0.30, 0.38, 0.55))         # biscuit tin
		"rota":
			draw_rect(Rect2(-9, -12, 18, 14), Color(0.82, 0.80, 0.72))
			draw_rect(Rect2(-1, -13, 2, 2), Color(0.7, 0.15, 0.15))          # drawing pin
			for i in 5:
				draw_line(Vector2(-7, -8 + i * 2.5), Vector2(7, -8 + i * 2.5), Color(0.35, 0.35, 0.40), 1.0)
				draw_rect(Rect2(-7, -9 + i * 2.5, 4, 2), Color(0.20, 0.20, 0.45))   # the same name, every shift
		"stock_cage":
			var wire := Color(0.48, 0.49, 0.50)
			draw_rect(Rect2(-14, -40, 28, 40), Color(0.06, 0.06, 0.07, 0.6))
			for i in 8:
				var x := -14.0 + i * 4.0
				if i == 3 or i == 4:
					# Cut, and bent OUTWARDS. From the inside.
					draw_line(Vector2(x, -40), Vector2(x, -26), wire, 1.0)
					draw_line(Vector2(x, -26), Vector2(x + (-5.0 if i == 3 else 5.0), -20), wire, 1.0)
					draw_line(Vector2(x, 0), Vector2(x, -8), wire, 1.0)
					draw_line(Vector2(x, -8), Vector2(x + (-4.0 if i == 3 else 4.0), -13), wire, 1.0)
				else:
					draw_line(Vector2(x, -40), Vector2(x, 0), wire, 1.0)
			for j in 5:
				draw_line(Vector2(-14, -40 + j * 10), Vector2(14, -40 + j * 10), wire, 1.0)
			draw_rect(Rect2(-12, -6, 7, 6), CARD_DARK)                       # what's left in it
		"sleeping_bag":
			draw_rect(Rect2(-22, -5, 34, 5), Color(0.22, 0.30, 0.22))       # the bag
			draw_rect(Rect2(-22, -6, 34, 1), Color(0.30, 0.40, 0.30))
			draw_rect(Rect2(10, -6, 8, 6), Color(0.70, 0.68, 0.60))         # pillow (a jumper)
			draw_rect(Rect2(-30, -3, 6, 3), Color(0.15, 0.15, 0.15))        # a torch, the same model as yours
			draw_rect(Rect2(-24, -3, 2, 3), Color(0.70, 0.65, 0.40))
			for i in 4:                                                      # batteries, used
				draw_rect(Rect2(20 + i * 3.0, -2, 2, 2), Color(0.25, 0.25, 0.25) if i % 2 else Color(0.60, 0.45, 0.10))
			draw_rect(Rect2(-36, -1, 3, 1), Color(0.6, 0.6, 0.55))           # a crisp packet, folded
