class_name LightTextures
extends RefCounted
## Procedural light textures, so the slice needs no image assets.
##
## Both write the same value into RGB and alpha, which keeps the falloff correct
## whichever channel the 2D light shader weights by.


## The torch beam: a cone pointing along +X from the texture centre.
## PointLight2D centres its texture on the node, so the beam starts at the hand.
## `bands` quantises the falloff into steps: pixel-art light, not a smooth HD glow.
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
			if d > length or d < 1.0:
				continue
			var a := absf(p.angle())
			if a > half:
				continue
			var radial := pow(1.0 - d / length, 0.55)
			# Soften the outer 35% of the cone's width.
			var edge := clampf((half - a) / (half * 0.35), 0.0, 1.0)
			var v := radial * edge
			if bands > 0:
				v = ceilf(v * bands) / bands
			img.set_pixel(x, y, Color(v, v, v, v))
	return ImageTexture.create_from_image(img)


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
