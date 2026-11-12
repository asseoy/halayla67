// World glue: sky (moon, clouds, moonlight), desert props, the camp. Loaded by main.js as an optional module.
import { G } from './ctx.js';
import { createSky } from './sky.js';
import { buildProps } from './props.js';
import { buildCamp } from './camp.js';
import { buildTribe } from './tribe.js';

export async function init() {
  const sky = createSky();
  buildProps();
  const camp = buildCamp();
  const tribe = await buildTribe();
  G.world = {
    sky, camp, tribe,
    update(dt) { sky.update(dt); camp.update(dt); tribe.update(dt); },
    setQuality(hi) { /* props are cheap; nothing to swap yet */ },
  };
}
