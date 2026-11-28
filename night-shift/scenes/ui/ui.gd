extends CanvasLayer
## Screen-space UI. No HUD on purpose: no health, no battery, no minimap.
## Just the bottom text, a fade layer, a title card, and two debug overlays:
## F3 (the Thing and the other creatures) and F4 (pacing).

@onready var fade_rect: ColorRect = $Fade
@onready var card: Label = $Card
@onready var debug_label: Label = $Debug

var _debug_rich: RichTextLabel
var _pacing_rich: RichTextLabel


func _ready() -> void:
	_debug_rich = _make_overlay(Vector2(4, 4), 372.0)
	_pacing_rich = _make_overlay(Vector2(640 - 4 - 188, 4), 188.0)


func _make_overlay(pos: Vector2, width: float) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.position = pos
	r.custom_minimum_size = Vector2(width, 0)
	r.size = Vector2(width, 10)
	r.add_theme_font_size_override("normal_font_size", 9)
	r.add_theme_font_size_override("bold_font_size", 9)
	r.add_theme_color_override("default_color", Color(0.86, 0.9, 0.86))
	r.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1))
	r.add_theme_constant_override("shadow_offset_x", 1)
	r.add_theme_constant_override("shadow_offset_y", 1)
	r.add_theme_constant_override("line_separation", -1)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.6)
	bg.content_margin_left = 3.0
	bg.content_margin_right = 3.0
	bg.content_margin_top = 2.0
	bg.content_margin_bottom = 2.0
	r.add_theme_stylebox_override("normal", bg)
	r.visible = false
	add_child(r)
	return r


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


## F3. `text` is BBCode.
func set_debug(shown: bool, text := "") -> void:
	debug_label.visible = false
	_debug_rich.visible = shown
	if shown:
		_debug_rich.text = text


## F4. `text` is BBCode.
func set_pacing_debug(shown: bool, text := "") -> void:
	_pacing_rich.visible = shown
	if shown:
		_pacing_rich.text = text
