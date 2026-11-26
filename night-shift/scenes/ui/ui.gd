extends CanvasLayer
## Screen-space UI. No HUD on purpose: no health, no battery, no minimap.
## Just the bottom text, a fade layer, a title card and an F3 debug overlay.

@onready var fade_rect: ColorRect = $Fade
@onready var card: Label = $Card
@onready var debug_label: Label = $Debug


func fade_to(alpha: float, time: float) -> Tween:
	var tw := create_tween()
	tw.tween_property(fade_rect, "color:a", alpha, time)
	return tw


## Caught: cut straight to black. No gore, no animation.
func cut_to_black() -> void:
	fade_rect.color.a = 1.0


func show_card(text: String) -> void:
	card.text = text
	card.modulate.a = 0.0
	card.visible = true
	create_tween().tween_property(card, "modulate:a", 0.8, 2.0)


func set_debug(shown: bool, text := "") -> void:
	debug_label.visible = shown
	debug_label.text = text
