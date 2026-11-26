extends Node2D
## Placeholder player art: coloured rectangles drawn in code.
## Faces the movement direction. The arm points along the torch, so you can see
## when you're walking one way and shining the other.

@onready var player: Player = get_parent()


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	var f := float(player.facing)
	var h := 15.0 if player.crouching else 28.0
	var legs := Color(0.17, 0.19, 0.25)
	var uniform := Color(0.30, 0.35, 0.44)
	var stripe := Color(0.85, 0.80, 0.30)   # hi-vis strip on the uniform
	var skin := Color(0.78, 0.66, 0.56)

	# Legs, torso, hi-vis stripe.
	draw_rect(Rect2(-4, -h * 0.38, 8, h * 0.38), legs)
	draw_rect(Rect2(-5, -h * 0.80, 10, h * 0.44), uniform)
	draw_rect(Rect2(-5, -h * 0.62, 10, 1), stripe)
	# Head + a one-pixel nose so facing reads at 384x216.
	var head_h := maxf(4.0, h * 0.2)
	draw_rect(Rect2(-3 + f, -h, 6, head_h), skin)
	draw_rect(Rect2(3.0 if f > 0.0 else -4.0, -h + 2.0, 1, 2), skin)

	# Arm towards the torch (the torch node is positioned at the hand).
	var shoulder := Vector2(f * 2.0, -h * 0.72)
	var hand := player.torch.position
	draw_line(shoulder, hand, skin, 1.0)
	# The torch body itself: a small dark tube along the beam direction.
	var aim := player.torch.get_aim_direction()
	draw_line(hand - aim * 2.0, hand + aim * 3.0, Color(0.12, 0.12, 0.14), 2.0)
