extends WedgedThing
## Zone 2: the Wedged Thing is only ever SEEN here, never met (it stays dormant
## until zone 3). Same body, same legs and sounds, but a harmless puppet:
##
##  "eye":   it stands far down a tunnel. Point the torch that way and the eye
##           answers with one warm pixel. Walk towards it, or keep the light on it,
##           and it pulls back out of the beam. When you get there, it isn't.
##  "cross": a black silhouette crossing the end of a room in front of a working
##           light, when you come in. Gone when you get there.
##
## Not in the "creatures" group: deaths don't reset it, and once it's gone it
## stays gone.

@export var mode := "eye"
## cross: starts walking when the player's x passes this.
@export var trigger_x := 0.0
## cross: where it walks to before it's gone.
@export var to_x := 0.0
## eye: it leaves when you come this close (px along the tunnel).
@export var vanish_range := 170.0

var _started := false
var _leaving := false
var _glinted := 0.0
var _leave_time := 0.0


func _ready() -> void:
	super._ready()
	remove_from_group("creatures")
	puppet = true
	_active = true
	silhouette = mode == "cross"
	state = State.PATROL
	speed_override = 0.0
	if mode == "cross":
		visible = false


func reset() -> void:
	pass


func _physics_process(delta: float) -> void:
	_t += delta
	_state_time += delta
	var p = GameState.player
	if p == null:
		return
	if not _moving:
		_refresh_space()
	if mode == "eye":
		_eye(delta, p)
	else:
		_cross(p)
	if is_queued_for_deletion():
		return
	_update_glint(delta)
	_move(delta)
	_update_legs(delta)
	_update_audio(delta)
	_redraw()


func _eye(delta: float, p: Node2D) -> void:
	if _leaving:
		_leave_time += delta
		# Gone the moment it's out of the light (or after a while regardless).
		if (_leave_time > 0.8 and not GameState.is_lit(self) and not _glint_on) or _leave_time > 4.0:
			queue_free()
		return
	target_x = global_position.x
	if _glint_on:
		if _glinted == 0.0:
			GameState.mark_encounter("glimpse", "glimpse_eye", 1e9)
		_glinted += delta
	if absf(p.global_position.x - global_position.x) < vanish_range or _glinted > 1.2:
		# It pulls back, away from you, fast.
		_leaving = true
		dir = 1 if global_position.x > p.global_position.x else -1
		speed_override = 90.0
		target_x = global_position.x + float(dir) * 400.0
		AudioDirector.play_at("gurgle", _center(), -8.0, 0.08, 500.0)


func _cross(p: Node2D) -> void:
	if not _started:
		if p.global_position.x > trigger_x:
			_started = true
			visible = true
			GameState.mark_encounter("glimpse", "glimpse_cross", 1e9)
			speed_override = 32.0
			target_x = to_x
		return
	if absf(global_position.x - to_x) < 3.0 or _blocked:
		queue_free()
