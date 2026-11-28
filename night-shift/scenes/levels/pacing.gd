class_name Pacing
extends Node
## The level's director of dread (scary phase 3). Owns four things:
##
## TENSION (0..1), pushed to the drone, the film grain and the vignette:
##   - builds slowly with time since the last real encounter (dread, ~2 min)
##   - spikes right after an encounter and fades
##   - the Wedged Thing awake and close (heard or not)
##   - darkness: torch off, deeper zones
##   - drops to almost nothing in a safe room
##
## FALSE ALARMS: things that lead to nothing. Far more of them than real
## scares (target 3x+):
##   - a creature calling far away
##   - a tap right behind you
##   - knocking in the pipes
##   - something rattling in a vent
##   - a FUSE BOX sign flickering under a dying tube
##   Never in a safe room, during a silence, just after a real scare, or with
##   the Thing nearby. They come more often as tension rises.
##
## SILENCE: hush(seconds) drops every ambient layer out (hum bed, drips, false
## alarms, drone). The level places hush triggers just before every scripted
## encounter.
##
## SAFE ROOMS: one per zone, a working light, ambience softer, no false
## alarms, tension near zero. Relief.
##
## Also (scary phase 4):
##   - the vignette pulses faintly when the Thing is close but you can't see it
##   - the torch flickers briefly inside every pre-encounter silence, and from
##     zone 3 on it also flickers now and then for no reason (a false alarm)

const DISTANT_SOUNDS := ["moan_distant", "wail_distant", "growl", "call"]
## False alarm weights per zone (zone 1 is the gas station's own basement).
const ALARM_WEIGHTS := {
	1: {"tap_behind": 3, "knock": 3, "rattle": 3, "sign": 2, "distant": 1},
	2: {"tap_behind": 2, "knock": 3, "rattle": 2, "sign": 2, "distant": 3},
	3: {"tap_behind": 3, "knock": 1, "rattle": 2, "sign": 1, "distant": 4, "torch": 2},
	4: {"tap_behind": 3, "knock": 1, "rattle": 1, "sign": 1, "distant": 4, "torch": 2},
}

## No false alarms this soon after a real encounter.
@export var quiet_after_encounter := 6.0
## Seconds between false alarms at tension 0 (60% of this at tension 1).
@export var alarm_interval := Vector2(6.0, 13.0)

var level = null                 # TestLevel (duck typed: .thing)
var safe_rooms: Array = []       # [Vector2(x0, x1)] world px
var tension := 0.0
var in_safe := false

var _since_encounter := 0.0
var _silent_left := 0.0
var _alarm_timer := 8.0
var _last_alarm := ""
var _flicker_in := -1.0           # torch flicker scheduled inside a silence


func _ready() -> void:
	GameState.encounter.connect(_on_encounter)


func add_safe_room(x0: float, x1: float) -> void:
	safe_rooms.append(Vector2(x0, x1))


## Everything ambient drops out for `seconds`.
func hush(seconds: float) -> void:
	_silent_left = maxf(_silent_left, seconds)
	AudioDirector.hush_drone(seconds)
	# Somewhere in the silence, the torch stutters. Something's coming.
	_flicker_in = randf_range(1.0, minf(2.5, seconds - 0.5))


func is_silent() -> bool:
	return _silent_left > 0.0


func seconds_since_encounter() -> float:
	return _since_encounter


func _on_encounter(_kind: String) -> void:
	_since_encounter = 0.0
	_alarm_timer = maxf(_alarm_timer, quiet_after_encounter)


func _process(delta: float) -> void:
	var p = GameState.player
	if p == null:
		return
	_since_encounter += delta
	_silent_left = maxf(0.0, _silent_left - delta)
	var x: float = p.global_position.x
	in_safe = false
	for r: Vector2 in safe_rooms:
		if x >= r.x and x <= r.y:
			in_safe = true
	_update_tension(delta, p)
	if GameState.zone >= 1 and not in_safe and not is_silent():
		_alarm_tick(delta, p)
	if _flicker_in > 0.0:
		_flicker_in -= delta
		if _flicker_in <= 0.0 and GameState.torch != null:
			GameState.torch.flicker(randf_range(0.25, 0.45))
	GameState.tension = tension
	AudioDirector.tension = tension if GameState.zone >= 1 else 0.0
	get_tree().call_group("post_fx", "set_tension", tension)
	# The Thing close, but not in your light: the edges of the screen breathe.
	var unseen := 0.0
	if level != null and level.thing != null and not GameState.is_lit(level.thing):
		unseen = _thing_near(p, 300.0)
	get_tree().call_group("post_fx", "set_pulse", unseen)


func _update_tension(delta: float, p: Node2D) -> void:
	var target := 0.0
	if GameState.zone >= 1:
		var dread := smoothstep(8.0, 120.0, _since_encounter) * 0.45
		var after := maxf(0.0, 1.0 - _since_encounter / 8.0) * 0.55
		var near := _thing_near(p, 520.0) * 0.75
		var dark := 0.03 * float(GameState.zone)
		if GameState.torch == null or not GameState.torch.is_on:
			dark += 0.08
		target = clampf(0.08 + dread + maxf(near, after) + dark, 0.0, 1.0)
		if in_safe:
			target = 0.05
	var rate := 0.15 if target > tension else 0.06
	tension = move_toward(tension, target, rate * delta)


## 0..1: how close the awake Thing is (0 = asleep or further than `reach`).
func _thing_near(p: Node2D, reach: float) -> float:
	if level == null or level.thing == null:
		return 0.0
	var thing = level.thing
	if thing.state == WedgedThing.State.DORMANT:
		return 0.0
	return clampf(1.0 - thing.global_position.distance_to(p.global_position) / reach, 0.0, 1.0)


func _alarm_tick(delta: float, p: Node2D) -> void:
	if _since_encounter < quiet_after_encounter or _thing_near(p, 320.0) > 0.0:
		return
	_alarm_timer -= delta
	if _alarm_timer > 0.0:
		return
	_alarm_timer = randf_range(alarm_interval.x, alarm_interval.y) * lerpf(1.0, 0.6, tension)
	_false_alarm(p)


func _pick_kind() -> String:
	var weights: Dictionary = ALARM_WEIGHTS.get(clampi(GameState.zone, 1, 4), ALARM_WEIGHTS[2])
	var total := 0
	for k: String in weights:
		if k != _last_alarm:
			total += int(weights[k])
	var roll := randi() % maxi(total, 1)
	for k: String in weights:
		if k == _last_alarm:
			continue
		roll -= int(weights[k])
		if roll < 0:
			return k
	return "distant"


func _false_alarm(p: Node2D) -> void:
	var kind := _pick_kind()
	var pos: Vector2 = p.global_position
	match kind:
		"distant":
			AudioDirector.play_distant(DISTANT_SOUNDS.pick_random(), pos, -8.0)
		"tap_behind":
			# Something tapping, right behind you. Turn round: nothing.
			var facing := float(p.get("facing")) if p.get("facing") != null else 1.0
			var at := pos + Vector2(-facing * randf_range(70.0, 140.0), -randf_range(0.0, 24.0))
			_taps(at, randi_range(1, 3))
		"knock":
			var at := pos + Vector2(randf_range(-280.0, 280.0), -40.0)
			_knocks(at, randi_range(2, 4))
		"rattle":
			var vent := _nearest_in_group("vents", pos, 360.0)
			if vent != null:
				var r = AudioDirector.play_at("rattle", vent.global_position, -6.0, 0.1, 420.0)
				if r != null:
					get_tree().create_timer(randf_range(1.2, 2.4)).timeout.connect(func():
						if is_instance_valid(r): r.queue_free())
			else:
				_knocks(pos + Vector2(randf_range(-200.0, 200.0), -40.0), 2)
				kind = "knock"
		"torch":
			if GameState.torch != null and GameState.torch.is_on:
				GameState.torch.flicker(randf_range(0.15, 0.4))
			else:
				_taps(pos + Vector2(randf_range(-140.0, 140.0), -20.0), 2)
				kind = "tap_behind"
		"sign":
			var sign_node := _nearest_in_group("signs", pos, 300.0)
			if sign_node != null and sign_node.has_method("flicker"):
				sign_node.flicker()
			else:
				_taps(pos + Vector2(randf_range(-140.0, 140.0), -20.0), 2)
				kind = "tap_behind"
	_last_alarm = kind
	GameState.mark_false_alarm()
	if GameState.debug:
		print("[pacing] false alarm: ", kind, " tension ", snappedf(tension, 0.01))


func _taps(at: Vector2, count: int) -> void:
	for i in count:
		if not is_inside_tree():
			return                      # the level went away mid-sequence
		AudioDirector.play_at("tap", at + Vector2(randf_range(-6.0, 6.0), 0), -8.0, 0.2, 320.0)
		await get_tree().create_timer(randf_range(0.25, 0.6)).timeout


func _knocks(at: Vector2, count: int) -> void:
	for i in count:
		if not is_inside_tree():
			return
		AudioDirector.play_at("knock", at, -4.0, 0.12, 700.0)
		await get_tree().create_timer(randf_range(0.35, 0.9)).timeout


func _nearest_in_group(group: String, pos: Vector2, reach: float) -> Node2D:
	var best: Node2D = null
	var best_d := reach
	for n in get_tree().get_nodes_in_group(group):
		var d: float = (n as Node2D).global_position.distance_to(pos)
		if d < best_d:
			best_d = d
			best = n
	return best
