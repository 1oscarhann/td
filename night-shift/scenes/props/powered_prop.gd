class_name PoweredProp
extends Node2D
## Anything that runs off the mains: fluorescent tubes, the drinks fridge, the
## forecourt seen through the window. The power cut calls set_power(false).
##
## Builds its own light (and hum) from the exports so the scenes stay tiny.
## Lights use the ENVIRONMENT mask only: world lights never reveal creatures.

@export var light_energy := 1.0
@export var light_color := Color(0.85, 1.0, 0.92)
@export var light_size := 192
@export var light_offset := Vector2.ZERO
## Name of a looping AudioDirector sound ("buzz", "hum"), or empty.
@export var hum_sound := ""
@export var hum_volume_db := -22.0
## Sprite textures for on / off (optional: leave null to keep one texture).
@export var on_texture: Texture2D
@export var off_texture: Texture2D
## Sprite tint while powered (above 1 = glowing, e.g. a lit tube).
@export var lit_modulate := Color(1, 1, 1, 1)

var powered := true
var _light: PointLight2D
var _hum: AudioStreamPlayer2D
var _flicker_left := 0.0


func _ready() -> void:
	add_to_group("powered")
	if light_energy > 0.0:
		_light = PointLight2D.new()
		_light.texture = LightTextures.radial(light_size)
		_light.color = light_color
		_light.energy = light_energy
		_light.position = light_offset
		_light.range_item_cull_mask = GameState.LIGHT_ENV
		_light.shadow_enabled = true
		_light.shadow_item_cull_mask = GameState.LIGHT_ENV
		_light.height = 30.0
		add_child(_light)
	if hum_sound != "":
		_hum = AudioStreamPlayer2D.new()
		_hum.stream = AudioDirector.get_stream(hum_sound)
		_hum.volume_db = hum_volume_db
		_hum.max_distance = 260.0
		_hum.bus = AudioDirector.WORLD_BUS
		add_child(_hum)
	_apply(true)


func set_power(on: bool) -> void:
	powered = on
	_flicker_left = 0.0
	_apply(on)


## Lights stutter for a moment (scripted, never random).
func flicker(duration: float) -> void:
	_flicker_left = duration


func _process(delta: float) -> void:
	if _flicker_left <= 0.0:
		return
	_flicker_left -= delta
	if _flicker_left <= 0.0:
		_apply(powered)
	else:
		_apply(powered and randf() < 0.55)


func _apply(on: bool) -> void:
	if _light != null:
		_light.enabled = on
	if _hum != null:
		if on and not _hum.playing:
			_hum.play()
		elif not on and _hum.playing:
			_hum.stop()
	var sprite := get_node_or_null("Sprite") as Sprite2D
	if sprite != null:
		sprite.modulate = lit_modulate if on else Color(1, 1, 1, 1)
		if on and on_texture != null:
			sprite.texture = on_texture
		elif not on and off_texture != null:
			sprite.texture = off_texture
