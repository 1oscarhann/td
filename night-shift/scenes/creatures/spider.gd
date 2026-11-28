class_name Spider
extends Area2D
## Little spider. A few pixels, dark, quick. Totally harmless.
##
## LIGHT RULE: scatters out of the beam when lit. It runs away from the torch
## along the ceiling, and if it runs out of room it squeezes into a crack and is
## gone for a while.
## PURPOSE: teach the player to look at ceilings and vents with zero danger, and
## get them used to things moving up there. (Payoff: one "spider" in a vent is
## really the tip of the Wedged Thing's leg, see leg_tip.gd.)
##
## HOW IT MOVES (scary phase 4): never smoothly. A burst, a dead stop, a twitch
## of one leg, another burst the other way. Now and then one lowers itself on a
## thread, hangs there turning, and climbs back up. Lit, it runs in jerky
## dash-stop-dash bursts.
##
## Creature layer + Light Only material for the torch pass, plus the night pass
## (a black spider with cold edges) so you see them in the dark. Root sits on the ceiling line; it hangs upside down from it.

enum State { CRAWL, FLEE, HIDDEN }

## How far (px) it wanders either side of where it was placed.
@export var wander_range := 40.0
@export var crawl_speed := 7.0
@export var flee_speed := 75.0

## Narrator line on the first scatter, shared by every spider in the game.
static var _told := false

const BODY := Color(0.15, 0.14, 0.13)
const ABDOMEN := Color(0.22, 0.20, 0.18)
const MARK := Color(0.56, 0.52, 0.46)
const LEGS := Color(0.26, 0.24, 0.22)

var state := State.CRAWL
var _home_x := 0.0
var _target_x := 0.0
var _flee_dir := 1.0
var _timer := 0.0
var _t := 0.0
var _moving := false        # mid-burst
var _speed := 0.0
var _gait := 0.0
var _facing := 1.0
var _twitch := -1           # which leg is twitching (-1 none)
var _size := 1.0
var _drop := 0.0            # px down on a thread
var _drop_target := 0.0
var _fled := 0.0


func _ready() -> void:
	# Always visible: the night pass (CreatureDraw.add_night_pass).
	_night = CreatureDraw.add_night_pass(self, _paint)
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = 0
	light_mask = GameState.LIGHT_CREATURES
	_home_x = position.x
	_target_x = position.x
	_t = randf() * 10.0
	_size = randf_range(0.85, 1.2)
	_timer = randf_range(0.2, 2.0)


func get_light_probe_points() -> Array:
	return [global_position + Vector2(0, 3.0 + _drop)]


func on_torch_lit_changed(lit: bool) -> void:
	if not lit or state != State.CRAWL:
		return
	var torch = GameState.torch
	_flee_dir = 1.0
	if torch != null and global_position.x < float(torch.global_position.x):
		_flee_dir = -1.0
	state = State.FLEE
	_fled = 0.0
	_drop_target = 0.0
	_moving = true
	_timer = randf_range(0.08, 0.2)
	# A group of spiders scattering = one encounter.
	if GameState.encounter_ready():
		GameState.mark_encounter("spiders", "spiders_%d" % int(_home_x / 96.0), 1e9)
	if not _told:
		_told = true
		Narrator.say("only_spiders")


func _physics_process(delta: float) -> void:
	_t += delta
	_timer -= delta
	# The thread: drops and climbs (instantly back up if it has to run).
	_drop = move_toward(_drop, _drop_target, (10.0 if _drop_target > _drop else 26.0) * delta)
	match state:
		State.CRAWL:
			if _timer <= 0.0:
				_next_crawl_beat()
			if _moving and _drop < 0.5:
				var step := _speed * delta
				position.x = move_toward(position.x, _target_x, step)
				_gait += step * 0.9
				if absf(position.x - _target_x) < 0.5:
					_moving = false
		State.FLEE:
			if _timer <= 0.0:
				# Dash, stop dead, dash again.
				_moving = not _moving
				_timer = randf_range(0.08, 0.22) if _moving else randf_range(0.04, 0.16)
				_speed = randf_range(0.9, 1.9) * flee_speed
			if _moving and _drop < 0.5:
				var step := _speed * delta
				position.x += _flee_dir * step
				_gait += step * 0.9
				_fled += step
				_facing = _flee_dir
			if _fled > wander_range * 1.5 or absf(position.x - _home_x) > wander_range * 2.0:
				_hide()
			elif _fled > wander_range * 0.6 and not _moving and randf() < 0.02:
				state = State.CRAWL
				_moving = false
				_timer = randf_range(0.6, 1.6)
		State.HIDDEN:
			if _timer <= 0.0:
				visible = true
				$Shape.set_deferred("disabled", false)
				position.x = _home_x + randf_range(-wander_range, wander_range) * 0.5
				state = State.CRAWL
				_timer = randf_range(0.5, 2.0)
	_redraw()


## Unhurried, it alternates: a quick burst somewhere, a long dead stop, a leg
## twitch, sometimes down on a thread.
func _next_crawl_beat() -> void:
	_twitch = -1
	var roll := randf()
	if _drop_target > 0.0:
		_drop_target = 0.0                         # back up the thread
		_timer = randf_range(1.0, 2.0)
	elif roll < 0.45:
		_moving = true
		_target_x = _home_x + randf_range(-wander_range, wander_range)
		_speed = randf_range(5.0, 11.0) * crawl_speed
		_facing = signf(_target_x - position.x) if absf(_target_x - position.x) > 0.5 else _facing
		_timer = randf_range(0.15, 0.5)
	elif roll < 0.9:
		_moving = false
		_timer = randf_range(0.6, 2.4)
		if randf() < 0.6:
			_twitch = randi() % 8
	else:
		_moving = false
		_drop_target = randf_range(6.0, 16.0)      # down on a thread
		_timer = randf_range(2.0, 3.5)


## Into a crack in the ceiling. Back in a few seconds.
func _hide() -> void:
	state = State.HIDDEN
	_timer = randf_range(4.0, 9.0)
	_drop_target = 0.0
	_drop = 0.0
	visible = false
	$Shape.set_deferred("disabled", true)


var _night: Node2D


func _redraw() -> void:
	queue_redraw()
	if _night != null:
		_night.queue_redraw()


func _draw() -> void:
	_paint(self)


## Shared by the torch pass (self) and the night pass.
func _paint(ci: CanvasItem) -> void:
	if _drop > 0.3:
		ci.draw_line(Vector2.ZERO, Vector2(0, _drop), Color(0.5, 0.5, 0.48, 0.6), 1.0)   # silk
	var twitch_leg := _twitch if fmod(_t * 9.0, 1.0) < 0.5 else -1
	draw_spider(ci, Vector2(0, _drop), _gait, _moving, _facing, _size, twitch_leg, _drop > 0.3)


## A spider hanging under a surface at `at` (the surface line), facing `facing`.
## Shared with LegTip, which pretends to be one.
static func draw_spider(ci: CanvasItem, at: Vector2, gait: float, moving: bool, facing: float,
		size: float, twitch_leg := -1, hanging := false, long_leg := -1) -> void:
	var s := size
	var head := at + Vector2(facing * 1.6 * s, 2.6 * s)
	var abd := at + Vector2(-facing * 1.4 * s, 2.8 * s)
	var phase := int(gait) % 2 if moving else 0
	for side: float in [-1.0, 1.0]:
		for i in 4:
			var leg := i + (4 if side > 0.0 else 0)
			var forward := (1.5 - float(i)) * facing      # front legs reach forward
			var hip := head.lerp(abd, 0.3) + Vector2(forward * 0.6 * s, 0)
			var spread := forward * 1.3 + side * 0.4
			var lift := 1.0 if (i + phase + (1 if side > 0.0 else 0)) % 2 == 0 and moving else 0.0
			if leg == twitch_leg:
				lift = 2.0
			var knee := hip + Vector2(spread * 1.6 * s, -2.2 * s - lift)
			var foot := at + Vector2(hip.x - at.x + spread * 3.2 * s, -lift * 0.6)
			if hanging:
				# On a thread: legs curl in around the body.
				knee = hip + Vector2(spread * 1.2 * s, -1.0 * s)
				foot = hip + Vector2(spread * 1.6 * s, 1.0 * s)
			if leg == long_leg:
				foot += Vector2(spread * 1.5, 2.0)          # one leg too long...
			ci.draw_line(hip, knee, LEGS, 1.0)
			ci.draw_line(knee, foot, LEGS, 1.0)
	ci.draw_circle(abd, 1.6 * s, ABDOMEN)
	ci.draw_circle(head, 1.1 * s, BODY)
	ci.draw_rect(Rect2((abd + Vector2(0, -0.5)).round(), Vector2(1, 1)), MARK)       # the pale mark
	ci.draw_rect(Rect2((head + Vector2(facing * 0.8, 0)).round(), Vector2(1, 1)), Color(0.6, 0.58, 0.5))  # eyes catch the light
