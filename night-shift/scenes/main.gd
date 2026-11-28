extends Node2D
## Main: wires the level, the player and the UI together, and runs the
## death / respawn and ending sequences.
##
## Death (open question in the doc): checkpoint restart. Cut to black the
## instant it has you, the caught sting, then two full seconds of total silence
## in the black. No gore. Back at the last checkpoint, creatures reset.

const START_LINE_DELAY := 0.8
## The sting plays out over the black, then this much silence.
const DEATH_STING_TIME := 2.2
const DEATH_SILENCE := 2.0

@onready var level = $Level
@onready var player: Player = $Player
@onready var ui = $UI

var _dying := false


func _ready() -> void:
	GameState.reset_run()
	Narrator.reset()
	# The level read GameState.zone in its own _ready (before this reset), so
	# re-apply: matters when the ending reloads the scene from a deeper zone.
	level._apply_zone(GameState.zone, true)
	GameState.player = player
	GameState.torch = player.torch
	player.global_position = level.player_start
	GameState.checkpoint = level.player_start
	level.apply_camera_limits(player.camera)
	player.snap_camera()
	# Act 0: the torch is under the counter until the power goes.
	player.torch.set_available(false)
	# The CCTV figure lives on visibility layer 2: only the CCTV feeds draw it.
	get_viewport().set_canvas_cull_mask_bit(1, false)
	var cctv: CCTVView = ui.get_node("CCTV")
	cctv.setup(level.cctv_feeds())
	cctv.closed.connect(func(n: int):
		if n == 1:
			Narrator.say("see"))
	GameState.player_caught.connect(_on_player_caught)
	level.ending_reached.connect(_on_ending_reached)

	ui.fade_to(0.0, 2.0)
	await get_tree().create_timer(START_LINE_DELAY).timeout
	Narrator.say("alone_tonight")


const DEBUG_GIZMOS := preload("res://scenes/ui/debug_gizmos.gd")
var _gizmos: Node2D = null
var _pacing_debug := false


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key != null and key.pressed and not key.echo:
		if key.keycode == KEY_F3:
			GameState.debug = not GameState.debug
			ui.set_debug(GameState.debug)
			if GameState.debug and _gizmos == null:
				_gizmos = DEBUG_GIZMOS.new()
				_gizmos.level = level
				level.add_child(_gizmos)
		elif key.keycode == KEY_F4:
			_pacing_debug = not _pacing_debug
			ui.set_pacing_debug(_pacing_debug)


func _process(_delta: float) -> void:
	if GameState.debug:
		ui.set_debug(true, _debug_text())
	if _pacing_debug:
		ui.set_pacing_debug(true, _pacing_text())


func _on_player_caught(_by: Node) -> void:
	if _dying:
		return
	_dying = true
	player.input_locked = true
	ui.cut_to_black()
	AudioDirector.set_world_silent(true)
	AudioDirector.play_ui("caught", -4.0)
	await get_tree().create_timer(DEATH_STING_TIME + DEATH_SILENCE).timeout
	player.respawn(GameState.checkpoint)
	level.reset_creatures()
	await get_tree().create_timer(0.4).timeout
	AudioDirector.set_world_silent(false)
	ui.fade_to(0.0, 1.5)
	player.input_locked = false
	_dying = false


## End of the slice. The basement doesn't stop: it just goes dark.
func _on_ending_reached() -> void:
	await get_tree().create_timer(6.0).timeout
	player.input_locked = true
	await ui.fade_to(1.0, 3.0).finished
	ui.show_card("night shift\n\nvertical slice")
	await get_tree().create_timer(6.0).timeout
	get_tree().reload_current_scene()


func _debug_text() -> String:
	var lines := PackedStringArray()
	# The Thing first, in plain words.
	var thing: WedgedThing = level.thing
	if thing != null and is_instance_valid(thing):
		var d: Dictionary = thing.debug_info()
		var st_col := {"Asleep": "#9a9a9a", "Patrolling": "#e8e8e0", "Noticed you": "#ffa040",
				"Chasing": "#ff4a3a", "Enraged": "#ff2020", "Searching": "#ffd84a", "Frozen (lit)": "#7fd8ff"}
		var knows_col: String = ["#5dff7a", "#ffd84a", "#ff4a3a"][int(d.knows_level)]
		lines.append("[b]THING:[/b] [color=%s]%s[/color]" % [st_col.get(d.state, "#ffffff"), d.state])
		lines.append("[color=%s]KNOWS WHERE YOU ARE: %s[/color]" % [knows_col, d.knows])
		lines.append("WHY: %s" % d.why)
		lines.append("CAN SEE YOU: %s   CAN HEAR YOU: %s   DISTANCE: %d px" % [
				"yes" if d.can_see else "no", "yes" if d.can_hear else "no", int(d.distance)])
		lines.append("NEXT: %s" % d.next)
	# One line each for the other creatures (the nearest of each kind).
	lines.append("[color=#9fb4c8]%s[/color]" % _creature_lines())
	lines.append("fps %d  zone %d  stamina %.1f%s" % [Engine.get_frames_per_second(), GameState.zone,
			player.stamina, " EXHAUSTED" if player.exhausted else ""])
	lines.append("torch %s  narrator cd %.0fs" % ["on" if player.torch.is_on else "off",
			Narrator.cooldown_left()])
	if thing != null and is_instance_valid(thing):
		lines.append("[color=#8a8a8a]%s  lit %s %.1fs[/color]" % [thing.debug_text(),
				GameState.is_lit(thing), GameState.get_lit_time(thing)])
	return "\n".join(lines)


## The nearest Ceiling Arm, Cable and Lure, one short line each.
func _creature_lines() -> String:
	var best := {}
	for c in level.get_node("Creatures").get_children():
		var kind := ""
		if c is CeilingArm:
			kind = "arm"
		elif c is CableCreature:
			kind = "cable"
		elif c is Lure and c.mode != "real":
			kind = "lure"
		if kind == "":
			continue
		var d: float = (c as Node2D).global_position.distance_to(player.global_position)
		if not best.has(kind) or d < float(best[kind][1]):
			best[kind] = [c, d]
	var out := PackedStringArray()
	if best.has("arm"):
		var a: CeilingArm = best.arm[0]
		var words := ["idle", "scratching", "reaching", "retracting"]
		out.append("Ceiling Arm: %s%s (%d px)" % [words[a.state], " [floor]" if a.from_floor else "", int(best.arm[1])])
	if best.has("cable"):
		var cb: CableCreature = best.cable[0]
		var words := ["disguised", "slithering", "grabbing", "retreating"]
		out.append("Cable: %s (%d px)" % [words[cb.state], int(best.cable[1])])
	if best.has("lure"):
		var l: Lure = best.lure[0]
		out.append("Lure: %s [%s] (%d px)" % ["revealed" if l._done else "waiting", l.mode, int(best.lure[1])])
	return "   ".join(out) if out.size() > 0 else "no other creatures nearby"


## F4: the pacing director.
func _pacing_text() -> String:
	var pc: Pacing = level.pacing
	var lines := PackedStringArray()
	if pc == null:
		return "no pacing here"
	var t := pc.tension
	var bar := "|".repeat(int(round(t * 20.0)))
	var col := "#5dff7a" if t < 0.35 else ("#ffd84a" if t < 0.7 else "#ff4a3a")
	lines.append("[b]TENSION:[/b] [color=%s]%.2f %s[/color]" % [col, t, bar])
	lines.append("SINCE LAST ENCOUNTER: %.0f s" % pc.seconds_since_encounter())
	var alarm := ""
	if GameState.zone < 1:
		alarm = "off (the shop)"
	elif pc.in_safe:
		alarm = "paused (safe room)"
	elif pc.is_silent():
		alarm = "paused (silence, %.1f s)" % pc._silent_left
	elif pc.seconds_since_encounter() < pc.quiet_after_encounter:
		alarm = "paused (just after an encounter, %.1f s)" % (pc.quiet_after_encounter - pc.seconds_since_encounter())
	elif pc._thing_near(player, 320.0) > 0.0:
		alarm = "paused (the Thing is within 320 px)"
	else:
		alarm = "in %.1f s" % maxf(0.0, pc._alarm_timer)
	lines.append("NEXT FALSE ALARM: %s" % alarm)
	lines.append("ZONE: %d" % GameState.zone)
	return "\n".join(lines)
