class_name Act0
extends Node
## Act 0: the shift, then the power cut. Runs the shop's little script.
##
##  1. Lights on, no torch. Boring jobs: stack the crisps, mop the spill,
##     check the fridge. Nobody comes in.
##  2. After two jobs the lights stutter once ("the lights do that sometimes").
##  3. After the third (or after `max_shift_time` if you dawdle) the power dies:
##     tubes flicker and go, the fridge hum stops, the forecourt goes dark.
##     Only the battery EXIT sign stays lit.
##  4. "torch is under the counter" -> pick it up. The breaker does nothing.
##     The boarded panel can be pulled now, and the after-power triggers arm.
##
## The level creates the tasks/props and calls setup(). Everything here only
## talks to nodes through groups and signals.

signal power_changed(on: bool)

const SHIFT_TASKS := ["shelf", "mop", "fridge"]

## Seconds of shift before the power goes anyway.
@export var max_shift_time := 150.0
@export var delay_after_last_task := 5.0

var power_on := true
var _tasks_done := 0
var _shift_time := 0.0
var _cut_started := false
var _tasks: Dictionary = {}       # task_id -> ShopTask
var _panel: BoardedPanel
var _after_power: Array = []      # LevelTriggers armed by the cut
var door_x := 0.0


func setup(tasks: Array, panel: BoardedPanel, after_power_triggers: Array) -> void:
	for t: ShopTask in tasks:
		_tasks[t.task_id] = t
		t.completed.connect(_on_task_completed)
	_panel = panel
	_after_power = after_power_triggers
	if _panel != null:
		_panel.enabled = false
	for id in ["torch", "breaker"]:
		if _tasks.has(id):
			_tasks[id].enabled = false


func _process(delta: float) -> void:
	# "nobody comes in after two": standing by the front door for a while.
	var p = GameState.player
	if p != null and door_x != 0.0 and absf(p.global_position.x - door_x) < 50.0 and p.idle_time > 4.0:
		Narrator.say("nobody_after_two")
	if _cut_started:
		return
	_shift_time += delta
	if _shift_time >= max_shift_time:
		cut_power()


func _on_task_completed(task: ShopTask) -> void:
	match task.task_id:
		"torch":
			if GameState.torch != null:
				GameState.torch.set_available(true)
				GameState.torch.set_on(true)
		"cctv":
			var view = get_tree().get_first_node_in_group("cctv_view")
			if view != null:
				view.open()
		"breaker":
			AudioDirector.play_at("clunk", task.global_position, -2.0, 0.05)
			Narrator.say("breaker_wont_help")
		_:
			if task.task_id in SHIFT_TASKS:
				_tasks_done += 1
				if _tasks_done == 2:
					_flicker_all(1.0)
					Narrator.say("lights_sometimes")
				elif _tasks_done == SHIFT_TASKS.size() and not _cut_started:
					await get_tree().create_timer(delay_after_last_task).timeout
					cut_power()


func cut_power() -> void:
	if _cut_started:
		return
	_cut_started = true
	_flicker_all(1.8)
	await get_tree().create_timer(1.8).timeout
	power_on = false
	power_changed.emit(false)
	for p in get_tree().get_nodes_in_group("powered"):
		p.set_power(false)
	AudioDirector.play_ui("clunk", -6.0)
	if _tasks.has("torch"):
		_tasks["torch"].enabled = true
	if _tasks.has("breaker"):
		_tasks["breaker"].enabled = true
	if _panel != null:
		_panel.enabled = true
	for t: LevelTrigger in _after_power:
		t.arm()
	await get_tree().create_timer(2.5).timeout
	Narrator.say("torch_under_counter")


func _flicker_all(duration: float) -> void:
	for p in get_tree().get_nodes_in_group("powered"):
		p.flicker(duration)
