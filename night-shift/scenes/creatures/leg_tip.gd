class_name LegTip
extends Area2D
## The "spider" that isn't. It sits at the lip of a vent looking exactly like
## the real spiders around it, except it never quite moves right: it twitches
## where the others scuttle, and one of its "legs" is a little too long.
## Lit for a proper look, it doesn't scatter. It slides out: a long jointed leg,
## the Wedged Thing's colour, knuckles and all, ending in a hooked point that
## taps the air. Then it pulls back SLOWLY into the vent and is gone for good.
## The voice repeats "they're only spiders", now a lie. Every spider after this
## is suspicious.
##
## Creature layer + Light Only material. Root sits just under the vent.

enum State { WAITING, REVEAL, RETRACT }

@export var reveal_length := 30.0
@export var retract_time := 3.5

var state := State.WAITING
var length := 4.0
var _t := 0.0
var _lit_time := 0.0
var _hold := 0.9


func _ready() -> void:
	# Always visible: the night pass (CreatureDraw.add_night_pass).
	_night = CreatureDraw.add_night_pass(self, _paint)
	collision_layer = GameState.LAYER_CREATURES
	collision_mask = 0
	light_mask = GameState.LIGHT_CREATURES


func get_light_probe_points() -> Array:
	return [global_position + Vector2(0, maxf(length, 3.0))]


func _physics_process(delta: float) -> void:
	_t += delta
	match state:
		State.WAITING:
			# Wait for a proper look, not a sweep.
			_lit_time = _lit_time + delta if GameState.is_lit(self) else 0.0
			if _lit_time > 0.6 and GameState.encounter_ready():
				state = State.REVEAL
				Narrator.say("only_spiders_lie")
				GameState.mark_encounter("leg", "leg", 1e9)
				AudioDirector.play_at("scrape", global_position, -14.0, 0.05, 260.0, 0.6)
		State.REVEAL:
			# Out in little jerks, not a smooth slide.
			var jerk := 1.0 if fmod(_t, 0.45) < 0.18 else 0.15
			length = move_toward(length, reveal_length, 48.0 * jerk * delta)
			if length >= reveal_length:
				_hold -= delta   # a beat fully out, tapping, then it goes
				if _hold <= 0.0:
					state = State.RETRACT
		State.RETRACT:
			length = move_toward(length, 0.0, reveal_length / retract_time * delta)
			if length <= 0.0:
				queue_free()   # gone for good
	_redraw()


var _night: Node2D


func _redraw() -> void:
	queue_redraw()
	if _night != null:
		_night.queue_redraw()


func _draw() -> void:
	_paint(self)


## Shared by the torch pass (self) and the night pass.
func _paint(ci: CanvasItem) -> void:
	if state == State.WAITING:
		# A spider at the vent... that twitches instead of moving, one leg too long.
		var twitch := 7 if fmod(_t * 2.3, 1.0) < 0.12 else -1
		Spider.draw_spider(ci, Vector2(0, -1), 0.0, false, 1.0, 1.0, twitch, false, 2)
		return
	# Out of the vent: four bones, knuckles, a hooked point. The Thing's leg.
	var ldir := CreatureDraw.light_dir(self, Vector2(0, length * 0.5))
	var tap := sin(_t * 7.0) * 2.0 if state == State.REVEAL and length >= reveal_length - 0.5 else 0.0
	var pts := PackedVector2Array([Vector2.ZERO])
	var a := PI * 0.5 + 0.25
	var bends := [0.0, -0.55, 0.5, -0.35]
	var seg := length / 4.0
	var p := Vector2.ZERO
	for i in 4:
		a += float(bends[i])
		if i == 3:
			a += tap * 0.12
		p += Vector2.from_angle(a) * seg
		pts.append(p)
	CreatureDraw.limb(ci, pts, 4.0, 1.0, WedgedThing.SKIN, WedgedThing.RIM, WedgedThing.DARK, ldir)
	for i in range(1, 4):
		CreatureDraw.knuckle(ci, pts[i], 1.6 - float(i) * 0.3, WedgedThing.SKIN, WedgedThing.BONE, WedgedThing.DARK, ldir)
	var tip := pts[4]
	var hook := (tip - pts[3]).normalized().rotated(-1.9) * 3.0
	ci.draw_line(tip, tip + hook, WedgedThing.BONE, 1.0)
