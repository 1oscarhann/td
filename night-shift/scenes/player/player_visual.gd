extends Node2D
## The player's look: a 44 px pixel-art sprite (art/player/player.png, made by
## tools/gen_tiles.py) plus the torch arm, drawn here so it can point at the
## mouse whichever way he faces. Facing follows MOVEMENT, never the torch.
##
## Sheet frames: 0-1 idle (breathing), 2-5 walk, 6-7 crouch (still / creeping).

const IDLE := [0, 1]
const WALK := [2, 3, 4, 5]
const CROUCH := [6, 7]
## Front shoulder (facing right), matching the sprite.
const STAND_SHOULDER := Vector2(3, -30)
const CROUCH_SHOULDER := Vector2(5, -18)

const SLEEVE := Color8(51, 69, 74)
const SLEEVE_DARK := Color8(39, 54, 59)
const SKIN := Color8(150, 121, 101)
const TORCH_BODY := Color8(19, 28, 32)
const TORCH_RIM := Color8(111, 133, 130)
const LENS := Color8(180, 194, 184)

@onready var player: Player = get_parent()
@onready var body: Sprite2D = $Body

var _t := 0.0
var _walk_dist := 0.0


func _process(delta: float) -> void:
	_t += delta
	var moving := absf(player.velocity.x) > 4.0 and player.is_on_floor()
	if moving:
		_walk_dist += absf(player.velocity.x) * delta
	body.flip_h = player.facing < 0
	if player.crouching:
		body.frame = CROUCH[int(_walk_dist / 10.0) % 2] if moving else CROUCH[0]
	elif moving:
		body.frame = WALK[int(_walk_dist / 9.0) % 4]
	else:
		body.frame = IDLE[int(_t / 1.2) % 2]   # slow breathing
	queue_redraw()


## The torch arm: sleeve to the elbow, forearm to the hand, then the torch,
## pointing wherever the beam points.
func _draw() -> void:
	var f := float(player.facing)
	var s := CROUCH_SHOULDER if player.crouching else STAND_SHOULDER
	var shoulder := Vector2(s.x * f, s.y)
	var hand: Vector2 = player.torch.position
	var aim: Vector2 = player.torch.get_aim_direction()
	# Elbow: halfway, dropped a little so the arm bends naturally.
	var elbow := (shoulder + hand) * 0.5 + Vector2(-2.0 * f, 3.0)
	draw_line(shoulder, elbow, SLEEVE, 3.0)
	draw_line(shoulder + Vector2(0, 1), elbow + Vector2(0, 1), SLEEVE_DARK, 1.0)
	draw_line(elbow, hand, SKIN, 2.0)
	draw_rect(Rect2(hand.round() - Vector2(1, 1), Vector2(3, 3)), SKIN)
	# Torch: dark tube along the aim, light rim, pale lens at the front.
	draw_line(hand - aim * 3.0, hand + aim * 5.0, TORCH_BODY, 3.0)
	draw_line(hand + aim * 4.0, hand + aim * 5.0, TORCH_RIM, 3.0)
	draw_rect(Rect2((hand + aim * 6.0).round(), Vector2(1, 1)), LENS)
