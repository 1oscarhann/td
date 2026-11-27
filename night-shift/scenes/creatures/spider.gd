class_name Spider
extends Area2D
## Little spider. A few pixels, dark, quick. Totally harmless.
##
## LIGHT RULE: scatters out of the beam when lit. It runs away from the torch
## along the ceiling, and if it runs out of room it squeezes into a crack and is
## gone for a while.
## PURPOSE: teach the player to look at ceilings and vents with zero danger, and
## get them used to things moving up there. (Later payoff from the doc: one
## "spider" in a vent turns out to be the tip of the Wedged Thing's leg.)
##
## Creature layer + Light Only material, like every creature: invisible outside
## the beam. Root sits on the ceiling line.

enum State { CRAWL, FLEE, HIDDEN }

## How far (px) it wanders either side of where it was placed.
@export var wander_range := 40.0
@export var crawl_speed := 7.0
@export var flee_speed := 75.0

## Narrator line on the first scatter, shared by every spider in the game.
static var _told := false

var state := State.CRAWL
var _home_x := 0.0
var _target_x := 0.0
var _flee_dir := 1.0
var _timer := 0.0
var _t := 0.0


func _ready() -> void:
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = 0
	light_mask = GameState.LIGHT_CREATURES
	_home_x = position.x
	_target_x = position.x
	_t = randf() * 10.0


func get_light_probe_points() -> Array:
	return [global_position]


func on_torch_lit_changed(lit: bool) -> void:
	if not lit or state != State.CRAWL:
		return
	var torch = GameState.torch
	_flee_dir = 1.0
	if torch != null and global_position.x < float(torch.global_position.x):
		_flee_dir = -1.0
	state = State.FLEE
	_timer = randf_range(0.4, 0.8)
	# A group of spiders scattering = one encounter.
	GameState.mark_encounter("spiders", "spiders_%d" % int(_home_x / 96.0), 1e9)
	if not _told:
		_told = true
		Narrator.say("only_spiders")


func _physics_process(delta: float) -> void:
	_t += delta
	_timer -= delta
	match state:
		State.CRAWL:
			if _timer <= 0.0:
				_timer = randf_range(1.0, 3.5)
				_target_x = _home_x + randf_range(-wander_range, wander_range)
			position.x = move_toward(position.x, _target_x, crawl_speed * delta)
		State.FLEE:
			position.x += _flee_dir * flee_speed * delta
			if absf(position.x - _home_x) > wander_range * 1.5:
				_hide()
			elif _timer <= 0.0:
				state = State.CRAWL
		State.HIDDEN:
			if _timer <= 0.0:
				visible = true
				$Shape.set_deferred("disabled", false)
				position.x = _home_x + randf_range(-wander_range, wander_range) * 0.5
				state = State.CRAWL
	queue_redraw()


## Into a crack in the ceiling. Back in a few seconds.
func _hide() -> void:
	state = State.HIDDEN
	_timer = randf_range(4.0, 9.0)
	visible = false
	$Shape.set_deferred("disabled", true)


func _draw() -> void:
	var body := Color(0.20, 0.19, 0.19)
	var shell := Color(0.32, 0.30, 0.29)
	var legs := Color(0.26, 0.25, 0.24)
	var moving := state == State.FLEE or absf(position.x - _target_x) > 0.5
	var phase := int(_t * (24.0 if state == State.FLEE else 8.0)) % 2 if moving else 0
	# Hugging the ceiling: head, abdomen with a glossy spot, eight bent legs.
	draw_rect(Rect2(-1, 0, 2, 2), body)
	draw_rect(Rect2(1, 0, 3, 2), body)
	draw_rect(Rect2(2, 0, 1, 1), shell)
	for i in 4:
		var lx := -1 + i
		var up := (i + phase) % 2
		draw_rect(Rect2(lx - 2, 1 + up, 1, 1), legs)    # left legs
		draw_rect(Rect2(lx - 3, 2 + up, 1, 1), legs)
		draw_rect(Rect2(lx + 3, 1 + up, 1, 1), legs)    # right legs
		draw_rect(Rect2(lx + 4, 2 + up, 1, 1), legs)
