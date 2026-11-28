shader_type canvas_item;
render_mode unshaded;
// The night pass: what you can make out of a creature with no light on it.
// Whatever colour a part was drawn in becomes one of three night tones by its
// brightness: dark fills sink to near-black (darker than the walls, so the
// body reads as a silhouette), mid tones stay a cold dark grey, and highlights
// (rims, bone, nails, eyes) turn into a faint cold edge, so the outline and
// the joints still read. The torch pass on top shows the real thing.
uniform vec3 tone_dark : source_color = vec3(0.022, 0.022, 0.030);
uniform vec3 tone_mid : source_color = vec3(0.070, 0.074, 0.090);
uniform vec3 tone_light : source_color = vec3(0.36, 0.38, 0.43);

void fragment() {
	float l = dot(COLOR.rgb, vec3(0.299, 0.587, 0.114));
	vec3 c = mix(tone_dark, tone_mid, smoothstep(0.04, 0.26, l));
	c = mix(c, tone_light, smoothstep(0.34, 0.72, l));
	COLOR = vec4(c, COLOR.a);
}
