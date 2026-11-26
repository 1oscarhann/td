class_name InteractPrompt
extends Node2D
## A tiny, faint hold-E ring shown only when something is in reach.
## Hidden entirely in Zone 4 (per the design doc). No text, no HUD.

var _shown := false
var _progress := 0.0


func _ready() -> void:
	top_level = true  # positioned in world space over the interactable
	# Unshaded so it stays readable in the dark without being lit by anything.
	var mat := CanvasItemMaterial.new()
	mat.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	material = mat
	z_index = 20


func set_state(shown: bool, progress: float) -> void:
	shown = shown and GameState.zone < 4
	if shown == _shown and is_equal_approx(progress, _progress):
		return
	_shown = shown
	_progress = progress
	queue_redraw()


func _draw() -> void:
	if not _shown:
		return
	draw_arc(Vector2.ZERO, 4.0, 0.0, TAU, 16, Color(1, 1, 1, 0.25), 1.0)
	if _progress > 0.0:
		draw_arc(Vector2.ZERO, 4.0, -PI * 0.5, -PI * 0.5 + TAU * _progress, 16,
				Color(1, 1, 1, 0.75), 1.0)
