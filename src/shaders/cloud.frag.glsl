uniform sampler2D cloudTexture;
uniform vec3 sunDir;

varying vec2 vUv;

void main() {
    vec4 texel = texture2D(cloudTexture, vUv);

    float theta = (vUv.x - 0.5) * 6.28318530718;
    float phi = vUv.y * 3.14159265359;
    vec3 normal = vec3(cos(theta)*sin(phi), cos(phi), -sin(theta)*sin(phi));

    float intensity = dot(normal, sunDir);
    float alpha = smoothstep(-0.15, 0.05, intensity);

    // Sunset tint on clouds: 2-stop gradient, multiplicative
    float scatterMult = smoothstep(-0.15, 0.25, intensity) * smoothstep(0.25, -0.15, intensity);
    vec3 sunsetDeep = vec3(0.85, 0.2, 0.08);
    vec3 sunsetWarm = vec3(1.0, 0.55, 0.2);
    float gradPos = smoothstep(-0.12, 0.12, intensity);
    vec3 sunsetColor = mix(sunsetDeep, sunsetWarm, gradPos);
    vec3 cloudColor = mix(texel.rgb, texel.rgb * sunsetColor * 1.5, scatterMult * 0.6);

    gl_FragColor = vec4(cloudColor, texel.a * alpha);
}
