/* A boomerang that meets a wall glances off and turns for home at once. */
defineRicochet('boomerang', (p, comp) => {
  p.vel[comp] *= -0.6;
  p.ret = true;
  ricochetFx(p, comp, 0.5);
  return false;
});
