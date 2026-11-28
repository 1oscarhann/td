class_name LightTextures
extends RefCounted
## Procedural light textures, so the slice needs no image assets.
##
## Both write the same value into RGB and alpha, which keeps the falloff correct
## whichever channel the 2D light shader weights by.


## The torch beam: a cone pointing along +X from the texture centre.
## PointLight2D centres its texture on the node, so the beam starts at the hand.
## Brightness falls off smoothly to fully transparent at the far end and at the
## sides: no hard edge anywhere. `bands` > 0 optionally quantises the bright
## part into steps (it never applies to the fading tail).
static func cone(length: float, angle_deg: float, bands: int) -> ImageTexture:
	var size := int(ceilf(length)) * 2 + 2
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var centre := Vector2(size, size) * 0.5
	var half := deg_to_rad(angle_deg) * 0.5
	for y in size:
		for x in size:
			var p := Vector2(x + 0.5, y + 0.5) - centre
			var d := p.length()
			if d >= length or d < 1.0:
				continue
			var a := absf(p.angle())
			if a >= half:
				continue
			var r := d / length
			# Bright near the hand, then a long smooth tail that reaches exactly 0.
			var radial := pow(1.0 - r, 0.7) * smoothstep(1.0, 0.55, r)
			# Sides fade over the outer 45% of the cone's width.
			var edge := smoothstep(half, half * 0.55, a)
			var v := radial * edge
			if bands > 0 and v > 0.5:
				v = ceilf(v * bands) / bands
			img.set_pixel(x, y, Color(v, v, v, v))
	return ImageTexture.create_from_image(img)


## A cheap torch, not a clean cone: a narrow hot spot with the bright ring of
## the reflector round it, a dim wide spill outside that, and dirt on the lens:
## darker blotches and streaks that stay put in the beam. Fades to nothing at
## the far end and the edges. Points along +X from the texture centre.
static func torch_beam(length: float, spill_deg: float, hot_deg: float) -> ImageTexture:
	var size := int(ceilf(length)) * 2 + 2
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var centre := Vector2(size, size) * 0.5
	var spill := deg_to_rad(spill_deg) * 0.5
	var hot := deg_to_rad(hot_deg) * 0.5
	var noise := FastNoiseLite.new()
	noise.seed = 77
	noise.frequency = 0.045
	for y in size:
		for x in size:
			var p := Vector2(x + 0.5, y + 0.5) - centre
			var d := p.length()
			if d >= length or d < 1.0:
				continue
			var a := absf(p.angle())
			if a >= spill:
				continue
			var r := d / length
			var radial := pow(1.0 - r, 0.6) * smoothstep(1.0, 0.62, r)
			# Hot spot (semi-hard edge) + the reflector ring just inside its edge.
			var hot_v := smoothstep(hot, hot * 0.82, a)
			var ring := exp(-pow((a - hot * 0.86) / (hot * 0.07), 2.0)) * 0.4
			# Dim spill out to the full width.
			var spill_v := smoothstep(spill, spill * 0.6, a) * 0.2
			var v := radial * (maxf(hot_v + ring, spill_v))
			# Lens dirt: blotches in angle-space, so they stay fixed in the beam.
			var n := noise.get_noise_2d(a * 140.0, r * 40.0)
			v *= 0.82 + 0.18 * n
			if absf(p.angle() - hot * 0.35) < 0.012 or absf(p.angle() + hot * 0.55) < 0.009:
				v *= 0.6                                 # two dark streaks
			v = clampf(v, 0.0, 1.0)
			img.set_pixel(x, y, Color(v, v, v, v))
	return ImageTexture.create_from_image(img)


## Squashed soft ellipse: the torch spill pooling on the floor.
static func ellipse(width: int, height: int) -> GradientTexture2D:
	var t := radial(width)
	t.height = height
	return t


## Round, soft light: the player's dim glow, the exit sign.
static func radial(size: int) -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(0, 0, 0, 0))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.width = size
	t.height = size
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	return t
