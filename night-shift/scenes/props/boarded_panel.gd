class_name BoardedPanel
extends Node2D
## A boarded-up panel. Hold E to pull the boards off, one at a time.
##
## Pulling needs both hands: while you hold E the player forces the torch to point
## at the floor (requires_two_hands). Every board is loud: a creak when you start
## pulling, a crack (and a big noise event) when it comes free.
## Someone sealed this. Never explain who.
##
## The root sits at the bottom-left of the opening.
## Children:
##   Blocker      StaticBody2D (world layer) filling the opening until it's open.
##   InteractZone Area2D on the interactables layer, wider than the opening.
##   Occluder     LightOccluder2D so the torch doesn't shine through the boards.

signal board_ripped(remaining: int)
signal opened

const HOLE_TEX := preload("res://art/props/panel_hole.tres")
const PLANK_TEX := preload("res://art/props/plank.tres")

@export var board_count := 3
## Seconds of holding E per board.
@export var pull_time := 1.3
@export var opening_size := Vector2(16, 48)
## How far (px) a board coming free carries. Big on purpose.
@export var noise_radius := 260.0
## Later in the game: boards splintered outward, nails bent the wrong way.
## Something already came through: it starts broken open, the boards hanging
## off the frame and lying on YOUR side of it.
@export var pushed_from_inside := false
## Disabled panels can't be pulled yet (Act 0: nothing to fix until the power dies).
@export var enabled := true

var requires_two_hands := true
var boards_left := 0
var progress := 0.0

var _pulling := false
var _boards: Array = []   # [{y, angle}] from the top board down
var _t := 0.0


func _ready() -> void:
	boards_left = board_count
	var rng := RandomNumberGenerator.new()
	rng.seed = int(global_position.x * 13.0 + global_position.y)
	for i in board_count:
		var k := 0.5 if board_count == 1 else float(i) / float(board_count - 1)
		_boards.append({
			"y": lerpf(-opening_size.y + 5.0, -5.0, k),
			"angle": rng.randf_range(-0.35, 0.35),
		})

	var block := RectangleShape2D.new()
	block.size = opening_size
	$Blocker.collision_layer = GameState.LAYER_WORLD
	$Blocker/Shape.shape = block
	$Blocker/Shape.position = Vector2(opening_size.x * 0.5, -opening_size.y * 0.5)

	var zone := RectangleShape2D.new()
	zone.size = opening_size + Vector2(28, 0)
	$InteractZone.collision_layer = GameState.LAYER_INTERACT
	$InteractZone/Shape.shape = zone
	$InteractZone/Shape.position = $Blocker/Shape.position

	if pushed_from_inside:
		boards_left = 0
		$Blocker/Shape.disabled = true
		_scatter_pushed_boards()
		return

	var occ := OccluderPolygon2D.new()
	occ.polygon = PackedVector2Array([
		Vector2(2, -opening_size.y + 2), Vector2(opening_size.x - 2, -opening_size.y + 2),
		Vector2(opening_size.x - 2, -2), Vector2(2, -2),
	])
	$Occluder.occluder = occ


func _process(delta: float) -> void:
	if _pulling:
		_t += delta
		queue_redraw()


# ------------------------------------------------------ interactable interface
# The player duck-types these: can_interact, interact_hold, interact_release,
# get_progress, get_interact_point, get_prompt_point, requires_two_hands.

func can_interact() -> bool:
	return enabled and boards_left > 0


func get_progress() -> float:
	return progress


func get_interact_point() -> Vector2:
	return global_position + Vector2(opening_size.x * 0.5, -opening_size.y * 0.5)


func get_prompt_point() -> Vector2:
	return global_position + Vector2(opening_size.x * 0.5, -opening_size.y - 7.0)


func interact_hold(_by: Node, delta: float) -> void:
	if boards_left <= 0:
		return
	if not _pulling:
		_pulling = true
		AudioDirector.play_at("creak", get_interact_point(), -6.0, 0.15)
		GameState.make_noise(get_interact_point(), noise_radius * 0.3)
	progress += delta / pull_time
	if progress >= 1.0:
		_rip_board()
	queue_redraw()


func interact_release() -> void:
	_pulling = false
	progress = 0.0
	queue_redraw()


# ---------------------------------------------------------------------- internals

func _rip_board() -> void:
	progress = 0.0
	_pulling = false   # next pull starts with a fresh creak
	boards_left -= 1
	var board: Dictionary = _boards.pop_front()
	AudioDirector.play_at("crack", get_interact_point(), 0.0, 0.1, 900.0)
	GameState.make_noise(get_interact_point(), noise_radius)
	_drop_board(board)
	board_ripped.emit(boards_left)
	if boards_left == 0:
		$Blocker/Shape.set_deferred("disabled", true)
		$Occluder.occluder = null
		opened.emit()


## Pushed from inside: two planks lie splintered on the near side, flung out.
func _scatter_pushed_boards() -> void:
	for i in 2:
		var plank := Sprite2D.new()
		plank.texture = PLANK_TEX
		plank.position = Vector2(-9.0 - 9.0 * i, -3.0 - i)
		plank.rotation = 0.15 - 0.3 * i
		add_child(plank)


## The plank you pulled falls to the floor in front of the panel and stays there.
func _drop_board(board: Dictionary) -> void:
	var plank := Sprite2D.new()
	plank.texture = PLANK_TEX
	get_parent().add_child(plank)
	plank.global_position = global_position + Vector2(opening_size.x * 0.5, float(board.y))
	plank.rotation = float(board.angle)
	var landing := global_position + Vector2(-10.0 - 7.0 * boards_left, -3.0)
	var tw := plank.create_tween().set_parallel()
	tw.tween_property(plank, "global_position", landing, 0.35) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_property(plank, "rotation", randf_range(-0.12, 0.12), 0.35)


func _draw() -> void:
	var w := opening_size.x
	var h := opening_size.y
	# The hole behind the boards (frame + the first steps going down).
	draw_texture_rect(HOLE_TEX, Rect2(0, -h, w, h), false)

	var plank_size := Vector2(PLANK_TEX.get_width(), PLANK_TEX.get_height())
	if pushed_from_inside:
		# One board still hanging off a bent nail at the top of the frame,
		# swung outward. The rest are on the floor.
		draw_set_transform(Vector2(w - 2.0, -h + 4.0), 1.25)
		draw_texture(PLANK_TEX, Vector2(0, -plank_size.y * 0.5))
		draw_set_transform(Vector2.ZERO)
		return
	for i in _boards.size():
		var b: Dictionary = _boards[i]
		var angle := float(b.angle)
		var pos := Vector2(w * 0.5, float(b.y))
		if pushed_from_inside:
			angle = -angle * 1.5   # bent outward, the wrong way
		if i == 0 and _pulling:
			# The board you're pulling strains and wobbles outwards.
			angle += sin(_t * 38.0) * 0.06 * (0.3 + progress)
			pos.x += sin(_t * 23.0) * progress
		draw_set_transform(pos, angle)
		draw_texture(PLANK_TEX, -plank_size * 0.5)
	draw_set_transform(Vector2.ZERO)
