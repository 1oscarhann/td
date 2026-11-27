extends CanvasLayer
## Post effects over the game world (under the UI): grain, vignette,
## desaturation, and chromatic aberration only from zone 3 on (design doc).

## Per zone: [grain, vignette, desaturate, aberration_px]
const ZONE_FX := {
	0: [0.05, 0.45, 0.10, 0.0],   # shop: flat, bored
	1: [0.07, 0.60, 0.25, 0.0],   # storeroom
	2: [0.08, 0.68, 0.30, 0.0],   # service tunnels
	3: [0.09, 0.72, 0.35, 0.6],
	4: [0.10, 0.78, 0.40, 1.0],
}

@onready var rect: ColorRect = $Screen

## The zone's base values (tweened), and the tension on top (scary phase 3).
var _grain := 0.07
var _vignette := 0.6
var _tension := 0.0


func _ready() -> void:
	add_to_group("post_fx")
	GameState.zone_changed.connect(apply_zone)
	apply_zone(GameState.zone)


func apply_zone(zone: int) -> void:
	var fx: Array = ZONE_FX.get(zone, ZONE_FX[2])
	var mat := rect.material as ShaderMaterial
	var tw := create_tween().set_parallel()
	tw.tween_property(self, "_grain", fx[0], 2.0)
	tw.tween_property(self, "_vignette", fx[1], 2.0)
	tw.tween_method(func(v): mat.set_shader_parameter("desaturate", v), float(mat.get_shader_parameter("desaturate")), fx[2], 2.0)
	mat.set_shader_parameter("aberration", fx[3])


## 0..1 from Pacing: more grain and a tighter vignette as dread builds.
func set_tension(t: float) -> void:
	_tension = t


func _process(_delta: float) -> void:
	var mat := rect.material as ShaderMaterial
	mat.set_shader_parameter("grain", _grain + 0.06 * _tension)
	mat.set_shader_parameter("vignette", _vignette + 0.20 * _tension)
