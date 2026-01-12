# Plan: Black Hole Ray Tracer

Build a black hole ray tracer in Python that renders a Schwarzschild black hole with an accretion disk.

## Goals

- Render a black hole using the Schwarzschild metric
- Thin accretion disk (geometrically thin, optically thick)
- Background star field (random scatter points)
- Output images at multiple viewing angles
- Prioritize speed over physical accuracy - use approximations where sensible

## Technical approach

- Python with NumPy for ray math
- Matplotlib for rendering (pyplot, scatter markers for stars)
- Schwarzschild metric for light bending
- Euler integration or similar for photon paths (don't need RK4, keep it fast)
- Disk is flat, lies in equatorial plane
- Stars are just random points, rendered as small markers behind the black hole

## Outputs

Generate images at viewing angles: 5°, 25°, 45°, 70°, 85° from the disk plane.

Save as PNG files.

## Non-goals

- No relativistic doppler shift / redshift coloring (nice to have, not required)
- No volumetric disk (thin disk only)
- No movie / animation
- Doesn't need to be real-time
