# Lessons learned

- Enforcing non-root defaults is safer, but providing a `docker.user` override keeps custom images from breaking.
- Logging the applied network/limit settings makes it easier to verify hardening without attaching to containers.
